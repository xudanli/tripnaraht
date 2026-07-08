import { DateTime } from 'luxon';
import { TripStatus } from '../dto/trip-status.dto';
import {
  pickNextItineraryItemForStop,
  resolveCurrentItemId,
  resolveTripStateDayContext,
} from './trip-state.util';

const day1 = {
  id: 'day-1',
  date: new Date('2026-07-16T00:00:00.000Z'),
  ItineraryItem: [
    {
      id: 'item-a',
      placeId: 1,
      startTime: new Date('2026-07-16T09:00:00.000Z'),
      endTime: new Date('2026-07-16T11:00:00.000Z'),
    },
    {
      id: 'item-b',
      placeId: 2,
      startTime: new Date('2026-07-16T12:00:00.000Z'),
      endTime: new Date('2026-07-16T14:00:00.000Z'),
    },
  ],
};

describe('trip-state.util', () => {
  it('falls back to in-trip day when calendar day mismatches TRAVELING trip', () => {
    const now = DateTime.fromISO('2026-07-06T10:00:00.000Z');
    const ctx = resolveTripStateDayContext({
      tripDays: [day1],
      startDate: new Date('2026-07-16T00:00:00.000Z'),
      endDate: new Date('2026-07-22T00:00:00.000Z'),
      now,
      tripStatus: TripStatus.TRAVELING,
    });
    expect(ctx.day?.id).toBe('day-1');
    expect(ctx.effectiveNow.toUTC().toISO()).toBe('2026-07-16T09:00:00.000Z');
  });

  it('resolves current and next stop on effective day', () => {
    const now = DateTime.fromISO('2026-07-16T10:00:00.000Z');
    const current = resolveCurrentItemId(day1.ItineraryItem, now);
    expect(current).toBe('item-a');
    const next = pickNextItineraryItemForStop(day1.ItineraryItem, now, current);
    expect(next?.id).toBe('item-b');
  });
});
