import { Injectable } from '@nestjs/common';
import type {
  ExecutionControlContext,
  ExecutionDecision,
  ExecutionEngineType,
} from '../contracts/execution-control-policy.types';
import type { ExecutionKernel } from '../contracts/execution-semantic-field.types';
import type {
  ExecutionEngineRunPayload,
  ExecutionEngineRunners,
  ExecutionEngineRuntimeProfile,
} from '../contracts/execution-engine-runtime.types';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ExecutionTraceEmitter } from '../utils/execution-trace.emitter';
import { projectKernelToLegacyTier } from '../utils/legacy-execution-projection.util';
import type { AgentTurnContractV1 } from '../contracts/agent-turn-contract.v1';
import { canonicalTripIdForRouteAndRunRequest } from '../contracts/agent-turn-contract.v1';
import type { AgentTurnPolicyAppliedTag } from '../contracts/agent-turn-contract-trace-seal.v1';
import { resolveAgentTurnPolicyAppliedV1 } from '../contracts/agent-turn-contract-trace-seal.v1';

export type EngineContractValidationResult =
  | { status: 'skipped'; reason: 'no_contract' }
  | {
      status: 'ok';
      contract: AgentTurnContractV1;
      policy_applied: AgentTurnPolicyAppliedTag;
    }
  | { status: 'mismatch'; issues: string[]; contract: AgentTurnContractV1 };

/**
 * Bridge Gateway-sealed {@link AgentTurnContractV1} into engine dispatch (signature-stable).
 * When a contract is present, {@link ExecutionEngineRouterService.run} fail-fast on identity/hint drift.
 */
export class EngineContractAdapter {
  /**
   * If `request.__agentTurnContract` exists (Gateway), ensure it still matches the live request
   * (audit: proves runners did not bypass the pre-execution seal).
   */
  static validateContract(request: RouteAndRunRequestDto): EngineContractValidationResult {
    const contract = (request as { __agentTurnContract?: AgentTurnContractV1 }).__agentTurnContract;
    if (contract == null) {
      return { status: 'skipped', reason: 'no_contract' };
    }
    const issues: string[] = [];
    if (contract.input.request_id !== request.request_id) {
      issues.push('request_id_drift');
    }
    if (contract.input.user_id !== request.user_id) {
      issues.push('user_id_drift');
    }
    const liveTrip = canonicalTripIdForRouteAndRunRequest(request);
    if ((contract.input.trip_id ?? null) !== (liveTrip ?? null)) {
      issues.push('trip_id_drift');
    }
    const optHint = request.options?.execution_model_runtime_hint?.trim() || null;
    const sealedHint = contract.profile.execution_model_runtime_hint;
    if (optHint !== sealedHint) {
      issues.push('execution_model_runtime_hint_drift');
    }
    if (issues.length > 0) {
      return { status: 'mismatch', issues, contract };
    }
    const policy_applied = resolveAgentTurnPolicyAppliedV1({
      contract,
      taskType: '',
      readonly_mode: request.options?.readonly_mode,
    });
    return { status: 'ok', contract, policy_applied };
  }
}

/**
 * Execution Engine Router — ECPS `ExecutionDecision.kernel` → legacy runner via projection.
 *
 * Legacy AgentService / orchestrator branches are injected via `ExecutionEngineRunners` until extracted.
 *
 * Optional `traceEmitter` — ETK: kernel selection is emitted as a verifiable step before dispatch.
 */
@Injectable()
export class ExecutionEngineRouterService {
  /** Pure ECPS → observability profile (no I/O). */
  resolveProfile(
    decision: ExecutionDecision,
    modeHint?: ExecutionControlContext['modeHint'],
  ): ExecutionEngineRuntimeProfile {
    const engine = projectKernelToLegacyTier(decision.kernel, modeHint);
    return {
      kernel: decision.kernel,
      engine,
      capabilities: this.capabilitiesFor(engine),
    };
  }

  /** Fail-fast contract checks — ExecutionDecision is authoritative, not a hint. */
  assertDecisionContract(decision: ExecutionDecision): void {
    if (!decision?.kernel) {
      throw new Error('ECPS_CONTRACT_MISSING_KERNEL');
    }
    const kernels: ExecutionKernel[] = [
      'REFLEX_KERNEL',
      'LIGHTWEIGHT_KERNEL',
      'REASONING_KERNEL',
      'WORKFLOW_KERNEL',
    ];
    if (!kernels.includes(decision.kernel)) {
      throw new Error(`ECPS_CONTRACT_UNKNOWN_KERNEL:${decision.kernel}`);
    }
  }

  /**
   * Single execution kernel entry — callers supply engine implementations (thin adapters over legacy code).
   */
  async run(
    decision: ExecutionDecision,
    request: RouteAndRunRequestDto,
    control: ExecutionControlContext | undefined,
    runners: ExecutionEngineRunners,
    traceEmitter?: ExecutionTraceEmitter,
  ): Promise<RouteAndRunResponseDto> {
    this.assertDecisionContract(decision);
    const contractGate = EngineContractAdapter.validateContract(request);
    if (contractGate.status === 'mismatch') {
      throw new Error(`ENGINE_CONTRACT_MISMATCH:${contractGate.issues.join(',')}`);
    }
    const payload: ExecutionEngineRunPayload = { request, control, decision };
    const profile = this.resolveProfile(decision, control?.modeHint);

    traceEmitter?.emit({
      type: 'ENGINE_SELECT',
      input: {
        decision,
        request_id: request.request_id,
        trip_id: request.trip_id,
        ...(contractGate.status === 'ok'
          ? {
              agent_turn_contract: {
                policy_applied: contractGate.policy_applied,
                execution_affinity: contractGate.contract.execution_affinity,
                execution_model_runtime_hint: contractGate.contract.profile.execution_model_runtime_hint,
              },
            }
          : {}),
      },
      output: {
        kernel: decision.kernel,
        engine: profile.engine,
        profile,
      },
    });

    switch (profile.engine) {
      case 'SYSTEM1':
        return runners.system1(payload);
      case 'LIGHTWEIGHT_QA':
        return runners.lightweightQa(payload);
      case 'SYSTEM2_REACT':
        return runners.system2React(payload);
      case 'SYSTEM2_STATE_MACHINE':
        return runners.system2StateMachine(payload);
      default: {
        const _exhaustive: never = profile.engine;
        return _exhaustive;
      }
    }
  }

  private capabilitiesFor(engine: ExecutionEngineType): ExecutionEngineRuntimeProfile['capabilities'] {
    switch (engine) {
      case 'SYSTEM1':
        return { toolLoop: false, openEndedReasoning: false, workflowConstraints: false };
      case 'LIGHTWEIGHT_QA':
        return { toolLoop: false, openEndedReasoning: false, workflowConstraints: false };
      case 'SYSTEM2_REACT':
        return { toolLoop: true, openEndedReasoning: true, workflowConstraints: false };
      case 'SYSTEM2_STATE_MACHINE':
        return { toolLoop: true, openEndedReasoning: false, workflowConstraints: true };
      default: {
        const _e: never = engine;
        return _e;
      }
    }
  }
}
