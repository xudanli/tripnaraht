/**
 * Outcome Trigger Registry — 从真实 Execution Event 自动触发 Reconciliation。
 * 不扩大 Outcome 类型：仍仅 ARRIVAL_TIME / FATIGUE / RISK。
 */

import type { TravelEventLedgerStore } from '../travel-event-ledger.store';
import {
  appendOutcomeToTravelEventLedger,
  type OutcomeReconciliationRequest,
} from '../attach-state-learning.util';
import type { OutcomeKind, OutcomeReconciliationV1 } from '../outcome-reconciliation.util';

/** 真实执行事件（输入侧；非新 Memory） */
export type ExecutionEventKind =
  | 'ARRIVAL_OBSERVED'
  | 'FATIGUE_REPORTED'
  | 'RISK_OBSERVED';

export type ExecutionEventV1 = {
  kind: ExecutionEventKind;
  tripId: string;
  occurredAt?: string;
  predictedZh?: string;
  observedZh: string;
  turnId?: string;
  decisionId?: string;
  planVersion?: number;
  source?: string;
  freshnessHint?: OutcomeReconciliationV1['observed']['freshnessHint'];
  deltaZh?: string;
};

export type OutcomeTriggerDef = {
  executionKind: ExecutionEventKind;
  outcomeKind: OutcomeKind;
  defaultPredictedZh: string;
};

export const OUTCOME_TRIGGER_REGISTRY: readonly OutcomeTriggerDef[] = [
  {
    executionKind: 'ARRIVAL_OBSERVED',
    outcomeKind: 'ARRIVAL_TIME',
    defaultPredictedZh: '计划到达时间（未提供）',
  },
  {
    executionKind: 'FATIGUE_REPORTED',
    outcomeKind: 'FATIGUE',
    defaultPredictedZh: 'MEDIUM',
  },
  {
    executionKind: 'RISK_OBSERVED',
    outcomeKind: 'RISK',
    defaultPredictedZh: '风险可控（先验）',
  },
] as const;

export function resolveOutcomeTrigger(
  executionKind: ExecutionEventKind,
): OutcomeTriggerDef | null {
  return OUTCOME_TRIGGER_REGISTRY.find((t) => t.executionKind === executionKind) ?? null;
}

export type OutcomeTriggerResult = {
  triggered: boolean;
  outcomeKind?: OutcomeKind;
  outcome?: OutcomeReconciliationV1;
  eventId?: string;
  observability?: Record<string, unknown>;
  reason?: string;
};

/** Execution Event → Outcome Reconciliation → Ledger OUTCOME */
export function triggerOutcomeReconciliationFromExecution(input: {
  event: ExecutionEventV1;
  ledger?: TravelEventLedgerStore;
}): OutcomeTriggerResult {
  const def = resolveOutcomeTrigger(input.event.kind);
  if (!def) {
    return { triggered: false, reason: 'no_trigger_registered' };
  }
  const req: OutcomeReconciliationRequest = {
    kind: def.outcomeKind,
    predictedZh: input.event.predictedZh ?? def.defaultPredictedZh,
    observedZh: input.event.observedZh,
    predictedSource: 'plan_or_prior',
    observedSource: input.event.source ?? input.event.kind,
    observedFreshnessHint: input.event.freshnessHint,
    deltaZh: input.event.deltaZh,
    decisionId: input.event.decisionId,
    planVersion: input.event.planVersion,
    turnId: input.event.turnId,
  };
  const appended = appendOutcomeToTravelEventLedger({
    tripId: input.event.tripId,
    outcome: req,
    ledger: input.ledger,
  });
  return {
    triggered: true,
    outcomeKind: def.outcomeKind,
    outcome: appended.outcome,
    eventId: appended.eventId,
    observability: appended.observability,
  };
}
