import {
  isSideEffectStatus,
  isSideEffectType,
  mapLedgerEntryToSideEffect,
  mapLedgerStatusToSideEffectStatus,
  requiresIdempotencyKey,
  SIDE_EFFECT_COMPENSATION_MAP,
} from './side-effect.contract';

describe('side-effect.contract', () => {
  it('validates side effect type and status', () => {
    expect(isSideEffectType('INVENTORY_LOCK')).toBe(true);
    expect(isSideEffectType('UNKNOWN')).toBe(false);
    expect(isSideEffectStatus('DONE')).toBe(true);
    expect(isSideEffectStatus('ROLLBACK')).toBe(false);
  });

  it('maps existing ledger statuses into unified side-effect status', () => {
    expect(mapLedgerStatusToSideEffectStatus('APPLIED')).toBe('DONE');
    expect(mapLedgerStatusToSideEffectStatus('CLEANING_IN_PROGRESS')).toBe('RETRYING');
    expect(mapLedgerStatusToSideEffectStatus('MANUAL_INTERVENTION_REQUIRED')).toBe('MANUAL_REVIEW');
    expect(mapLedgerStatusToSideEffectStatus('COMPENSATED')).toBe('COMPENSATED');
  });

  it('enforces idempotency requirement for financial and booking side effects', () => {
    expect(requiresIdempotencyKey('FINANCIAL_HOLD')).toBe(true);
    expect(requiresIdempotencyKey('BOOKING_CANCEL')).toBe(true);
    expect(requiresIdempotencyKey('INVENTORY_LOCK')).toBe(false);
  });

  it('contains compensation mappings for key side effect types', () => {
    expect(SIDE_EFFECT_COMPENSATION_MAP.INVENTORY_LOCK).toBe('INVENTORY_RELEASE');
    expect(SIDE_EFFECT_COMPENSATION_MAP.FINANCIAL_HOLD).toBe('FINANCIAL_REFUND');
  });

  it('maps ledger entry to unified side effect contract object', () => {
    const se = mapLedgerEntryToSideEffect(
      {
        handler_id: 'side_effect.resource_lock.inventory_v1',
        kind: 'RESOURCE_LOCK',
        status: 'APPLIED',
        retry_count: 0,
        resource_ref: { type: 'INVENTORY_LOCK', id: 'inv-1' },
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      { actionId: 'act_1', requestId: 'req_1' },
    );
    expect(se.type).toBe('INVENTORY_LOCK');
    expect(se.status).toBe('DONE');
    expect(se.actionId).toBe('act_1');
  });
});
