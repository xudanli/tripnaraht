/**
 * State & Learning 薄挂：WorldState 投影回显 / Apply→Ledger / Outcome→Ledger。
 * 不新增 Runtime / 路由 / Guard；Memory 仍不得当 Truth。
 */

import type { AgentTaskContractV1 } from '../harness/agent-task-contract.types';
import type { LiveExecutionConclusionV1 } from '../harness/live-execution-runtime.util';
import {
  projectTravelWorldState,
  projectTravelWorldStateForObservability,
  type ProjectTravelWorldStateInput,
} from './project-travel-world-state.util';
import type { TravelWorldStateV1 } from './travel-world-state.types';
import {
  getDefaultTravelEventLedger,
  type TravelEventLedgerStore,
} from './travel-event-ledger.store';
import {
  buildOutcomeReconciliation,
  projectOutcomeForObservability,
  type OutcomeKind,
  type OutcomeReconciliationV1,
} from './outcome-reconciliation.util';
import { AGENT_TURN_TRACE_SCHEMA } from '../harness/hardening/agent-turn-trace.util';
import {
  attachTravelWorldStateQuality,
  checkTravelWorldStateConsistency,
} from './hardening/world-state-quality.util';

export type TravelWorldStateSeed = Partial<
  Pick<
    ProjectTravelWorldStateInput,
    | 'tripMeta'
    | 'missingLodgingDays'
    | 'bookingItems'
    | 'memberIds'
    | 'partyProfile'
    | 'riskGateOk'
  >
> & {
  openDecisionIds?: string[];
};

/** 从 TaskContract + 可选 seed / Live 结论组装只读 WorldState */
export function projectTravelWorldStateForTurn(input: {
  tripId?: string | null;
  contract?: AgentTaskContractV1 | null;
  seed?: TravelWorldStateSeed | null;
  liveConclusion?: LiveExecutionConclusionV1 | null;
  correlationExtras?: TravelWorldStateV1['correlation'];
}): TravelWorldStateV1 {
  const contract = input.contract ?? null;
  const tripId =
    String(input.tripId ?? contract?.tripId ?? '').trim() || 'unknown_trip';
  const seed = input.seed ?? null;
  const state = projectTravelWorldState({
    tripId,
    lifecycle: contract?.lifecycle ?? 'UNKNOWN',
    tripMeta: seed?.tripMeta ?? {
      planVersion: null,
      status: null,
    },
    missingLodgingDays: seed?.missingLodgingDays,
    bookingItems: seed?.bookingItems,
    memberIds: seed?.memberIds,
    partyProfile: seed?.partyProfile,
    riskGateOk: seed?.riskGateOk,
    liveConclusion: input.liveConclusion ?? null,
    openDecisions: (seed?.openDecisionIds ?? []).map(
      (id) =>
        ({
          decisionId: id,
          state: 'OPEN',
          subject: { title_zh: id },
        }) as any,
    ),
    correlation: {
      latestTurnId: contract?.turnId ?? null,
      latestTaskId: contract?.taskId ?? null,
      latestAgentTurnTraceSchema: AGENT_TURN_TRACE_SCHEMA,
      ...input.correlationExtras,
    },
  });
  return state;
}

export function echoTravelWorldStateObservability(
  state: TravelWorldStateV1,
): Record<string, unknown> {
  const withQ = attachTravelWorldStateQuality(state);
  const consistency = checkTravelWorldStateConsistency(withQ);
  return {
    ...projectTravelWorldStateForObservability(state),
    freshness: withQ.quality.overallFreshness,
    confidence: withQ.quality.overallConfidence,
    consistency_ok: consistency.ok,
    consistency_issues: consistency.issues.map((i) => i.code),
  };
}

