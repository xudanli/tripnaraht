import { compileDraftDaysToExecutionActions } from './compile-itinerary-to-actions.engine';
import type { DraftDay } from '../../dto/trip-draft.dto';

describe('compileDraftDaysToExecutionActions', () => {
  it('compiles restaurant slots and navigation legs', () => {
    const days = [
      {
        day: 1,
        date: '2026-06-01',
        slots: {
          morning: {
            placeId: 1,
            slot: 'morning' as const,
            startTime: '2026-06-01T09:00:00.000Z',
            endTime: '2026-06-01T11:00:00.000Z',
            reason: 'visit',
          },
          lunch: {
            placeId: 2,
            slot: 'lunch' as const,
            startTime: '2026-06-01T12:00:00.000Z',
            endTime: '2026-06-01T13:30:00.000Z',
            reason: 'meal',
          },
        },
      },
    ] as unknown as DraftDay[];

    const actions = compileDraftDaysToExecutionActions(days, { tripId: 't1', includeNavigateLegs: true });
    expect(actions.some((a) => a.type === 'BOOK_POI')).toBe(true);
    expect(actions.some((a) => a.type === 'RESERVE_RESTAURANT')).toBe(true);
    expect(actions.some((a) => a.type === 'NAVIGATE')).toBe(true);
  });

  it('threads cityKey into action meta when provided', () => {
    const days = [
      {
        day: 1,
        date: '2026-06-01',
        slots: {
          morning: {
            placeId: 1,
            slot: 'morning' as const,
            reason: 'visit',
          },
        },
      },
    ] as unknown as DraftDay[];

    const actions = compileDraftDaysToExecutionActions(days, {
      tripId: 't1',
      cityKey: 'JP',
      includeNavigateLegs: false,
    });
    expect(actions.every((a) => a.meta?.cityKey === 'JP')).toBe(true);
  });
});
