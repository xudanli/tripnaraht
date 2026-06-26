export const ELIGIBILITY_RULE_TYPES = ['LEGAL', 'SAFETY', 'RESOURCE', 'POLICY'] as const;
export type EligibilityRuleType = (typeof ELIGIBILITY_RULE_TYPES)[number];

export const ELIGIBILITY_SEVERITIES = ['BLOCKER', 'MUST_CONFIRM', 'WARNING'] as const;
export type EligibilitySeverity = (typeof ELIGIBILITY_SEVERITIES)[number];

export const EVIDENCE_REQUIREMENTS = [
  'SELF_DECLARE',
  'DOCUMENT',
  'VERIFIED_CREDENTIAL',
  'MANUAL_REVIEW',
] as const;

export const WAIVER_POLICIES = ['NOT_ALLOWED', 'LEADER_APPROVAL', 'AGENCY_APPROVAL'] as const;

export const FIT_ASSESSMENT_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'ABANDONED',
  'EXPIRED',
] as const;
export type FitAssessmentStatus = (typeof FIT_ASSESSMENT_STATUSES)[number];

export const FIT_OVERALL_RESULTS = [
  'HIGH_FIT',
  'BASIC_FIT',
  'CONDITIONAL',
  'NOT_RECOMMENDED',
] as const;
export type FitOverallResult = (typeof FIT_OVERALL_RESULTS)[number];

export const DIMENSION_STATUSES = [
  'MATCH',
  'ACCEPTABLE_GAP',
  'NEEDS_CONFIRMATION',
  'HIGH_FRICTION',
  'NOT_APPLICABLE',
] as const;
export type DimensionStatus = (typeof DIMENSION_STATUSES)[number];

export const TEAM_IMPACT_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'BLOCKING'] as const;
export type TeamImpactLevel = (typeof TEAM_IMPACT_LEVELS)[number];

export const APPLICATION_STATUSES = [
  'DRAFT',
  'ASSESSMENT_IN_PROGRESS',
  'ASSESSMENT_COMPLETED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'WAITLISTED',
  'APPROVED',
  'REJECTED',
  'USER_CONFIRMED',
  'JOINED',
  'WITHDRAWN',
  'APPROVAL_REVOKED',
] as const;

export const LEADER_DECISIONS = [
  'APPROVE',
  'APPROVE_AFTER_CLARIFICATION',
  'WAITLIST',
  'REJECT',
  'REVOKE_APPROVAL',
] as const;

export const STRUCTURED_REJECT_REASONS = [
  'HARD_ELIGIBILITY_FAILED',
  'TEAM_IMPACT_BLOCKING',
  'INSUFFICIENT_EVIDENCE',
  'CAPACITY_FULL',
  'RISK_MISMATCH',
  'OTHER',
] as const;

export const FIT_QUESTION_KEYS = [
  'dates_available',
  'age_in_range',
  'budget_affordable',
  'pace_acceptance',
  'risk_acceptance',
  'accommodation_shared',
  'activity_interest',
  'equipment_ready',
] as const;

export const FIT_SOFT_DIMENSIONS = [
  'pace',
  'risk',
  'accommodation',
  'activity',
  'budget_flexibility',
] as const;

export type HardRuleResult = {
  ruleId: string;
  conditionKey: string;
  severity: EligibilitySeverity;
  passed: boolean;
  message: string;
  waiverPolicy: string;
};

export type DimensionResult = {
  dimension: string;
  status: DimensionStatus;
  summary: string;
  privacySafeSummary: string;
};

export type TeamImpactResult = {
  level: TeamImpactLevel;
  summary: string;
  privacySafeSummary: string;
  factors: string[];
};

export type FitEvaluationOutput = {
  overallResult: FitOverallResult;
  hardResults: HardRuleResult[];
  dimensionResults: DimensionResult[];
  teamImpactResult: TeamImpactResult;
  requiredConfirmations: string[];
  explanationBundle: {
    applicant: string[];
    leader: string[];
    operator: string[];
  };
};

export const FIT_RESULT_LABELS: Record<FitOverallResult, string> = {
  HIGH_FIT: '高度适合',
  BASIC_FIT: '基本适合',
  CONDITIONAL: '条件适合',
  NOT_RECOMMENDED: '当前不建议加入',
};

export const APPEAL_STATUSES = [
  'SUBMITTED',
  'TRIAGED',
  'UNDER_REVIEW',
  'UPHELD',
  'PARTIALLY_UPHELD',
  'REJECTED',
] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export const APPEAL_OPEN_STATUSES = ['SUBMITTED', 'TRIAGED', 'UNDER_REVIEW'] as const;

export const COMMITMENT_STATUSES = [
  'NOT_REQUIRED',
  'DEPOSIT_REQUIRED',
  'DEPOSIT_PAID',
  'DEPOSIT_WAIVED',
] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const APPLICATION_CENTER_STATUSES = [
  'DRAFT',
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'WAITLISTED',
  'APPROVED',
  'REJECTED',
  'USER_CONFIRMED',
  'JOINED',
  'WITHDRAWN',
  'APPROVAL_REVOKED',
] as const;
