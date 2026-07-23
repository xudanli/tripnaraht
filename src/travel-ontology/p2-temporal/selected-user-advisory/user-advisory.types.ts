/**
 * ONT-P2-03A — User advisory types + display (experiment banner always visible)
 */

export const USER_TEMPORAL_ADVISORY_SCHEMA_ID =
  'tripnara.user_temporal_advisory@v1' as const;

export type UserAdvisoryLifecycleStatus =
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'WITHDRAWN'
  | 'RESOLVED'
  | 'EXPIRED';

export type UserAdvisoryExpectedOutcome =
  | 'WARNING'
  | 'NEED_CONFIRM'
  | 'UNKNOWN';

export interface UserTemporalAdvisory {
  schemaId: typeof USER_TEMPORAL_ADVISORY_SCHEMA_ID;
  advisoryId: string;
  predictionId: string;
  predictionVersion: string;
  temporalImpactId: string;
  tripId: string;
  userId: string;
  routeSegmentId?: string;
  contextRevision: number;
  factSetVersion: string;
  predictedOnset?: string;
  predictedDeterioration?: string;
  interventionDeadline?: string;
  expectedOutcome: UserAdvisoryExpectedOutcome;
  confidence: number;
  evidenceRefs: string[];
  authorityMode: 'SHADOW';
  deliveryMode: 'ADVISORY_ONLY';
  /** Experiment banner — always shown */
  experimentBanner: {
    title: '天气预测建议 · 实验功能';
    willNotAutoModifyPlan: true;
    canonicalRiskTakesPrecedence: true;
  };
  display: {
    whatPredicted: string;
    whyRelevant: string;
    latestActionBy: string;
    recommendation: string;
    currentStatus: string;
  };
  /** Allowed CTA — never one-click adopt */
  allowedActions: Array<
    | 'VIEW_EVIDENCE'
    | 'VIEW_PREDICTION_UPDATED_AT'
    | 'VIEW_AFFECTED_SEGMENT'
    | 'VIEW_RECOMMENDATION'
    | 'ENTER_EXISTING_PLANNING_FLOW'
    | 'FEEDBACK_USEFUL'
    | 'DISMISS_EXPERIMENT'
  >;
  forbiddenActions: Array<
    | 'ADOPT_AND_MUTATE_PLAN'
    | 'AUTO_REROUTE'
    | 'IMMEDIATE_CONFIRM'
    | 'CONTINUE_EXECUTE'
    | 'IGNORE_CANONICAL_RISK'
  >;
  /** When P1 is BLOCK — supplemental only, never softens */
  p1CanonicalSupplement?: {
    p1Outcome: 'BLOCK' | 'WARNING' | 'NEED_CONFIRM' | string;
    supplementOnly: true;
    text: string;
  };
  withdrawalNotice?: string;
  status: UserAdvisoryLifecycleStatus;
  supersededByAdvisoryId?: string;
  emittedAt: string;
  expiresAt?: string;
}

export interface UserAdvisoryDryRunAudit {
  candidateId: string;
  tripId: string;
  userId: string;
  predictionId: string;
  eligible: boolean;
  consentMatched: boolean;
  tripMatched: boolean;
  predictionActive: boolean;
  contextRevisionMatched: boolean;
  canonicalConflictChecked: boolean;
  wouldEmit: boolean;
  blockedReason?: string;
}
