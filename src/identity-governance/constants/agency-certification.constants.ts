export const AGENCY_CERT_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEED_MORE_INFO',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
] as const;
export type AgencyCertStatus = (typeof AGENCY_CERT_STATUSES)[number];

const TRANSITIONS: Record<AgencyCertStatus, AgencyCertStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['NEED_MORE_INFO', 'VERIFIED', 'REJECTED'],
  NEED_MORE_INFO: ['SUBMITTED'],
  VERIFIED: ['SUSPENDED'],
  REJECTED: ['DRAFT'],
  SUSPENDED: ['VERIFIED'],
};

export function assertAgencyCertTransition(from: AgencyCertStatus, to: AgencyCertStatus): void {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid agency certification transition: ${from} -> ${to}`);
  }
}

export const AGENCY_CERT_VALIDITY_YEARS = 2;

export const PUBLISHING_APPLICATION_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type PublishingApplicationStatus = (typeof PUBLISHING_APPLICATION_STATUSES)[number];
