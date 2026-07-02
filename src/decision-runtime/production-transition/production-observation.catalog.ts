/**
 * Production observation window — six metric categories (SSOT).
 * @see PRODUCTION_TRANSITION.md §3
 */

export const PRODUCTION_OBSERVATION_VERSION = 'production-observation@v1';

export type ProductionObservationCategory =
  | 'trigger'
  | 'constraint'
  | 'authorization'
  | 'executor'
  | 'monitoring'
  | 'latency';

export type ObservationDisposition = 'PASS' | 'PASS_WITH_CONDITIONS' | 'FAIL' | 'INCOMPLETE';

export interface ProductionObservationThreshold {
  metricId: string;
  label: string;
  category: ProductionObservationCategory;
  /** Violation blocks observation window PASS */
  zeroTolerance: boolean;
  /** Suggested pass threshold when data is available */
  passThreshold?: string;
  collectionHint: string;
}

export const PRODUCTION_OBSERVATION_THRESHOLDS: ProductionObservationThreshold[] = [
  {
    metricId: 'trigger.gateway-coverage-pct',
    label: 'Formal requests via Trigger Gateway',
    category: 'trigger',
    zeroTolerance: false,
    passThreshold: '>= 90%',
    collectionHint: 'Prometheus / access log by entry point',
  },
  {
    metricId: 'trigger.bypass-requests',
    label: 'New bypass requests (not_wired formal paths)',
    category: 'trigger',
    zeroTolerance: true,
    passThreshold: '= 0 new bypass',
    collectionHint: 'Compare catalog not_wired vs production dispatch logs',
  },
  {
    metricId: 'constraint.legacy-pass-canonical-block',
    label: 'Legacy PASS but Canonical BLOCK',
    category: 'constraint',
    zeroTolerance: true,
    passThreshold: '= 0',
    collectionHint: 'constraintShadowMetrics.byDivergenceKind',
  },
  {
    metricId: 'constraint.block-winner',
    label: 'BLOCK candidate became winner',
    category: 'constraint',
    zeroTolerance: true,
    passThreshold: '= 0',
    collectionHint: 'Decision audit / shadow review',
  },
  {
    metricId: 'authorization.unauthorized-execute',
    label: 'Execute without Authorization Gateway',
    category: 'authorization',
    zeroTolerance: true,
    passThreshold: '= 0',
    collectionHint: 'Execution ledger vs authorizationId',
  },
  {
    metricId: 'authorization.expired-still-executed',
    label: 'Expired authorization still executed',
    category: 'authorization',
    zeroTolerance: true,
    passThreshold: '= 0',
    collectionHint: 'Authorization audit trail',
  },
  {
    metricId: 'executor.non-executor-effective-write',
    label: 'Non-Executor setEffective',
    category: 'executor',
    zeroTolerance: true,
    passThreshold: '= 0',
    collectionHint: 'Write guard + architecture lint',
  },
  {
    metricId: 'executor.shadow-effective-write',
    label: 'Shadow path Effective Plan write',
    category: 'executor',
    zeroTolerance: true,
    passThreshold: '= 0',
    collectionHint: 'Write guard blocks',
  },
  {
    metricId: 'executor.duplicate-execute',
    label: 'Duplicate execute same operationId',
    category: 'executor',
    zeroTolerance: true,
    passThreshold: '= 0',
    collectionHint: 'Execution ledger',
  },
  {
    metricId: 'monitoring.duplicate-decision-runs',
    label: 'Same event → multiple Decision Runs',
    category: 'monitoring',
    zeroTolerance: false,
    passThreshold: 'trending down',
    collectionHint: 'Event dedup metrics + decisionRunId correlation',
  },
  {
    metricId: 'latency.p95-growth',
    label: 'P95 latency vs legacy baseline',
    category: 'latency',
    zeroTolerance: false,
    passThreshold: 'signed acceptable',
    collectionHint: 'APM / gateway timing histogram',
  },
  {
    metricId: 'latency.gateway-error-rate',
    label: 'Gateway technical error rate',
    category: 'latency',
    zeroTolerance: false,
    passThreshold: '< 1%',
    collectionHint: 'HTTP 5xx + gateway internal errors',
  },
];

export function snapshotProductionObservationCatalog() {
  return {
    schemaId: 'tripnara.production_observation_catalog@v1',
    version: PRODUCTION_OBSERVATION_VERSION,
    categoryCount: 6,
    thresholds: PRODUCTION_OBSERVATION_THRESHOLDS,
  };
}
