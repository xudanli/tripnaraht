export const QUALIFICATION_STATUSES = [
  'PENDING',
  'VERIFIED',
  'EXPIRED',
  'REVOKED',
  'REJECTED',
] as const;
export type QualificationStatus = (typeof QUALIFICATION_STATUSES)[number];

export const QUALIFICATION_SUBJECT_TYPES = ['USER', 'ORGANIZATION'] as const;
export type QualificationSubjectType = (typeof QUALIFICATION_SUBJECT_TYPES)[number];

export const COMMON_QUALIFICATION_TYPES = [
  'FIRST_AID',
  'OUTDOOR_GUIDE',
  'SKI_INSTRUCTOR',
  'DIVE_INSTRUCTOR',
  'MOUNTAINEERING',
  'DRIVING_LICENSE',
  'DESTINATION_EXPERIENCE',
] as const;
