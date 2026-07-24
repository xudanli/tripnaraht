/**
 * Shadow Review Queue — blind A/B manual review cases from OptimizationShadowEvent.
 */

import type {
  DivergenceSeverity,
  ManualReviewVerdict,
  ShadowDivergenceType,
} from './shadow-divergence.types';

export type ShadowReviewCaseStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'COMPLETED'
  | 'EXCLUDED';

export interface ReviewPlanDaySummary {
  day: number;
  date?: string;
  slots: Array<{
    title: string;
    startTime?: string;
    endTime?: string;
    driveMinutesFromPrev?: number;
  }>;
  totalDriveMinutes?: number;
}

/** Blinded plan view — no strategy / candidateId leakage */
export interface ReviewPlanSnapshot {
  schemaId: 'tripnara.review_plan_snapshot@v1';
  dayCount: number;
  slotCount: number;
  totalDriveMinutes: number;
  days: ReviewPlanDaySummary[];
  utilityHint?: number;
  feasibilityLabel?: 'FEASIBLE' | 'UNVERIFIED' | 'INFEASIBLE' | 'UNKNOWN';
}

/** Frozen at materialize — persisted, never mutated */
export interface FrozenReviewPlanSnapshot extends ReviewPlanSnapshot {
  candidateId: string;
  candidateHash: string;
  planJson: unknown;
  constraintSummaryJson?: unknown;
  objectiveScoresJson?: unknown;
  snapshotId?: string;
  objectiveVersion?: string;
  /** Internal audit only — never returned to clients */
  strategyVersionHidden?: string;
  createdAt: string;
}

export interface ReviewScorecard {
  reasonableness: number;
  executability: number;
  requirementFit: number;
  paceFit: number;
}

export interface ReviewAssignment {
  reviewerId?: string;
  preferredOption: ReviewPreferredOption;
  /** Server-derived after submit — omitted from blind queue views */
  classification?: ManualReviewVerdict;
  scores: ReviewScorecard;
  tradeOffSummary: string;
  confidence: number;
  submittedAt: string;
}

export type ReviewPreferredOption =
  | 'A'
  | 'B'
  | 'EQUIVALENT'
  | 'BOTH_INVALID'
  | 'INSUFFICIENT_INFORMATION';

export interface ShadowReviewCase {
  schemaId: 'tripnara.shadow_review_case@v1';
  reviewCaseId: string;
  comparisonId: string;
  decisionRunId: string;
  tripId: string;

  status: ShadowReviewCaseStatus;

  /** Internal — not exposed in blind GET response */
  authorityCandidateId: string;
  shadowCandidateId: string;

  divergenceTypes: ShadowDivergenceType[];
  divergenceSeverity: DivergenceSeverity;

  eligibleForReview: boolean;
  exclusionReason?: string;

  /** Option A/B assignment is stable per reviewCaseId */
  blindedOptionA: ReviewPlanSnapshot;
  blindedOptionB: ReviewPlanSnapshot;

  /** Maps blind label → underlying role (server-side only, encrypted at rest) */
  blindMapping: {
    optionAIs: 'AUTHORITY' | 'SHADOW';
    optionBIs: 'AUTHORITY' | 'SHADOW';
  };

  frozenSnapshots?: {
    authority: FrozenReviewPlanSnapshot;
    shadow: FrozenReviewPlanSnapshot;
  };

  blindingVersion?: string;
  expectedReviewCount?: number;
  completedReviewCount?: number;

  reviewAssignments: ReviewAssignment[];
  createdAt: string;
  updatedAt: string;
}

/** Public blind view — no strategy or candidateId fields */
export interface ShadowReviewCaseBlindView {
  reviewCaseId: string;
  comparisonId: string;
  tripId: string;
  status: ShadowReviewCaseStatus;
  divergenceTypes: ShadowDivergenceType[];
  divergenceSeverity: DivergenceSeverity;
  blindedOptionA: ReviewPlanSnapshot;
  blindedOptionB: ReviewPlanSnapshot;
  reviewAssignments: ReviewAssignment[];
  createdAt: string;
}

export interface ShadowReviewMaterializeResult {
  scanned: number;
  created: number;
  alreadyExists: number;
  excluded: number;
  failed: number;
  materialized: ShadowReviewCaseBlindView[];
  skipped: Array<{ comparisonId: string; reason: string }>;
}

export interface ShadowReviewStatsSnapshot {
  schemaId: 'tripnara.shadow_review_stats@v1';
  collectedAt: string;
  totalCases: number;
  byStatus: Record<ShadowReviewCaseStatus, number>;
  byClassification: Record<ManualReviewVerdict, number>;
  byDivergenceType: Record<string, number>;
  bySeverity: Record<DivergenceSeverity, number>;
  completedReviews: number;
}
