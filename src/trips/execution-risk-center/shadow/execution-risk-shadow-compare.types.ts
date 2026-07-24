import type { ExecutionAlertLevel } from '../../../mobile/dto/mobile-execution.types';

export const EXECUTION_RISK_SHADOW_COMPARISON_SCHEMA_ID =
  'tripnara.execution_risk_shadow_comparison@v2';

/** Semantic divergence taxonomy — distinguishes capability vs regression. */
export type ExecutionRiskShadowDivergenceKind =
  | 'ALIGNED'
  | 'EXPECTED_DERIVED_EXPANSION'
  | 'CLUSTER_EQUIVALENT'
  | 'LEGACY_MISSED_ROOT_CAUSE'
  | 'CANONICAL_FALSE_POSITIVE'
  | 'SEVERITY_MISMATCH'
  | 'ACTION_MISMATCH'
  | 'DUPLICATE_VISIBLE_ITEM'
  | 'SOURCE_MAPPING_GAP'
  | 'COUNT_MISMATCH'
  | 'PRIMARY_MISMATCH'
  | 'LEVEL_MISMATCH'
  | 'SOURCE_COVERAGE_MISMATCH'
  | 'UNKNOWN_KNOWLEDGE_CODES'
  | 'UNKNOWN_MISMATCH';

export interface ExecutionRiskShadowFingerprint {
  id: string;
  sourceKey: string;
  level: ExecutionAlertLevel;
  title: string;
}

export interface ExecutionRiskShadowLegSnapshot {
  alertCount: number;
  topLevel?: ExecutionAlertLevel;
  primaryId?: string;
  primaryTitle?: string;
  fingerprintIds: string[];
  sourceKeys: string[];
}

export interface RawRiskComparison {
  legacyCount: number;
  canonicalCount: number;
  directRiskCount: number;
  derivedRiskCount: number;
  rootCauseCount: number;
  unmappedRiskCount: number;
  overlapRate: number;
}

export interface ClusterComparison {
  legacyIssueCount: number;
  canonicalClusterCount: number;
  canonicalIndependentCount: number;
  duplicateClusterCount: number;
  primaryRiskAgreement: boolean;
  unmatchedRootCauses: string[];
  clusterSemanticAgreementRate: number;
}

export interface SemanticComparison {
  legacyVisibleCardCount: number;
  canonicalVisibleCardCount: number;
  legacyAdjustmentItemCount: number;
  canonicalAdjustmentItemCount: number;
  severityMismatchCount: number;
  requiredActionMismatchCount: number;
  primaryRiskMismatchCount: number;
  visibleCardCountMismatch: boolean;
  duplicateVisibleItemCount: number;
  legacyRequiredAction?: string;
  canonicalRequiredAction?: string;
  legacyTopLevel?: ExecutionAlertLevel;
  canonicalTopLevel?: ExecutionAlertLevel;
  clusterVisibility: import('./cluster-visibility-audit.types').ClusterVisibilityComparison;
}

export type ShadowMismatchAdjudicationVerdict =
  | 'CANONICAL_CORRECT'
  | 'LEGACY_CORRECT'
  | 'BOTH_ACCEPTABLE'
  | 'BOTH_INCORRECT'
  | 'NEEDS_REVIEW';

export type ShadowMismatchResolutionType =
  | 'NO_CHANGE_REQUIRED'
  | 'SOURCE_MAPPING_FIX'
  | 'RULE_FIX'
  | 'CLUSTER_FIX'
  | 'PROJECTION_FIX'
  | 'LEGACY_DEFECT';

export interface ShadowMismatchAdjudication {
  adjudicationId: string;
  comparisonId: string;
  snapshotId: string;
  tripId: string;
  snapshotAt: string;
  mismatchType: ExecutionRiskShadowDivergenceKind;
  verdict: ShadowMismatchAdjudicationVerdict;
  resolutionType: ShadowMismatchResolutionType;
  reason: string;
  owner?: string;
  resolvedAt?: string;
  recordedAt: string;
}

