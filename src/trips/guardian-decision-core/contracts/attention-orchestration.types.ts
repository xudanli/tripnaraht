/**
 * Slice 4 — Attention & Root-Cause Orchestration (frozen contracts).
 * ADR: internal-docs/architecture/ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md
 */

import type { Rfc001DecisionProblemStatus, Rfc001DecisionProblemUrgency } from './decision-problem.types';

export const ATTENTION_ORCHESTRATION_CONTRACT_VERSION = '0.1.0';

export type AttentionLevel =
  | 'SILENT'
  | 'LOG_ONLY'
  | 'SUMMARY'
  | 'QUEUE'
  | 'INTERRUPT'
  | 'SAFETY_STOP';

export type RootCauseClusterStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export const ATTENTION_LEVEL_ORDER: Record<AttentionLevel, number> = {
  SILENT: 0,
  LOG_ONLY: 1,
  SUMMARY: 2,
  QUEUE: 3,
  INTERRUPT: 4,
  SAFETY_STOP: 5,
};

export const ROOT_CAUSE_TYPES = {
  WEATHER_STRONG_WIND: 'WEATHER_STRONG_WIND',
  ROAD_CLOSED: 'ROAD_CLOSED',
} as const;

export type RootCauseType = (typeof ROOT_CAUSE_TYPES)[keyof typeof ROOT_CAUSE_TYPES];

/** Ordered causal chain node for cluster + user projection. */
export interface CausalNode {
  code: string;
  label: string;
  problemId?: string;
  assertionId?: string;
  order: number;
}

export interface RootCauseCluster {
  clusterId: string;
  tripId: string;

  rootCauseKey: string;
  rootCauseType: string;

  primaryProblemId: string;
  relatedProblemIds: string[];

  causalChain: CausalNode[];

  attentionLevel: AttentionLevel;
  status: RootCauseClusterStatus;

  firstObservedAt: string;
  lastUpdatedAt: string;

  /** Set when attention escalates upward — allows re-notify. */
  lastAttentionEscalatedAt?: string;
  /** Set when user confirms — suppresses repeat notifications. */
  acknowledgedAt?: string;
}

export interface UnifiedDecisionItemProjection {
  clusterId: string;
  tripId: string;

  primaryProblemId: string;
  primarySemanticCapability: string;

  headline: string;
  explanation: string;
  causalStory: CausalNode[];

  attentionLevel: AttentionLevel;
  status: RootCauseClusterStatus;

  relatedEffects: Array<{
    problemId: string;
    semanticCapability: string;
    label: string;
  }>;

  confirmationEntry: {
    problemId: string;
    actionRoute: 'decision-queue';
  };

  firstObservedAt: string;
  lastUpdatedAt: string;
}

/** Minimal Canonical Problem slice consumed by Attention Runtime (upper layer only). */
export interface AttentionOrchestrationProblemInput {
  problemId: string;
  tripId: string;
  semanticCapability: string;
  status: Rfc001DecisionProblemStatus;
  detectedAt: string;
  urgency?: Rfc001DecisionProblemUrgency;

  causedByProblemId?: string;
  rootCauseCode?: string;
  routeSegmentId?: string;
  weatherEpisodeId?: string;

  /** Pre-resolved key when upstream already computed it. */
  rootCauseKey?: string;

  headline?: string;
  explanation?: string;
}

export interface AttentionOrchestrationContext {
  tripId: string;
  routeSegmentId: string;
  weatherEpisodeId: string;
  now?: string;
}

export interface RootCauseClusterUpsertResult {
  cluster: RootCauseCluster;
  created: boolean;
  primaryChanged: boolean;
  attentionEscalated: boolean;
  shouldNotify: boolean;
}

export interface AttentionOrchestrationShadowMetricsSnapshot {
  source: 'ATTENTION_ROOT_CAUSE_ORCHESTRATION';
  runs: number;
  inputProblemCount: number;
  legacyVisibleItemCount: number;
  shadowVisibleItemCount: number;
  correctMergeCount: number;
  correctSeparationCount: number;
  falseMergeCount: number;
  missedMergeCount: number;
  wrongPrimaryCount: number;
  wrongAttentionLevelCount: number;
  duplicateVisibleCardReductionCount: number;
  suppressedNoActionCount: number;
  escalationCount: number;
  staleClusterCount: number;
  crossModuleClusterCount: number;
  weatherToExecutionClusterCount: number;
  executionToNightRiskClusterCount: number;
  /** @deprecated use duplicateVisibleCardReductionCount */
  ingestCount: number;
  clusterCreatedCount: number;
  clusterUpdatedCount: number;
  duplicateClusterPreventedCount: number;
  primaryUpgradeCount: number;
  attentionEscalationCount: number;
  suppressedReNotifyCount: number;
  legacyQueueItemCount: number;
  shadowPrimaryItemCount: number;
  duplicateVisibleCardsAvoided: number;
  wrongAttentionEscalationCount: number;
  lastUpdatedAt?: string;
}

