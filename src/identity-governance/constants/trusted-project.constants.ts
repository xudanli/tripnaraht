export const TRUSTED_PROJECT_COMMERCIAL_TYPES = ['NON_COMMERCIAL', 'COMMERCIAL'] as const;
export type TrustedProjectCommercialType = (typeof TRUSTED_PROJECT_COMMERCIAL_TYPES)[number];

export const TRUSTED_PROJECT_REVIEW_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEED_REVISION',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const;
export type TrustedProjectReviewStatus = (typeof TRUSTED_PROJECT_REVIEW_STATUSES)[number];

export const TRUSTED_PROJECT_LISTING_STATUSES = [
  'draft',
  'pending_review',
  'published',
  'closed',
  'suspended',
] as const;
export type TrustedProjectListingStatus = (typeof TRUSTED_PROJECT_LISTING_STATUSES)[number];

export const TRUSTED_PROJECT_APPLICATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'withdrawn',
] as const;

export function requiredPublishingLevel(
  commercialType: TrustedProjectCommercialType,
): 'PUBLIC_NON_COMMERCIAL' | 'PUBLIC_COMMERCIAL' {
  return commercialType === 'COMMERCIAL' ? 'PUBLIC_COMMERCIAL' : 'PUBLIC_NON_COMMERCIAL';
}