export interface ExecutionRiskCutoverBuildMetadata {
  appBuildSha: string;
  packageVersion: string;
  knowledgeVersion: string;
  contractVersion: string;
  shadowSchemaVersion: string;
}

/** Formal observation window snapshot — only v2 schema counts. */
export interface ShadowObservationSnapshot {
  snapshotId: string;
  tripId: string;
  capturedAt: string;
  dedupKey: string;
  sourceFactVersion: string;
  planVersionId: string;
  build: ExecutionRiskCutoverBuildMetadata;
  comparison: ExecutionRiskShadowComparison;
  clusterVisibilityConsistent: boolean;
  clusterVisibilityViolations: string[];
}

export interface ShadowObservationWindowTargets {
  minTrips: number;
  minSnapshots: number;
  minHighCriticalInstances: number;
}

export const DEFAULT_SHADOW_OBSERVATION_TARGETS: ShadowObservationWindowTargets = {
  minTrips: 50,
  minSnapshots: 200,
  minHighCriticalInstances: 20,
};

export interface ShadowObservationDataset {
  schemaId: 'tripnara.execution_risk_shadow_observation@v2';
  generatedAt: string;
  observationWindowOpenedAt?: string;
  activeBuildSha?: string;
  targets: ShadowObservationWindowTargets;
  snapshotCount: number;
  uniqueTripCount: number;
  highCriticalInstanceCount: number;
  formalSnapshots: ShadowObservationSnapshot[];
  /** @deprecated pre-v2 — excluded from window counts */
  legacySnapshotsExcluded: number;
  adjudications: ShadowMismatchAdjudication[];
  pendingAdjudicationCount: number;
}

export interface ExecutionRiskShadowComparisonMetrics {
  sourceKeyOverlapRate: number;
  levelAgreement: boolean;
  primaryAgreement: boolean;
  countDelta: number;
  unknownKnowledgeCodeCount: number;
  rootCauseRecallRate: number;
  highPriorityRecallRate: number;
  stopMissCount: number;
}

export interface ExecutionRiskShadowComparison {
  schemaId: typeof EXECUTION_RISK_SHADOW_COMPARISON_SCHEMA_ID;
  tripId: string;
  comparedAt: string;
  planVersionId?: string;
  diverged: boolean;
  divergenceKind: ExecutionRiskShadowDivergenceKind;
  divergenceKinds: ExecutionRiskShadowDivergenceKind[];
  legacy: ExecutionRiskShadowLegSnapshot;
  canonical: ExecutionRiskShadowLegSnapshot;
  rawRiskComparison: RawRiskComparison;
  clusterComparison: ClusterComparison;
  semanticComparison: SemanticComparison;
  metrics: ExecutionRiskShadowComparisonMetrics;
}

export interface ExecutionRiskShadowMetricsSnapshot {
  comparedTotal: number;
  divergedTotal: number;
  byDivergenceKind: Record<string, number>;
}

export interface ExecutionRiskCutoverGateCheck {
  id: string;
  pass: boolean;
  actual: number | string | boolean;
  threshold: string;
  detail: string;
}

export interface ExecutionRiskCutoverGoNoGoReport {
  schemaId: 'tripnara.execution_risk_cutover_go_no_go@v1';
  generatedAt: string;
  pass: boolean;
  tripId: string;
  engineeringStatus: 'FEATURE_COMPLETE';
  verificationStatus: 'AUTOMATED_GATES_PASSED';
  runtimeStatus: 'STAGING_SHADOW_READY' | 'STAGING_SHADOW_DIVERGED';
  writeStatus: 'STAGING_CONFIRM_GATED';
  productionStatus: 'NOT_YET_CUTOVER';
  shadowComparison: ExecutionRiskShadowComparison;
  gates: ExecutionRiskCutoverGateCheck[];
  blockers: string[];
  warnings: string[];
  recommendation: 'GO' | 'CONDITIONAL_GO' | 'NO_GO' | 'OBSERVE';
}