export type AttentionShadowVerdict =
  | 'CORRECT_MERGE'
  | 'CORRECT_SEPARATION'
  | 'FALSE_MERGE'
  | 'MISSED_MERGE'
  | 'WRONG_PRIMARY'
  | 'WRONG_ATTENTION'
  | 'WRONG_ATTENTION_LEVEL'
  | 'WRONG_RESOLUTION'
  | 'STALE_CLUSTER'
  | 'NO_OP'
  | 'INCONCLUSIVE';

export type AttentionShadowSampleGroup =
  | 'CORRECT_MERGE'
  | 'CORRECT_SEPARATION'
  | 'PRIMARY_SWITCH'
  | 'ATTENTION_ESCALATION'
  | 'RESOLUTION_REPLAY'
  | 'STAGING_REPLAY';

export type AttentionShadowResolutionBehavior =
  | 'NONE'
  | 'REMOVE_FROM_VISIBLE'
  | 'PRESERVE_HISTORY'
  | 'NO_DUPLICATE_ON_POLL'
  | 'REBUILD_FROM_CANONICAL';

/** Full per-sample adjudication expectation. */
export interface AttentionShadowSampleExpectation {
  sampleId: string;
  group: AttentionShadowSampleGroup;
  title: string;
  expectedVerdict: AttentionShadowVerdict;
  expectedClusterCount: number;
  expectedPrimarySemanticCapability?: string;
  expectedAttentionLevel?: AttentionLevel;
  expectedVisibleItemCount: number;
  expectedResolutionBehavior: AttentionShadowResolutionBehavior;
  /** Human review notes / risk boundary description */
  notes?: string;
}

export interface AttentionShadowAdjudicationResult {
  sampleId: string;
  expected: AttentionShadowSampleExpectation;
  actual: {
    clusterCount: number;
    visibleItemCount: number;
    primarySemanticCapability?: string;
    attentionLevel?: AttentionLevel;
    verdict: AttentionShadowVerdict;
  };
  pass: boolean;
  priorityFailure?: 'FALSE_MERGE' | 'WRONG_PRIMARY' | 'WRONG_ATTENTION' | 'WRONG_RESOLUTION';
  reason: string;
}

export interface AttentionShadowObservationRates {
  sampleCount: number;
  deterministicCount: number;
  stagingReplayCount: number;
  falseMergeRate: number;
  missedMergeRate: number;
  wrongPrimaryRate: number;
  wrongAttentionRate: number;
  wrongResolutionRate: number;
  duplicateReductionRate: number;
  resolutionAccuracyRate: number;
  passRate: number;
  underlyingProblemsPreservedRate: number;
}

export interface AttentionShadowObservationSummary {
  schemaId: 'tripnara.attention_shadow_observation_summary@v1';
  generatedAt: string;
  commitSha?: string;
  featureFlag: string;
  sampleCount: number;
  deterministicCount: number;
  stagingReplayCount: number;
  verdictCounts: Partial<Record<AttentionShadowVerdict, number>>;
  adjudicationResults: AttentionShadowAdjudicationResult[];
  rates: AttentionShadowObservationRates;
  exitCriteria: AttentionShadowExitCriteria;
  goNoGo: 'GO' | 'NO_GO' | 'PENDING';
}

export interface AttentionShadowExitCriteria {
  falseMergeRate: { target: string; actual: number; pass: boolean };
  wrongPrimaryRate: { target: string; actual: number; pass: boolean };
  wrongAttentionRate: { target: string; actual: number; pass: boolean };
  wrongResolutionRate: { target: string; actual: number; pass: boolean };
  missedMergeRate: { target: string; actual: number; pass: boolean };
  duplicateReduction: { target: string; actual: number; pass: boolean };
  repeatedPollingDuplicate: { target: string; actual: number; pass: boolean };
  underlyingProblemsPreserved: { target: string; actual: number; pass: boolean };
}

export type AttentionShadowReviewStatus = 'AUTO_PASS' | 'AUTO_PENDING_HUMAN' | 'HUMAN_ADJUDICATED';

export interface AttentionShadowComparison {
  verdict: AttentionShadowVerdict;
  reason: string;
  reviewStatus: AttentionShadowReviewStatus;
  legacyVisibleCount: number;
  shadowVisibleCount: number;
  shadowClusterCount: number;
}

