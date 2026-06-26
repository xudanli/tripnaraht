export const VERIFICATION_TYPES = [
  'PHONE',
  'EMAIL',
  'REAL_NAME',
  'AGE',
  'FACE',
  'ENTERPRISE',
] as const;
export type VerificationType = (typeof VERIFICATION_TYPES)[number];

export const VERIFICATION_STATUSES = [
  'NOT_STARTED',
  'PENDING',
  'NEED_MORE_INFO',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'SUSPENDED',
  'REVOKED',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const PUBLISHING_LEVELS = [
  'PRIVATE_ONLY',
  'PUBLIC_NON_COMMERCIAL',
  'PUBLIC_COMMERCIAL',
] as const;
export type PublishingLevel = (typeof PUBLISHING_LEVELS)[number];

export const PUBLISHING_PERMISSION_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type PublishingPermissionStatus = (typeof PUBLISHING_PERMISSION_STATUSES)[number];

export const ACCOUNT_CONTEXT_TYPES = ['personal', 'professional', 'organization'] as const;
export type AccountContextType = (typeof ACCOUNT_CONTEXT_TYPES)[number];

export const SUBSCRIPTION_PLANS = ['FREE', 'ORGANIZER_PRO', 'PROFESSIONAL_PRO', 'AGENCY_PLAN'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const PROJECT_ROLES = ['participant', 'organizer', 'payer'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const ORGANIZATION_MEMBER_STATUSES = [
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'LEFT',
  'REMOVED',
] as const;

export const MATCH_SQUARE_FROZEN_MESSAGE =
  '搭子广场公开招募已暂停，请使用可信旅行项目发布';

export const MATCH_SQUARE_FROZEN_CODE = 'MATCH_SQUARE_FROZEN';

export function isPublicPublishingLevel(level: string): boolean {
  return level === 'PUBLIC_NON_COMMERCIAL' || level === 'PUBLIC_COMMERCIAL';
}
