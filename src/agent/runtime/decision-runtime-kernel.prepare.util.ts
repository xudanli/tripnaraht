import { randomUUID } from 'crypto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import type { AgentExecutionContext } from './agent-execution-context.interface';
import { freezeAgentMemorySnapshot } from '../memory/utils/memory-snapshot-freeze.util';
import { deriveMemoryLedgerPhaseFromTripTask } from '../memory/decision-ledger/decision-ledger-world-anchor.util';
import { planLedgerRecomputeOrder } from '../memory/decision-ledger/decision-ledger-invalidation.util';
import {
  isLedgerReconcileBlockingPhase,
  LEDGER_RECONCILE_POLICY,
} from '../engine/execution-gateway.config';
import { LedgerRecomputeEscalationException } from '../engine/ledger-recompute-escalation.exception';
import { buildLedgerHealingObservabilityV1 } from '../memory/decision-ledger/ledger-healing-observability.util';
import type { LedgerRecomputeStepV1 } from '../memory/decision-ledger/ledger-recompute.types';
import type { ReconcileResultV1 } from '../memory/decision-ledger/incremental-recompute-orchestrator.types';
import type {
  DecisionRuntimeTickBundle,
  DecisionRuntimeTickObservabilityV1,
} from './decision-runtime-kernel.types';

/** Kernel 依赖的 Agent 能力子集（避免整包 AgentService 耦合） */
export type DecisionRuntimeKernelAgentDeps = {
  memoryContextAssembler: {
    loadForRouteAndRun: (request: RouteAndRunRequestDto) => Promise<AgentMemoryContext>;
    buildObservability: (memory: AgentMemoryContext) => unknown;
  };
  hydrateRequestFitnessIfNeeded: (
    request: RouteAndRunRequestDto,
    memory: AgentMemoryContext,
  ) => Promise<void>;
  memorySnapshotPersistence?: {
    loadBySnapshotId: (id: string) => Promise<AgentMemoryContext | null>;
    persistSerializableSnapshot: (memory: AgentMemoryContext) => Promise<void>;
    loadLatestContextForTrip: (tripId: string) => Promise<AgentMemoryContext | null>;
  };
  ledgerRecomputeExecutor?: {
    buildExecutionPlan: (ledger: NonNullable<AgentMemoryContext['decisionLedger']>) => {
      invalidatedSteps: LedgerRecomputeStepV1[];
      staleSteps: { length: number };
    };
  };
  incrementalRecomputeOrchestrator?: {
    reconcile: (
      tripId: string,
      opts: { maxRetries: number },
    ) => Promise<ReconcileResultV1>;
  };
  agentExecutionContextFactory: {
    createFromFrozenMemory: (memory: AgentMemoryContext) => AgentExecutionContext;
  };
  getEntryResponses: () => {
    createReplayMemoryPersistenceUnavailableResponse: (
      request: RouteAndRunRequestDto,
      wallStart: number,
    ) => RouteAndRunResponseDto;
    createReplayMemorySnapshotNotFoundResponse: (
      request: RouteAndRunRequestDto,
      wallStart: number,
      anchor: string,
    ) => RouteAndRunResponseDto;
  };
  logger?: { warn?: (msg: string) => void };
};

export type PrepareTickResult = {
  bundle: DecisionRuntimeTickBundle;
  earlyResponse?: RouteAndRunResponseDto;
};

function beginTickObs(requestId: string, replayAnchor?: string): DecisionRuntimeTickObservabilityV1 {
  return {
    revision: 'v1',
    tick_id: randomUUID(),
    request_id: requestId,
    phases: [],
    ...(replayAnchor ? { replay_anchor: replayAnchor } : {}),
  };
}

function recordPhase(
  obs: DecisionRuntimeTickObservabilityV1,
  phase: DecisionRuntimeTickObservabilityV1['phases'][0]['phase'],
  startedAt: number,
): void {
  obs.phases.push({
    phase,
    at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
  });
}

/**
 * Tick Phase 1–3：Memory Hydrate → Ledger Reconcile → MVCC Freeze。
 */
