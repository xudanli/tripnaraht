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
    const payload: ExecutionEngineRunPayload = { request, control, decision };
    const profile = this.resolveProfile(decision, control?.modeHint);

    traceEmitter?.emit({
      type: 'ENGINE_SELECT',
      input: {
        decision,
        request_id: request.request_id,
        trip_id: request.trip_id,
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