export interface AttentionShadowEvidence {
  schemaId: 'tripnara.attention_shadow_evidence@v1';
  tripId: string;
  runAt: string;
  source: 'READ_MODEL' | 'DETERMINISTIC_DRILL' | 'STAGING_REPLAY';
  sampleId?: string;
  sampleGroup?: AttentionShadowSampleGroup;
  inputProblems: AttentionOrchestrationProblemInput[];
  legacyProjection: Array<{
    problemId: string;
    semanticKey: string;
    title: string;
    workflowStatus: string;
  }>;
  shadowClusters: RootCauseCluster[];
  shadowPrimaryItems: UnifiedDecisionItemProjection[];
  comparison: AttentionShadowComparison;
  metricsSnapshot: Partial<AttentionOrchestrationShadowMetricsSnapshot>;
}

export interface AttentionShadowRunResult {
  skipped?: boolean;
  reason?: string;
  evidence?: AttentionShadowEvidence;
  evidencePath?: string;
  stagingReplay?: AttentionShadowStagingReplayEvidence;
}

/** Staging real-DB replay — full audit trail for Read Model / Adapter / Runtime triage. */
export interface AttentionShadowStagingReplayEvidence {
  schemaId: 'tripnara.attention_shadow_staging_replay@v1';
  tripId: string;
  runId: string;
  scenarioId: string;
  scenarioTitle: string;
  setupHint?: string;
  runAt: string;
  commitSha?: string;
  featureFlags: {
    attentionOrchestration: boolean;
    primarySso: boolean;
  };
  inputRows: Array<Record<string, unknown>>;
  normalizedInputs: AttentionShadowNormalizedInputAudit[];
  clusters: RootCauseCluster[];
  primaryItems: UnifiedDecisionItemProjection[];
  legacyVisibleItems: Array<{
    problemId: string;
    semanticKey: string;
    title: string;
    workflowStatus: string;
  }>;
  comparison: AttentionShadowStagingReplayComparison;
  humanAdjudication?: AttentionShadowHumanAdjudication;
}

export interface AttentionShadowNormalizedInputAudit {
  problemId: string;
  semanticCapability: string;
  status: string;
  weatherEpisodeId?: string;
  episodeSource: 'ROW' | 'LINEAGE' | 'CONTEXT' | 'MISSING';
  causedByProblemId?: string;
  rootCauseKey?: string;
  mergeAuthority: boolean;
  routeSegmentId?: string;
}

export interface AttentionShadowStagingReplayComparison {
  expectedClusterCount?: number;
  actualClusterCount: number;
  expectedPrimary?: string;
  actualPrimary?: string;
  primarySelectionReason?: string;
  expectedAttention?: AttentionLevel;
  actualAttention?: AttentionLevel;
  attentionReason?: string;
  expectedVisibleItemCount?: number;
  actualVisibleItemCount: number;
  verdict: AttentionShadowVerdict;
  reviewStatus: AttentionShadowReviewStatus;
  reason: string;
  underlyingProblemCount: number;
}

export interface AttentionShadowHumanAdjudication {
  shouldMerge: 'YES' | 'NO' | 'PENDING';
  rootCauseKeyCorrect: 'PASS' | 'FAIL' | 'PENDING';
  primaryCorrect: 'PASS' | 'FAIL' | 'PENDING';
  attentionCorrect: 'PASS' | 'FAIL' | 'PENDING';
  visibleCardCountCorrect: 'CORRECT' | 'INCORRECT' | 'PENDING';
  resolutionBehaviorCorrect: 'CORRECT' | 'INCORRECT' | 'PENDING';
  eligibleForCanary: 'YES' | 'NO' | 'PENDING';
  engineeringReviewer?: string;
  productSafetyReviewer?: string;
  reviewedAt?: string;
  notes?: string;
}

/** Slice 4 Internal Dual-Read — current unified queue item (read-only, not SSOT). */
export interface AttentionDualReadCurrentQueueItem {
  problemId: string;
  semanticKey: string;
  title: string;
  workflowStatus: string;
  enforcement?: string;
}

/** Slice 4 Internal Dual-Read — side-by-side comparison metrics. */
export interface AttentionInternalDualReadComparison {
  currentVisibleCount: number;
  attentionVisibleCount: number;
  reductionCount: number;
  hiddenProblemIds: string[];
  primaryProblemIds: string[];
  /** Current queue items with no matching visible primary projection — possible leak. */
  missedProblemIds: string[];
  openClusterCount: number;
  canonicalProblemCount: number;
}

/** Slice 4 Internal Dual-Read API response (internal accounts + canary trips only). */
export interface AttentionInternalDualReadResponse {
  schemaId: 'tripnara.attention_internal_dual_read@v1';
  phase: 'INTERNAL_DUAL_READ';
  tripId: string;
  generatedAt: string;
  primarySsoEnabled: false;
  notificationsEnabled: false;
  currentQueueItems: AttentionDualReadCurrentQueueItem[];
  attentionPrimaryItems: UnifiedDecisionItemProjection[];
  comparison: AttentionInternalDualReadComparison;
  shadowVerdict?: AttentionShadowVerdict;
  shadowVerdictReason?: string;
}
