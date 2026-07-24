import { WRITEBACK_CORRIDOR_AUDIT_MATRIX } from './writeback-corridor-audit.matrix';

describe('writeback-corridor-audit.matrix', () => {
  it('includes ITINERARY_ADJUST with trip_itinerary_item persistence and narrow AUTO', () => {
    const row = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'itinerary_adjust_apply');
    expect(row?.persistence).toBe('trip_itinerary_item');
    expect(row?.auto).toBe('narrow_corridor');
  });

  it('marks Iceland apply as plan_version without AUTO', () => {
    const row = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'iceland_apply');
    expect(row?.persistence).toBe('plan_version');
    expect(row?.auto).toBe('never');
  });
});
