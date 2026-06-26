export const ENDORSEMENT_STATUSES = ['PENDING', 'ACTIVE', 'REVOKED', 'REJECTED'] as const;
export type EndorsementStatus = (typeof ENDORSEMENT_STATUSES)[number];

export const ENDORSEMENT_SUBJECT_TYPES = ['USER', 'ORGANIZATION'] as const;
export type EndorsementSubjectType = (typeof ENDORSEMENT_SUBJECT_TYPES)[number];

export const ENDORSEMENT_TYPES = [
  'PROJECT_LEADERSHIP',
  'SAFETY_PRACTICES',
  'DESTINATION_EXPERTISE',
  'TEAM_COORDINATION',
  'CRISIS_HANDLING',
  'MEMBER_SATISFACTION',
] as const;
export type EndorsementType = (typeof ENDORSEMENT_TYPES)[number];