/** Confirm→Apply 成功后关联 Ledger */
export function linkApplyReceiptToTravelEventLedger(input: {
  tripId: string;
  turnId?: string | null;
  taskId?: string | null;
  decisionId?: string | null;
  actionId?: string | null;
  planVersion?: number | null;
  worldStateProjectedAt?: string | null;
  ledger?: TravelEventLedgerStore;
  extras?: Record<string, unknown>;
}): { eventIds: string[] } {
  const ledger = input.ledger ?? getDefaultTravelEventLedger();
  const linked = ledger.linkBundle({
    tripId: input.tripId,
    turnId: input.turnId ?? undefined,
    taskId: input.taskId ?? undefined,
    decisionId: input.decisionId ?? undefined,
    actionId: input.actionId ?? undefined,
    planVersion: input.planVersion ?? undefined,
    agentTurnTraceSchema: AGENT_TURN_TRACE_SCHEMA,
    worldStateProjectedAt: input.worldStateProjectedAt ?? undefined,
    extras: input.extras,
  });
  return { eventIds: linked.map((e) => e.eventId) };
}

export type OutcomeReconciliationRequest = {
  kind: OutcomeKind;
  predictedZh: string;
  observedZh: string;
  predictedSource?: string;
  observedSource?: string;
  observedFreshnessHint?: OutcomeReconciliationV1['observed']['freshnessHint'];
  deltaZh?: string;
  decisionId?: string;
  planVersion?: number;
  turnId?: string;
};

/** Outcome 对照 → Ledger OUTCOME（learningSignalOnly） */
export function appendOutcomeToTravelEventLedger(input: {
  tripId: string;
  outcome: OutcomeReconciliationRequest;
  ledger?: TravelEventLedgerStore;
}): {
  outcome: OutcomeReconciliationV1;
  eventId: string;
  observability: Record<string, unknown>;
} {
  const ledger = input.ledger ?? getDefaultTravelEventLedger();
  const outcome = buildOutcomeReconciliation({
    kind: input.outcome.kind,
    tripId: input.tripId,
    predictedZh: input.outcome.predictedZh,
    observedZh: input.outcome.observedZh,
    predictedSource: input.outcome.predictedSource,
    observedSource: input.outcome.observedSource,
    observedFreshnessHint: input.outcome.observedFreshnessHint,
    deltaZh: input.outcome.deltaZh,
    correlation: {
      decisionId: input.outcome.decisionId ?? null,
      planVersion: input.outcome.planVersion ?? null,
      turnId: input.outcome.turnId ?? null,
    },
  });
  const entry = ledger.append({
    kind: 'OUTCOME',
    correlation: {
      tripId: input.tripId,
      turnId: input.outcome.turnId ?? null,
      decisionId: input.outcome.decisionId ?? null,
      planVersion: input.outcome.planVersion ?? null,
    },
    payload: {
      outcome_id: outcome.outcomeId,
      kind: outcome.kind,
      predicted: outcome.predicted.valueZh,
      observed: outcome.observed.valueZh,
      delta_zh: outcome.deltaZh,
      learning_signal_only: true,
      /** 显式：不得当作 Evidence */
      not_evidence: true,
    },
  });
  return {
    outcome: {
      ...outcome,
      correlation: { ...outcome.correlation, eventId: entry.eventId },
    },
    eventId: entry.eventId,
    observability: projectOutcomeForObservability({
      ...outcome,
      correlation: { ...outcome.correlation, eventId: entry.eventId },
    }),
  };
}

/** 从 request.options 读取可选 seed / outcome（薄挂，不改 DTO schema） */
export function readTravelWorldStateSeedFromOptions(
  options: Record<string, unknown> | null | undefined,
): TravelWorldStateSeed | null {
  const raw = options?.travel_world_state_seed;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as TravelWorldStateSeed;
}

export function readOutcomeReconciliationFromOptions(
  options: Record<string, unknown> | null | undefined,
): OutcomeReconciliationRequest | null {
  const raw = options?.outcome_reconciliation;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Partial<OutcomeReconciliationRequest>;
  if (
    o.kind !== 'ARRIVAL_TIME' &&
    o.kind !== 'FATIGUE' &&
    o.kind !== 'RISK'
  ) {
    return null;
  }
  if (typeof o.predictedZh !== 'string' || typeof o.observedZh !== 'string') {
    return null;
  }
  return o as OutcomeReconciliationRequest;
}
