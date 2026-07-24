import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import type { DecisionRuntimeTickBundle } from './decision-runtime-kernel.types';
import type { HydratedGovernanceRuntimeContext } from '../../governance/activation/governance-activation.types';
import type { RuntimeBranchDirective } from '../../governance/activation/runtime/runtime-branch-directive.types';
import type { StructuredGovernanceRuntimeTraceV1 } from '../../governance/activation/runtime/build-structured-governance-runtime-trace.util';
import { buildAgentTurnContract, canonicalTripIdForRouteAndRunRequest } from '../contracts/agent-turn-contract.v1';
import { buildControlledReplanningContext } from '../../governance/replanning-runtime/build-controlled-replanning-context.util';
import { buildStructuredGovernanceRuntimeTraceV1 } from '../../governance/activation/runtime/build-structured-governance-runtime-trace.util';
import { routeGovernanceActivationsToRuntimeBranch } from '../../governance/activation/runtime/governance-activation-router.util';
import type { GovernanceHydrationService } from '../../governance/activation/governance-hydration.service';
import type { DecisionOsContextAssemblerService } from './decision-os-context-assembler.service';
import type { LlmIntentCompilerService } from './llm-intent-compiler.service';
import { DecisionOsExecutionContext } from './decision-os-execution-context';
import type { RouteAndRunTaskProgressReporter } from './route-and-run-task-progress.reporter';

export type GovernanceDosHydrateInput = {
  request: RouteAndRunRequestDto;
  memory: AgentMemoryContext;
  bundle: DecisionRuntimeTickBundle;
  replayAnchor?: string;
  replayStrictSeal: boolean;
  governanceHydration?: GovernanceHydrationService;
  decisionOsContextAssembler?: DecisionOsContextAssemblerService;
  llmIntentCompiler?: LlmIntentCompilerService;
  progressReporter?: RouteAndRunTaskProgressReporter;
  logger?: { warn?: (msg: string) => void; log?: (msg: string) => void };
};

export type GovernanceDosHydrateResult = {
  governanceRuntime?: HydratedGovernanceRuntimeContext;
  runtimeDirective: RuntimeBranchDirective;
  governanceStructuredTrace?: StructuredGovernanceRuntimeTraceV1;
  dosExecutionContext?: DecisionOsExecutionContext;
};

/**
 * Tick Phase 4–6：Governance Evaluate → DOS Assemble → Intent Compile（planDelta 内嵌于 DOS）。
 */