export async function prepareDecisionRuntimeTick(
  deps: DecisionRuntimeKernelAgentDeps,
  request: RouteAndRunRequestDto,
  wallStart: number,
): Promise<PrepareTickResult> {
  const replayAnchor = request.options?.orchestration_replay_anchor_snapshot_id?.trim();
  const tickObs = beginTickObs(request.request_id, replayAnchor || undefined);

  const hydrateStart = Date.now();
  let memory: AgentMemoryContext;
  if (replayAnchor) {
    const persistence = deps.memorySnapshotPersistence;
    if (!persistence) {
      recordPhase(tickObs, 'MEMORY_HYDRATE', hydrateStart);
      return {
        bundle: stubBundle(request, wallStart, tickObs, replayAnchor),
        earlyResponse: deps
          .getEntryResponses()
          .createReplayMemoryPersistenceUnavailableResponse(request, wallStart),
      };
    }
    const loaded = await persistence.loadBySnapshotId(replayAnchor);
    if (!loaded || String(loaded.snapshotId ?? '').trim() !== replayAnchor) {
      recordPhase(tickObs, 'MEMORY_HYDRATE', hydrateStart);
      return {
        bundle: stubBundle(request, wallStart, tickObs, replayAnchor),
        earlyResponse: deps
          .getEntryResponses()
          .createReplayMemorySnapshotNotFoundResponse(request, wallStart, replayAnchor),
      };
    }
    memory = { ...loaded, requestId: request.request_id };
  } else {
    memory = await deps.memoryContextAssembler.loadForRouteAndRun(request);
    await deps.hydrateRequestFitnessIfNeeded(request, memory);
  }
  recordPhase(tickObs, 'MEMORY_HYDRATE', hydrateStart);

  const ledgerStart = Date.now();
  if (
    !replayAnchor &&
    request.trip_id &&
    String(request.trip_id).trim() !== '' &&
    memory.decisionLedger &&
    deps.ledgerRecomputeExecutor
  ) {
    const tripId = String(request.trip_id).trim();
    const phase = deriveMemoryLedgerPhaseFromTripTask(memory.activeTripState);
    const execPlan = deps.ledgerRecomputeExecutor.buildExecutionPlan(memory.decisionLedger);
    const hasInv = execPlan.invalidatedSteps.length > 0;
    if (hasInv) {
      const blocking = isLedgerReconcileBlockingPhase(phase);
      const initialInv = execPlan.invalidatedSteps.length;
      if (blocking && deps.incrementalRecomputeOrchestrator && deps.memorySnapshotPersistence) {
        memory.observability.layers.push('ledger_reconcile_blocking_start');
        const result = await deps.incrementalRecomputeOrchestrator.reconcile(tripId, {
          maxRetries: LEDGER_RECONCILE_POLICY.MAX_RETRIES,
        });
        (request as RouteAndRunRequestDto & { __ledgerHealingObs?: unknown }).__ledgerHealingObs =
          buildLedgerHealingObservabilityV1({
            initialInvalidatedCount: initialInv,
            ranBlockingReconcile: true,
            reconcileResult: result,
            invalidatedNodeIds: execPlan.invalidatedSteps.map((s) => s.nodeId),
          });
        if (result.status === 'CONVERGED') {
          const refreshed = await deps.memorySnapshotPersistence.loadLatestContextForTrip(tripId);
          if (refreshed) {
            memory = { ...refreshed, requestId: request.request_id };
            memory.observability.layers.push('ledger_reconcile_converged');
          } else if (result.finalLedger) {
            memory = {
              ...memory,
              decisionLedger: result.finalLedger,
              ledgerRecomputePlan: planLedgerRecomputeOrder(result.finalLedger),
              snapshotVersion: result.snapshotVersion ?? memory.snapshotVersion,
            };
            memory.observability.layers.push('ledger_reconcile_converged_merge_local');
          } else {
            memory.observability.layers.push('ledger_reconcile_converged_no_ledger_payload');
          }
        } else if (LEDGER_RECONCILE_POLICY.ABORT_ON_ESCALATION) {
          throw new LedgerRecomputeEscalationException(result);
        } else {
          memory.observability.layers.push(`ledger_reconcile_blocking_nonfatal:${result.status}`);
        }
      } else if (blocking && (!deps.incrementalRecomputeOrchestrator || !deps.memorySnapshotPersistence)) {
        memory.observability.layers.push('ledger_reconcile_blocking_skipped_missing_deps');
        (request as RouteAndRunRequestDto & { __ledgerHealingObs?: unknown }).__ledgerHealingObs =
          buildLedgerHealingObservabilityV1({
            initialInvalidatedCount: initialInv,
            ranBlockingReconcile: false,
            skippedMissingDeps: true,
            invalidatedNodeIds: execPlan.invalidatedSteps.map((s) => s.nodeId),
          });
        deps.logger?.warn?.(
          `[LedgerReconcile] blocking phase=${phase} skipped request_id=${request.request_id}`,
        );
      } else {
        memory.observability.layers.push('ledger_reconcile_advisory_hint');
        (request as RouteAndRunRequestDto & { __ledgerPendingPlan?: unknown }).__ledgerPendingPlan =
          execPlan;
        (request as RouteAndRunRequestDto & { __ledgerHealingObs?: unknown }).__ledgerHealingObs =
          buildLedgerHealingObservabilityV1({
            initialInvalidatedCount: initialInv,
            ranBlockingReconcile: false,
            advisoryDeferred: true,
            invalidatedNodeIds: execPlan.invalidatedSteps.map((s) => s.nodeId),
          });
      }
    }
  }

  if (deps.ledgerRecomputeExecutor && memory.decisionLedger) {
    const plan = memory.ledgerRecomputePlan;
    const hasTopo =
      !!plan &&
      (plan.orderedNodeIds.length > 0 || (plan.unorderedFallbackNodeIds?.length ?? 0) > 0);
    const hasStale = memory.decisionLedger.nodes.some((n) => n.status === 'STALE');
    if (hasTopo || hasStale) {
      (request as RouteAndRunRequestDto & { __ledgerRecomputeExecution?: unknown }).__ledgerRecomputeExecution =
        deps.ledgerRecomputeExecutor.buildExecutionPlan(memory.decisionLedger);
      const ex = (request as RouteAndRunRequestDto & {
        __ledgerRecomputeExecution?: { invalidatedSteps: { length: number }; staleSteps: { length: number } };
      }).__ledgerRecomputeExecution;
      if (ex?.invalidatedSteps.length) {
        memory.observability.layers.push('ledger_full_replan_hint');
      }
      if (ex?.staleSteps.length) {
        memory.observability.layers.push('ledger_stale_refresh_hint');
      }
    }
  }
  recordPhase(tickObs, 'LEDGER_RECONCILE', ledgerStart);

  const freezeStart = Date.now();
  void deps.memorySnapshotPersistence?.persistSerializableSnapshot(memory);
  freezeAgentMemorySnapshot(memory);
  (request as RouteAndRunRequestDto & { __memoryContractObs?: unknown }).__memoryContractObs =
    deps.memoryContextAssembler.buildObservability(memory);
  const execCtxBase = deps.agentExecutionContextFactory.createFromFrozenMemory(memory);
  const goldenChainSpanId = randomUUID();
  const execCtx: AgentExecutionContext = { ...execCtxBase, activeParentSpanId: goldenChainSpanId };
  recordPhase(tickObs, 'MVCC_FREEZE', freezeStart);

  return {
    bundle: {
      tickId: tickObs.tick_id,
      wallStart,
      replayAnchor: replayAnchor || undefined,
      memory,
      execCtx,
      goldenChainSpanId,
      tickObs,
    },
  };
}

function stubBundle(
  request: RouteAndRunRequestDto,
  wallStart: number,
  tickObs: DecisionRuntimeTickObservabilityV1,
  replayAnchor: string,
): DecisionRuntimeTickBundle {
  const emptyMemory = {
    snapshotId: 'stub',
    snapshotVersion: 0,
    requestId: request.request_id,
    userId: null,
    tripId: null,
    userProfile: null,
    userBasics: null,
    travelPreference: null,
    routePartyProfile: null,
    recentDecisions: [],
    decisionLedger: null,
    ledgerRecomputePlan: null,
    recentWorldDecisions: [],
    activeTripState: null,
    recoveryHistory: [],
    failurePatterns: [],
    loadedAt: new Date().toISOString(),
    observability: { layers: [] },
  } satisfies AgentMemoryContext;

  return {
    tickId: tickObs.tick_id,
    wallStart,
    replayAnchor,
    memory: emptyMemory,
    execCtx: {
      requestId: request.request_id,
      snapshotId: 'stub',
      snapshotVersion: 0,
      executionBinding: {
        snapshot_id: 'stub',
        snapshot_version: 0,
        request_id: request.request_id,
      },
    },
    goldenChainSpanId: randomUUID(),
    tickObs,
  };
}
