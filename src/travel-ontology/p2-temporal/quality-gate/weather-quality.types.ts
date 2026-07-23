/**
 * ONT-P2-02A — Weather Temporal Prediction Quality Gate types
 */

import type { OutcomeReconciliation, ReconciliationStatus } from '../contracts';
import type { PredictionRecord } from '../contracts';

export const P2_QUALITY_GATE_SCHEMA_ID =
  'tripnara.ontology_p2_weather_quality_gate@v1' as const;

export const P2_QUALITY_BASELINE_SCHEMA_ID =
  'tripnara.ontology_p2_weather_quality_baseline@v1' as const;

export const P2_HUMAN_REVIEW_LEDGER_SCHEMA_ID =
  'tripnara.ontology_p2_weather_human_review_ledger@v1' as const;

/** Frozen production Shadow quality baselines (thresholds / observed rates) */
export interface WeatherQualityBaseline {
  schemaId: typeof P2_QUALITY_BASELINE_SCHEMA_ID;
  workItem: 'ONT-P2-02A';
  semanticScope: 'WEATHER_DETERIORATION';
  authorityMode: 'SHADOW';
  country: 'IS';
  frozenAt: string;
  predictionVersion: string;
  /** Absolute onset error ceiling (minutes) for CONFIRMED/acceptable band */
  onsetAbsErrorMinutesP95: number;
  /** Absolute deterioration error ceiling (minutes) */
  deteriorationAbsErrorMinutesP95: number;
  /** Minimum mean deadline lead (actual onset − deadline); may be negative if late */
  minMeanDeadlineLeadMinutes: number;
  /** Max actionable false-negative rate (0–1) */
  maxActionableFalseNegativeRate: number;
  /** Max false-positive rate (0–1) */
  maxFalsePositiveRate: number;
  /** Max prediction reversal rate among version pairs (0–1) */
  maxPredictionReversalRate: number;
  /** Min reconciliation completion rate (reconciled / issued with observable actual) */
  minReconciliationCompletionRate: number;
  /** Max unobservable share among reconciliation attempts (0–1) */
  maxUnobservableRate: number;
  /** Observed snapshot at freeze (for audit) */
  observed: WeatherQualityMetrics;
  replayFingerprint: string;
}

export interface WeatherQualityMetrics {
  caseCount: number;
  predictionsIssued: number;
  reconciliationsAttempted: number;
  reconciliationsCompleted: number;
  /** completed / attempted */
  reconciliationCompletionRate: number;
  unobservableCount: number;
  unobservableRate: number;
  falsePositiveCount: number;
  falsePositiveRate: number;
  actionableFalseNegativeCount: number;
  actionableFalseNegativeRate: number;
  predictionReversalCount: number;
  predictionReversalRate: number;
  meanAbsOnsetErrorMinutes: number | null;
  p95AbsOnsetErrorMinutes: number | null;
  meanAbsDeteriorationErrorMinutes: number | null;
  meanDeadlineLeadMinutes: number | null;
  statusCounts: Record<ReconciliationStatus, number>;
}

export type QualityDiscrepancyKind =
  | 'TIME_ERROR_ONSET'
  | 'TIME_ERROR_DETERIORATION'
  | 'ACTIONABLE_FALSE_NEGATIVE'
  | 'FALSE_POSITIVE'
  | 'PREDICTION_REVERSAL'
  | 'UNOBSERVABLE'
  | 'RECONCILIATION_INCOMPLETE'
  | 'BASELINE_BREACH';

export type QualityClassification =
  | 'ACCEPTABLE_WITHIN_BASELINE'
  | 'MODEL_OVERWARN'
  | 'MODEL_UNDERWARN'
  | 'DATA_GAP_UNOBSERVABLE'
  | 'VERSION_FLIP_EXPECTED'
  | 'VERSION_FLIP_CONCERN'
  | 'FIXTURE_INTENTIONAL'
  | 'NEEDS_HUMAN_REVIEW';

export interface QualityDiscrepancy {
  discrepancyId: string;
  kind: QualityDiscrepancyKind;
  caseId: string;
  tripId?: string;
  regionId?: string;
  predictionId?: string;
  priorPredictionId?: string;
  reconciliationId?: string;
  detail: string;
  metricsSnippet?: Record<string, number | string | boolean | null>;
  classification: QualityClassification;
  classifiedAt: string;
  replayCaseId: string;
  replayFingerprint: string;
  humanReviewRequired: boolean;
  humanReviewStatus: 'NOT_REQUIRED' | 'PENDING' | 'REVIEWED' | 'WAIVED';
  reviewerNotes?: string;
}

export interface HumanReviewLedger {
  schemaId: typeof P2_HUMAN_REVIEW_LEDGER_SCHEMA_ID;
  workItem: 'ONT-P2-02A';
  generatedAt: string;
  authorityMode: 'SHADOW';
  entries: QualityDiscrepancy[];
  summary: {
    total: number;
    pendingHumanReview: number;
    classified: number;
    replayFrozen: number;
  };
  /** All discrepancies classified and replay-solidified */
  ledgerComplete: boolean;
}

export interface QualityCaseBundle {
  caseId: string;
  tripId: string;
  regionId: string;
  prediction: PredictionRecord | null;
  priorPrediction?: PredictionRecord | null;
  reconciliation: OutcomeReconciliation | null;
  /** Intentional fixture tag for classification */
  fixtureIntent?:
    | 'ALIGNED'
    | 'FALSE_POSITIVE'
    | 'FALSE_NEGATIVE'
    | 'PARTIAL_ONSET'
    | 'REVERSAL'
    | 'UNOBSERVABLE'
    | 'SHADOW_PILOT';
}

export interface WeatherQualityGateReport {
  schemaId: typeof P2_QUALITY_GATE_SCHEMA_ID;
  workItem: 'ONT-P2-02A';
  generatedAt: string;
  verdict: 'PASS' | 'FAIL';
  authorityMode: 'SHADOW';
  baseline: WeatherQualityBaseline;
  metrics: WeatherQualityMetrics;
  ledger: HumanReviewLedger;
  checks: Array<{ id: string; ok: boolean; detail: string }>;
  /** Set when ledgerComplete && verdict PASS */
  nextAllowed: 'APPLY_ONT_P2_02B_INTERNAL_TEMPORAL_ADVISORY' | 'NONE';
  nextForbidden: Array<
    | 'USER_FACING_TEMPORAL_ADVICE'
    | 'MUTATE_CANONICAL_ASSESSMENT'
    | 'CALL_CANONICAL_APPLY'
    | 'APPROVE_02B_BEFORE_02A_PASS'
  >;
}