export async function hydrateGovernanceAndDosContext(
  input: GovernanceDosHydrateInput,
): Promise<GovernanceDosHydrateResult> {
  const { request, memory, bundle, replayAnchor, replayStrictSeal } = input;
  const govStart = Date.now();

  const canonicalTripId = canonicalTripIdForRouteAndRunRequest(request);
  let governanceRuntime: HydratedGovernanceRuntimeContext | undefined;

  if (canonicalTripId && input.governanceHydration && !replayAnchor) {
    try {
      const driftInjectionEnabled =
        process.env.GOVERNANCE_DRIFT_FEEDBACK_INJECTION === 'true' ||
        (request.options as { governance_drift_feedback_injection?: boolean } | undefined)
          ?.governance_drift_feedback_injection === true;
      governanceRuntime = await input.governanceHydration.hydrateGovernanceSnapshot(canonicalTripId, {
        allowDriftFeedbackInjection: driftInjectionEnabled,
      });
    } catch (err: unknown) {
      input.logger?.warn?.(
        `[GovernanceRuntime] hydrate failed trip_id=${canonicalTripId} err=${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const runtimeDirective: RuntimeBranchDirective = governanceRuntime
    ? routeGovernanceActivationsToRuntimeBranch(governanceRuntime)
    : { branchType: 'normal_execution', sourceActivationIds: [] };

  (request as RouteAndRunRequestDto & { __runtimeBranchDirective?: RuntimeBranchDirective }).__runtimeBranchDirective =
    runtimeDirective;

  const governanceStructuredTrace: StructuredGovernanceRuntimeTraceV1 | undefined =
    governanceRuntime && canonicalTripId
      ? buildStructuredGovernanceRuntimeTraceV1({
          tripId: canonicalTripId,
          hydrated: governanceRuntime,
          directive: runtimeDirective,
        })
      : undefined;

  (request as RouteAndRunRequestDto & {
    __governanceStructuredTrace?: StructuredGovernanceRuntimeTraceV1;
  }).__governanceStructuredTrace = governanceStructuredTrace;

  if (governanceRuntime) {
    (request as RouteAndRunRequestDto & { __controlledReplanningContext?: unknown }).__controlledReplanningContext =
      buildControlledReplanningContext({
        directive: runtimeDirective,
        hydrated: governanceRuntime,
        userMessage: request.message,
      });
    (request as RouteAndRunRequestDto & { governance_runtime_state?: unknown }).governance_runtime_state =
      governanceRuntime.runtimeState;
    (request as RouteAndRunRequestDto & { governance_drift_influences?: unknown }).governance_drift_influences =
      governanceRuntime.driftInfluences ?? [];
  } else {
    (request as RouteAndRunRequestDto & { __controlledReplanningContext?: unknown }).__controlledReplanningContext =
      undefined;
    (request as RouteAndRunRequestDto & { governance_runtime_state?: unknown }).governance_runtime_state =
      undefined;
    (request as RouteAndRunRequestDto & { governance_drift_influences?: unknown }).governance_drift_influences =
      [];
  }

  (request as RouteAndRunRequestDto & { __agentTurnContract?: unknown }).__agentTurnContract =
    buildAgentTurnContract({
      request,
      memory,
      governanceRuntime: governanceRuntime ?? null,
    });

  bundle.tickObs.phases.push({
    phase: 'GOVERNANCE_EVALUATE',
    at: new Date().toISOString(),
    duration_ms: Date.now() - govStart,
  });

  let dosExecutionContext: DecisionOsExecutionContext | undefined;
  let compileSource = 'skipped';
  if (!replayStrictSeal && input.decisionOsContextAssembler) {
    const dosStart = Date.now();
    dosExecutionContext = await input.decisionOsContextAssembler.assemble({
      request,
      memory,
      governance: governanceRuntime ?? null,
    });
    (request as RouteAndRunRequestDto & { __dosExecutionContext?: DecisionOsExecutionContext }).__dosExecutionContext =
      dosExecutionContext;
    (request as RouteAndRunRequestDto & { __dosExecutionContextObs?: unknown }).__dosExecutionContextObs =
      dosExecutionContext.toObservabilitySlice();

    bundle.tickObs.phases.push({
      phase: 'DOS_ASSEMBLE',
      at: new Date().toISOString(),
      duration_ms: Date.now() - dosStart,
    });

    const compileStart = Date.now();
    compileSource = 'none';
    if (input.llmIntentCompiler) {
      const compiled = await input.llmIntentCompiler.compileToDelta(request, dosExecutionContext);
      compileSource = compiled.source;
      if (compiled.deltas.length > 0 || compiled.source !== 'none') {
        dosExecutionContext = DecisionOsExecutionContext.withPlanDelta(
          dosExecutionContext,
          request,
          compiled.deltas,
        );
        (request as RouteAndRunRequestDto & { __dosExecutionContext?: DecisionOsExecutionContext }).__dosExecutionContext =
          dosExecutionContext;
        (request as RouteAndRunRequestDto & { __dosExecutionContextObs?: unknown }).__dosExecutionContextObs =
          dosExecutionContext.toObservabilitySlice();
        (request as RouteAndRunRequestDto & { __intentCompileSource?: string }).__intentCompileSource =
          compiled.source;
      }
    }

    bundle.tickObs.phases.push({
      phase: 'INTENT_COMPILE',
      at: new Date().toISOString(),
      duration_ms: Date.now() - compileStart,
    });
    await input.progressReporter?.reportOrchestrationStep('INTENT_COMPILE');
  }

  input.logger?.log?.(
    `[DecisionRuntimeKernel] governance+dos trip_id=${canonicalTripId ?? 'n/a'} delta=${dosExecutionContext?.planDelta.length ?? 0} compile=${compileSource}`,
  );

  return {
    governanceRuntime,
    runtimeDirective,
    governanceStructuredTrace,
    dosExecutionContext,
  };
}
