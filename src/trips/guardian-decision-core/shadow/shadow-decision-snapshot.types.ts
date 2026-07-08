/**
 * WP1 — normalized decision snapshot for Legacy vs RFC-001 shadow comparison.
 */

export type ShadowFinalAction =
  | 'ALLOW'
  | 'REJECT'
  | 'ADJUST'
  | 'REPLACE'
  | 'DEFER_TO_HUMAN'
  | 'NO_DECISION';

export type ShadowDiffKind =
  | 'AGREEMENT'
  | 'RFC_PREFERRED'
  | 'LEGACY_PREFERRED'
  | 'STRATEGY_DIFFERENCE'
  | 'INPUT_INCONSISTENCY'
  | 'INDETERMINATE';

export interface ShadowDecisionSnapshot {
  source: 'legacy' | 'rfc001';
  finalAction: ShadowFinalAction;
  allowed: boolean;
  hardBlockOnOriginal: boolean;
  affectedPlanItemIds: string[];
  candidateIds: string[];
  selectedCandidateId?: string;
  reasonCodes: string[];
  hasPlanMutation: boolean;
  latencyMs: number;
}

export interface ShadowComparisonMetrics {
  decisionAgreement: boolean;
  hardBlockAgreement: boolean;
  affectedScopeAgreement: boolean;
  affectedScopeJaccard: number;
  candidateIntersection: string[];
  candidateUnion: string[];
  candidateOverlapRate: number;
  reasonCodeOverlap: string[];
  reasonCodeCoverage: number;
  executionEligibilityAgreement: boolean;
}

export interface ShadowComparisonDiff {
  kind: ShadowDiffKind;
  summary: string;
  details: string[];
}

export interface ShadowComparisonResult {
  schemaId: 'tripnara.rfc001_shadow_comparison@v1';
  tripId: string;
  eventId: string;
  comparedAt: string;
  legacy: ShadowDecisionSnapshot;
  rfc001: ShadowDecisionSnapshot;
  metrics: ShadowComparisonMetrics;
  diff: ShadowComparisonDiff;
}

export interface ShadowComparisonAggregate {
  sampleCount: number;
  decisionAgreementRate: number;
  hardBlockAgreementRate: number;
  affectedScopeAgreementRate: number;
  meanCandidateOverlapRate: number;
  meanReasonCodeCoverage: number;
  executionEligibilityAgreementRate: number;
  latencyLegacyP50Ms: number;
  latencyRfc001P50Ms: number;
  diffKindCounts: Partial<Record<ShadowDiffKind, number>>;
}
