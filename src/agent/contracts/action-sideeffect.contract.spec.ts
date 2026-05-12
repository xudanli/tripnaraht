import {
  isActionStatus,
  isActionType,
  mapSagaStatusToActionStatus,
} from './action-sideeffect.contract';

describe('action-sideeffect.contract', () => {
  it('validates action type and status values', () => {
    expect(isActionType('BOOKING_CANCEL')).toBe(true);
    expect(isActionType('BOOK')).toBe(false);
    expect(isActionStatus('COMMITTED')).toBe(true);
    expect(isActionStatus('PENDING')).toBe(false);
  });

  it('maps saga status to unified action status', () => {
    expect(mapSagaStatusToActionStatus('INIT')).toBe('COMMITTING');
    expect(mapSagaStatusToActionStatus('SIDE_EFFECT_DONE')).toBe('SIDE_EFFECT_DONE');
    expect(mapSagaStatusToActionStatus('MANUAL_INTERVENTION_REQUIRED')).toBe('MANUAL_REVIEW');
    expect(mapSagaStatusToActionStatus('CLEANED')).toBe('ROLLBACK_DONE');
  });
});
