export const REPUTATION_EVENT_TYPES = [
  'PROJECT_COMPLETED',
  'PROJECT_CANCELLED_BY_PROVIDER',
  'MEMBER_WITHDREW',
  'MEMBER_WITHDREW_NORMAL',
  'MEMBER_WITHDREW_LATE',
  'DOCUMENT_SUBMITTED_ON_TIME',
  'COMPLAINT_CONFIRMED',
  'PAYMENT_DISPUTE_UNRESOLVED',
  'PLAN_B_EXECUTED',
  'SAFETY_INCIDENT_CONFIRMED',
  'PROJECT_INFO_MISMATCH_CONFIRMED',
] as const;
export type ReputationEventType = (typeof REPUTATION_EVENT_TYPES)[number];

export const REPUTATION_SUBJECT_TYPES = ['USER', 'ORGANIZATION'] as const;
export type ReputationSubjectType = (typeof REPUTATION_SUBJECT_TYPES)[number];

export const REPUTATION_DISPUTE_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'UPHELD',
  'REJECTED',
] as const;
export type ReputationDisputeStatus = (typeof REPUTATION_DISPUTE_STATUSES)[number];

export const REPUTATION_DISPUTE_OPEN_STATUSES = ['SUBMITTED', 'UNDER_REVIEW'] as const;

export type ReputationFactsSummary = {
  projectsCompleted: number;
  projectsCancelledByProvider: number;
  memberWithdrawals: number;
  memberWithdrawalsLate: number;
  documentsSubmittedOnTime: number;
  complaintsConfirmed: number;
  paymentDisputesUnresolved: number;
  planBExecuted: number;
  safetyIncidentsConfirmed: number;
  lastProjectCompletedAt: string | null;
};

export function buildReputationFactsSummary(
  events: Array<{ eventType: string; occurredAt: Date }>,
): ReputationFactsSummary {
  const count = (type: string) => events.filter((e) => e.eventType === type).length;
  const completed = events.filter((e) => e.eventType === 'PROJECT_COMPLETED');
  const lastCompleted = completed.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];

  return {
    projectsCompleted: count('PROJECT_COMPLETED'),
    projectsCancelledByProvider: count('PROJECT_CANCELLED_BY_PROVIDER'),
    memberWithdrawals: count('MEMBER_WITHDREW') + count('MEMBER_WITHDREW_NORMAL'),
    memberWithdrawalsLate: count('MEMBER_WITHDREW_LATE'),
    documentsSubmittedOnTime: count('DOCUMENT_SUBMITTED_ON_TIME'),
    complaintsConfirmed: count('COMPLAINT_CONFIRMED'),
    paymentDisputesUnresolved: count('PAYMENT_DISPUTE_UNRESOLVED'),
    planBExecuted: count('PLAN_B_EXECUTED'),
    safetyIncidentsConfirmed: count('SAFETY_INCIDENT_CONFIRMED'),
    lastProjectCompletedAt: lastCompleted ? lastCompleted.occurredAt.toISOString() : null,
  };
}
