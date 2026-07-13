import { DateTime } from 'luxon';
import {
  resolveTripListDisplayStatus,
  resolveDisplayStatusLabel,
  toApiTripStatus,
  expandStatusFilter,
  computeLitePlanningProgressPercent,
} from './trip-list-bff.projection.util';

describe('trip-list-bff.projection.util', () => {
  const now = DateTime.fromISO('2026-07-07T12:00:00.000+08:00');

  it('maps IN_PROGRESS/TRAVELING to API status IN_PROGRESS', () => {
    expect(toApiTripStatus('IN_PROGRESS')).toBe('IN_PROGRESS');
    expect(toApiTripStatus('TRAVELING')).toBe('IN_PROGRESS');
  });

  it('resolves pre_trip within 14 days', () => {
    const displayStatus = resolveTripListDisplayStatus({
      status: 'PLANNING',
      startDate: new Date('2026-07-15T00:00:00.000Z'),
      now,
    });
    expect(displayStatus).toBe('pre_trip');
    expect(resolveDisplayStatusLabel(displayStatus)).toBe('行前准备');
  });

  it('expands IN_PROGRESS filter to TRAVELING', () => {
    expect(expandStatusFilter(['IN_PROGRESS'])).toEqual(
      expect.arrayContaining(['IN_PROGRESS', 'TRAVELING']),
    );
  });

  it('prefers metadata progressPercent for planning progress', () => {
    const progress = computeLitePlanningProgressPercent({
      metadata: { progressPercent: 45 },
      destination: 'IS',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-05'),
      totalItems: 3,
      daysWithItems: 2,
      totalDays: 4,
    });
    expect(progress).toBe(45);
  });
});
