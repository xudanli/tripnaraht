export const SIDE_EFFECT_TYPE_VALUES = [
  'INVENTORY_LOCK',
  'INVENTORY_RELEASE',
  'FINANCIAL_HOLD',
  'FINANCIAL_CAPTURE',
  'FINANCIAL_REFUND',
  'BOOKING_CREATE',
  'BOOKING_CANCEL',
  'PLAN_MUTATION',
  'CONTEXT_INVALIDATE',
] as const;

export type SideEffectType = (typeof SIDE_EFFECT_TYPE_VALUES)[number];

export const SIDE_EFFECT_STATUS_VALUES = [
  'PENDING',
  'RUNNING',
  'DONE',
  'FAILED',
  'RETRYING',
  'COMPENSATED',
  'MANUAL_REVIEW',
] as const;

export type SideEffectStatus = (typeof SIDE_EFFECT_STATUS_VALUES)[number];

export interface SideEffect {
  sideEffectId: string;
  actionId: string;
  handlerId: string;

  type: SideEffectType;
  status: SideEffectStatus;

  input: Record<string, any>;
  output?: Record<string, any>;

  idempotencyKey: string;

  retryCount: number;
  maxRetry: number;

  compensationActionId?: string;

  createdAt: string;
  updatedAt: string;
}

export interface SideEffectLedgerLike {
  handler_id: string;
  kind?: string;
  status: string;
  retry_count?: number;
  resource_ref?: { type: string; id: string } | null;
  updated_at?: string;
}

export function isSideEffectType(value: string): value is SideEffectType {
  return SIDE_EFFECT_TYPE_VALUES.includes(value as SideEffectType);
}

export function isSideEffectStatus(value: string): value is SideEffectStatus {
  return SIDE_EFFECT_STATUS_VALUES.includes(value as SideEffectStatus);
}

export const SIDE_EFFECT_COMPENSATION_MAP: Record<string, string> = {
  INVENTORY_LOCK: 'INVENTORY_RELEASE',
  FINANCIAL_HOLD: 'FINANCIAL_REFUND',
  FINANCIAL_CAPTURE: 'FINANCIAL_REFUND',
  BOOKING_CREATE: 'BOOKING_CANCEL',
  PLAN_MUTATION: 'PLAN_RESTORE',
};

export function requiresIdempotencyKey(sideEffectType: string): boolean {
  const u = String(sideEffectType ?? '').toUpperCase();
  return u.startsWith('FINANCIAL_') || u.startsWith('BOOKING_');
}

/**
 * Adapter: maps existing side-effect ledger statuses to unified SideEffectStatus.
 */
export function mapLedgerStatusToSideEffectStatus(ledgerStatus: string): SideEffectStatus {
  const s = String(ledgerStatus ?? '').toUpperCase();
  if (s === 'APPLIED') return 'DONE';
  if (s === 'COMPENSATED') return 'COMPENSATED';
  if (s === 'APPLY_FAILED' || s === 'COMPENSATION_FAILED') return 'FAILED';
  if (s === 'CLEANING_IN_PROGRESS') return 'RETRYING';
  if (s === 'MANUAL_INTERVENTION_REQUIRED') return 'MANUAL_REVIEW';
  return 'PENDING';
}

function deriveSideEffectTypeFromLedger(entry: SideEffectLedgerLike): SideEffectType {
  const resourceType = String(entry.resource_ref?.type ?? '').toUpperCase();
  if (resourceType === 'INVENTORY_LOCK') return 'INVENTORY_LOCK';
  if (resourceType === 'FINANCIAL_HOLD') return 'FINANCIAL_HOLD';
  const kind = String(entry.kind ?? '').toUpperCase();
  if (kind === 'RESOURCE_LOCK') return 'INVENTORY_LOCK';
  if (kind === 'FINANCIAL_HOLD') return 'FINANCIAL_HOLD';
  const handler = String(entry.handler_id ?? '').toUpperCase();
  if (handler.includes('REFUND')) return 'FINANCIAL_REFUND';
  if (handler.includes('CAPTURE')) return 'FINANCIAL_CAPTURE';
  if (handler.includes('RELEASE')) return 'INVENTORY_RELEASE';
  if (handler.includes('LOCK')) return 'INVENTORY_LOCK';
  if (handler.includes('BOOKING') && handler.includes('CANCEL')) return 'BOOKING_CANCEL';
  if (handler.includes('BOOKING')) return 'BOOKING_CREATE';
  return 'CONTEXT_INVALIDATE';
}

export function mapLedgerEntryToSideEffect(
  entry: SideEffectLedgerLike,
  params: { actionId: string; requestId: string },
): SideEffect {
  const type = deriveSideEffectTypeFromLedger(entry);
  const now = entry.updated_at ?? new Date().toISOString();
  return {
    sideEffectId: `${params.actionId}:${entry.handler_id}:${now}`,
    actionId: params.actionId,
    handlerId: entry.handler_id,
    type,
    status: mapLedgerStatusToSideEffectStatus(entry.status),
    input: {},
    output: entry.resource_ref ? { resource_ref: entry.resource_ref } : undefined,
    idempotencyKey: `${params.requestId}:${entry.handler_id}`,
    retryCount: Number(entry.retry_count ?? 0),
    maxRetry: 3,
    createdAt: now,
    updatedAt: now,
  };
}
