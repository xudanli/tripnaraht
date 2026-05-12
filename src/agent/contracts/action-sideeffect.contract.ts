export const ACTION_TYPE_VALUES = [
  'PLAN_EDIT',
  'ROUTE_RECOMPUTE',
  'BOOKING_HOLD',
  'BOOKING_COMMIT',
  'PAYMENT_HOLD',
  'PAYMENT_CAPTURE',
  'BOOKING_CANCEL',
  'NOTIFICATION_SEND',
] as const;

export type ActionType = (typeof ACTION_TYPE_VALUES)[number];

export const ACTION_STATUS_VALUES = [
  'DRAFT',
  'PREVIEW',
  'VALIDATED',
  'COMMITTING',
  'COMMITTED',
  'SIDE_EFFECT_PENDING',
  'SIDE_EFFECT_DONE',
  'FAILED',
  'ROLLBACK_REQUIRED',
  'ROLLBACK_DONE',
  'MANUAL_REVIEW',
] as const;

export type ActionStatus = (typeof ACTION_STATUS_VALUES)[number];

export interface Action {
  actionId: string;
  handlerId: string;
  type: ActionType;

  input: Record<string, any>;
  output?: Record<string, any>;

  status: ActionStatus;

  idempotencyKey: string;

  contextSignature?: string;

  createdAt: string;
  updatedAt: string;
}

export function isActionType(value: string): value is ActionType {
  return ACTION_TYPE_VALUES.includes(value as ActionType);
}

export function isActionStatus(value: string): value is ActionStatus {
  return ACTION_STATUS_VALUES.includes(value as ActionStatus);
}

/**
 * Temporary adapter that maps existing saga log statuses into the unified
 * ActionStatus contract, so legacy runtime can progressively migrate.
 */
export function mapSagaStatusToActionStatus(status: string): ActionStatus {
  const s = String(status ?? '').toUpperCase();
  if (s === 'INIT') return 'COMMITTING';
  if (s === 'COMMITTED') return 'COMMITTED';
  if (s === 'SIDE_EFFECT_DONE') return 'SIDE_EFFECT_DONE';
  if (s === 'FAILED') return 'FAILED';
  if (s === 'CLEANING_IN_PROGRESS') return 'ROLLBACK_REQUIRED';
  if (s === 'MANUAL_INTERVENTION_REQUIRED') return 'MANUAL_REVIEW';
  if (s === 'CLEANED') return 'ROLLBACK_DONE';
  return 'FAILED';
}
