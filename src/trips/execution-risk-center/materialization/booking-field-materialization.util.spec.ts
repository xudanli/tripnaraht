import {
  appendBookingRescheduleConfirmation,
  hasBookedItineraryItem,
  mergeShiftUpdateWithBookingFields,
  projectBookingFieldUpdates,
  updateNoteSlotTag,
} from './booking-field-materialization.util';

describe('booking-field-materialization.util', () => {
  const baseItem = {
    id: 'whale-tour',
    tripDayId: 'day-1',
    order: 2,
    startTimeMs: 14 * 60 * 60 * 1000,
    endTimeMs: 16 * 60 * 60 * 1000,
    isFixedAnchor: false,
    dayStartMs: 0,
    dayEndMs: 24 * 60 * 60 * 1000,
    bookedAtMs: 14 * 60 * 60 * 1000,
    bookingStatus: 'CONFIRMED',
    bookingConfirmation: 'NB-20260717-1400',
    note: 'Whale tour [booking-ref:WH-20260716] [slot:14:00]',
  };

  it('MAT-012: syncs bookedAt when it matched original start time', () => {
    const shiftedStart = 14 * 60 * 60 * 1000 + 30 * 60_000;
    const patch = projectBookingFieldUpdates(baseItem, {
      startTimeMs: shiftedStart,
      endTimeMs: shiftedStart + 2 * 60 * 60 * 1000,
    });

    expect(patch.bookedAtMs).toBe(shiftedStart);
    expect(patch.bookingStatus).toBe('VERIFY_REQUIRED');
    expect(patch.bookingConfirmation).toContain('[ERC rescheduled');
    expect(patch.note).toContain('[slot:14:30]');
  });

  it('detects booked items via booking-ref note tag', () => {
    expect(
      hasBookedItineraryItem({
        ...baseItem,
        bookingStatus: null,
        bookingConfirmation: null,
        bookedAtMs: null,
        note: 'Tour [booking-ref:GT-001]',
      }),
    ).toBe(true);
  });

  it('mergeShiftUpdateWithBookingFields preserves time updates', () => {
    const merged = mergeShiftUpdateWithBookingFields(
      {
        itemId: 'whale-tour',
        startTimeMs: 14 * 60 * 60 * 1000 + 30 * 60_000,
        endTimeMs: 16 * 60 * 60 * 1000 + 30 * 60_000,
      },
      baseItem,
    );
    expect(merged.bookedAtMs).toBe(14 * 60 * 60 * 1000 + 30 * 60_000);
    expect(merged.travelFromPreviousDurationMinutes).toBeUndefined();
  });

  it('appendBookingRescheduleConfirmation is idempotent-friendly', () => {
    const first = appendBookingRescheduleConfirmation('CONF-1', 1_700_000_000_000);
    const second = appendBookingRescheduleConfirmation(first, 1_700_000_100_000);
    expect(second).toContain('CONF-1');
    expect(second.split('[ERC rescheduled').length).toBe(3);
  });

  it('updateNoteSlotTag leaves note unchanged without slot tag', () => {
    expect(updateNoteSlotTag('plain note', 1000)).toBe('plain note');
  });
});
