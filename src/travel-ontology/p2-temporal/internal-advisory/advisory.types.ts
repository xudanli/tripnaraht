/**
 * ONT-P2-02B — InternalTemporalAdvisory contract (version-bound)
 */

export const INTERNAL_TEMPORAL_ADVISORY_SCHEMA_ID =
  'tripnara.internal_temporal_advisory@v2' as const;

export type AdvisoryLifecycleStatus =
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'RECONCILED';

export type AdvisoryExpectedOutcome =
  | 'WARNING'
  | 'NEED_CONFIRM'
  | 'BLOCK'
  | 'UNKNOWN';

export interface InternalTemporalAdvisory {
  schemaId: typeof INTERNAL_TEMPORAL_ADVISORY_SCHEMA_ID;
  advisoryId: string;

  predictionId: string;
  predictionVersion: string;
  temporalImpactId: string;

  tripId: string;
  routeSegmentId?: string;
  contextRevision: number;
  factSetVersion: string;

  predictedOnset?: string;
  predictedDeterioration?: string;
  interventionDeadline?: string;

  expectedOutcome: AdvisoryExpectedOutcome;
  confidence: number;
  evidenceRefs: string[];

  /** Recommended draft (never auto-applied) */
  recommendedDraft: {
    primary: string;
    alternatives: string[];
  };

  /** Fixed 5-section internal copy */
  display: {
    whatPredicted: string;
    whyRelevant: string;
    latestActionBy: string;
    currentRecommendation: string;
    /** Must always be visible — never collapsed */
    authorityStatus: string;
  };

  authorityMode: 'SHADOW';
  labels: {
    predictionOnly: true;
    notCanonicalAssessment: true;
    willNotModifyPlan: true;
  };

  status: AdvisoryLifecycleStatus;
  supersededByAdvisoryId?: string;
  withdrawnReason?: string;

  /** Optional P1 conflict note — never overrides Canonical */
  p1CanonicalConflict?: {
    p1Outcome: string;
    note: string;
  };

  emittedAt: string;
  expiresAt?: string;
}

export type PredictionQualityFeedback =
  | 'TIMING_MATCH'
  | 'TOO_EARLY'
  | 'TOO_LATE'
  | 'FALSE_POSITIVE'
  | 'FALSE_NEGATIVE'
  | 'WRONG_ROUTE_BINDING'
  | 'WRONG_VEHICLE_ASSUMPTION'
  | 'INSUFFICIENT_EVIDENCE';

export type ProductAdviceFeedback =
  | 'USEFUL'
  | 'ACTIONABLE'
  | 'NOT_ACTIONABLE'
  | 'UNCLEAR'
  | 'TOO_ALARMING'
  | 'TOO_WEAK'
  | 'RECOMMENDATION_NOT_FEASIBLE'
  | 'DUPLICATE_WITH_P1_ALERT';

export interface InternalAdvisoryFeedback {
  schemaId: 'tripnara.internal_advisory_feedback@v1';
  feedbackId: string;
  advisoryId: string;
  predictionId: string;
  predictionVersion: string;
  contextRevision: number;
  reviewerId: string;
  reviewedAt: string;
  predictionQuality: PredictionQualityFeedback;
  productAdvice: ProductAdviceFeedback;
  notes?: string;
}
