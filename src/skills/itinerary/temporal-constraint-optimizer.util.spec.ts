import {
  formatMinutesAsHm,
  isInSleepLock,
  optimizeTemporalConstraints,
  parseItemWindowMinutes,
} from './temporal-constraint-optimizer.util';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';

function baseItinerary(overrides?: Partial<Itinerary>): Itinerary {
  return {
    request_id: 'req_test',
    days: [
      {
        date: '2026-07-01',
        items: [
          {
            id: 'poi_1',
            type: 'POI',
            start_window: '01:00',
            end_window: '03:00',
            location_ref: { name: '博物馆' },
            evidence_refs: [],
            verified: false,
          },
          {
            id: 'poi_2',
            type: 'POI',
            start_window: '02:30',
            end_window: '04:30',
            location_ref: { name: '公园' },
            evidence_refs: [],
            verified: false,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('temporal-constraint-optimizer.util', () => {
  it('detects sleep lock window', () => {
    expect(isInSleepLock(60)).toBe(true); // 01:00
    expect(isInSleepLock(10 * 60)).toBe(false); // 10:00
    expect(isInSleepLock(23 * 60 + 30)).toBe(true); // 23:30
  });

  it('parses HH:mm windows as minutes from midnight', () => {
    const { startMin, endMin } = parseItemWindowMinutes('2026-07-01', {
      start_window: '09:00',
      end_window: '11:00',
    });
    expect(startMin).toBe(9 * 60);
    expect(endMin).toBe(11 * 60);
  });

  it('normalizes ISO UTC windows to local minutes (fixes 01:00 display root cause)', () => {
    // 17:00 UTC on a UTC+8 display would show as 01:00 next day — optimizer should reschedule
    const { startMin } = parseItemWindowMinutes(
      '2026-07-01',
      { start_window: '2026-07-01T17:00:00.000Z', end_window: '2026-07-01T19:00:00.000Z' },
      'Asia/Shanghai',
    );
    expect(startMin).toBe(1 * 60); // 01:00 local — violation
  });

  it('reschedules sleep-lock violations to daytime slots', () => {
    const result = optimizeTemporalConstraints({
      itinerary: baseItinerary(),
      environment_context: { timezone: 'Asia/Shanghai' },
    });

    const items = result.itinerary.days[0]!.items;
    const museum = items.find((i) => i.id === 'poi_1');
    const park = items.find((i) => i.id === 'poi_2');

    expect(museum?.start_window).not.toBe('01:00');
    expect(park?.start_window).not.toBe('02:30');
    expect(parseItemWindowMinutes('2026-07-01', museum!, 'Asia/Shanghai').startMin).toBeGreaterThanOrEqual(8 * 60);
    expect(result.changelog.some((c) => c.action === 'RESCHEDULED')).toBe(true);
    expect(result.issues.some((i) => i.type === 'SLEEP_LOCK_VIOLATION')).toBe(true);
  });

  it('inserts meal anchors when missing', () => {
    const result = optimizeTemporalConstraints({
      itinerary: baseItinerary(),
      environment_context: { timezone: 'UTC' },
    });
    const mealItems = result.itinerary.days[0]!.items.filter((i) => i.type === 'MEAL');
    expect(mealItems.length).toBeGreaterThanOrEqual(2);
    expect(result.changelog.some((c) => c.action === 'INSERTED_MEAL')).toBe(true);
  });

  it('preserves night override tagged activities', () => {
    const it = baseItinerary();
    it.days[0]!.items[0] = {
      ...it.days[0]!.items[0]!,
      notes: '[极光/星空] 观测',
      start_window: '23:30',
      end_window: '01:00',
    };
    const result = optimizeTemporalConstraints({ itinerary: it });
    const aurora = result.itinerary.days[0]!.items.find((i) => i.notes?.includes('极光'));
    expect(aurora?.start_window).toBe('23:30');
  });

  it('inserts afternoon rest for low stamina party', () => {
    const result = optimizeTemporalConstraints({
      itinerary: baseItinerary(),
      party_profile: { has_elderly: true },
      environment_context: { timezone: 'UTC' },
    });
    expect(result.itinerary.days[0]!.items.some((i) => i.location_ref.name?.includes('休息'))).toBe(true);
    expect(result.changelog.some((c) => c.action === 'INSERTED_REST')).toBe(true);
  });

  it('formats minutes as HH:mm', () => {
    expect(formatMinutesAsHm(8 * 60 + 30)).toBe('08:30');
    expect(formatMinutesAsHm(23 * 60 + 15)).toBe('23:15');
  });
});
