/**
 * Outcome Reconciliation — Arrival Time / Fatigue / Risk。
 * 预测 vs 观测对照；结果写入 Ledger 为 OUTCOME，不得替代实时 Evidence。
 */

export const OUTCOME_RECONCILIATION_SCHEMA = 'nara.outcome_reconciliation@v1' as const;

export type OutcomeKind = 'ARRIVAL_TIME' | 'FATIGUE' | 'RISK';

export type OutcomeReconciliationV1 = {
  schemaId: typeof OUTCOME_RECONCILIATION_SCHEMA;
  version: 1;
  outcomeId: string;
  kind: OutcomeKind;
  tripId: string;
  reconciledAt: string;
  predicted: {
    valueZh: string;
    source?: string;
    at?: string;
  };
  observed: {
    valueZh: string;
    source?: string;
    at?: string;
    /** 观测新鲜度提示；强结论仍须走 Evidence Contract */
    freshnessHint?: 'VERIFIED' | 'STALE' | 'ASSUMED' | 'UNAVAILABLE';
  };
  deltaZh?: string;
  /** 关联 Ledger / Decision / Plan */
  correlation: {
    eventId?: string | null;
    decisionId?: string | null;
    planVersion?: number | null;
    turnId?: string | null;
  };
  /** 对照结果仅作学习信号 */
  learningSignalOnly: true;
};

export function buildOutcomeReconciliation(input: {
  kind: OutcomeKind;
  tripId: string;
  predictedZh: string;
  observedZh: string;
  predictedSource?: string;
  observedSource?: string;
  observedFreshnessHint?: OutcomeReconciliationV1['observed']['freshnessHint'];
  deltaZh?: string;
  correlation?: OutcomeReconciliationV1['correlation'];
  outcomeId?: string;
  reconciledAt?: string;
}): OutcomeReconciliationV1 {
  return {
    schemaId: OUTCOME_RECONCILIATION_SCHEMA,
    version: 1,
    outcomeId: input.outcomeId ?? `out_${input.kind}_${Date.now()}`,
    kind: input.kind,
    tripId: input.tripId,
    reconciledAt: input.reconciledAt ?? new Date().toISOString(),
    predicted: {
      valueZh: input.predictedZh,
      source: input.predictedSource,
    },
    observed: {
      valueZh: input.observedZh,
      source: input.observedSource,
      freshnessHint: input.observedFreshnessHint,
    },
    deltaZh: input.deltaZh,
    correlation: {
      eventId: input.correlation?.eventId ?? null,
      decisionId: input.correlation?.decisionId ?? null,
      planVersion: input.correlation?.planVersion ?? null,
      turnId: input.correlation?.turnId ?? null,
    },
    learningSignalOnly: true,
  };
}

export function projectOutcomeForObservability(
  o: OutcomeReconciliationV1,
): Record<string, unknown> {
  return {
    schema_id: o.schemaId,
    kind: o.kind,
    trip_id: o.tripId,
    predicted: o.predicted.valueZh,
    observed: o.observed.valueZh,
    delta_zh: o.deltaZh,
    learning_signal_only: o.learningSignalOnly,
  };
}
