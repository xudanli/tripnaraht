export const PROFESSIONAL_CERT_STATUSES = [
  'NOT_STARTED',
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEED_MORE_INFO',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'SUSPENDED',
  'REVOKED',
] as const;
export type ProfessionalCertStatus = (typeof PROFESSIONAL_CERT_STATUSES)[number];

const TRANSITIONS: Record<ProfessionalCertStatus, ProfessionalCertStatus[]> = {
  NOT_STARTED: ['DRAFT'],
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['NEED_MORE_INFO', 'VERIFIED', 'REJECTED'],
  NEED_MORE_INFO: ['SUBMITTED'],
  VERIFIED: ['EXPIRED', 'SUSPENDED', 'REVOKED'],
  REJECTED: ['DRAFT'],
  EXPIRED: ['UNDER_REVIEW'],
  SUSPENDED: ['VERIFIED', 'REVOKED'],
  REVOKED: [],
};

export function assertProfessionalCertTransition(
  from: ProfessionalCertStatus,
  to: ProfessionalCertStatus,
): void {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid professional certification transition: ${from} -> ${to}`);
  }
}

export const PROFESSIONAL_CERT_VALIDITY_YEARS = 1;
