import {
  parseItineraryNoteConstraints,
  projectShiftTimeMaterialization,
  resolveShiftDeltaMinutes,
  resolveShiftPropagationMode,
  type ItineraryItemShiftProjection,
} from './shift-time-materialization.util';

const DAY_MS = 24 * 60 * 60 * 1000;

function item(
  id: string,
  order: number,
  startHour: number,
  durationMin: number,
  opts: Partial<ItineraryItemShiftProjection> = {},
): ItineraryItemShiftProjection {
  const dayStartMs = 0;
  const start = startHour * 60 * 60 * 1000;
  return {
    id,
    tripDayId: 'day-1',
    order,
    startTimeMs: start,
    endTimeMs: start + durationMin * 60_000,
    isFixedAnchor: false,
    dayStartMs,
    dayEndMs: dayStartMs + DAY_MS,
    ...opts,
  };
}

describe('shift-time-materialization.util (MAT)', () => {
  it('MAT-001: delay 30min cascades until fixed anchor', () => {
    const items = [
      item('glacier', 1, 9, 120),
      item('drive', 2, 11, 60),
      item('dinner', 3, 18, 90),
      item('hotel-checkin', 4, 21, 30, { isFixedAnchor: true }),
    ];

    const result = projectShiftTimeMaterialization({
      items,
      targetItemId: 'glacier',
      deltaMinutes: 30,
      propagation: 'UNTIL_FIXED_ANCHOR',
    });

    expect(result.blocked).toBe(false);
    expect(result.updates.map((u) => u.itemId)).toEqual(['glacier', 'drive', 'dinner']);
    expect(result.updates[0]?.startTimeMs).toBe(9 * 60 * 60 * 1000 + 30 * 60_000);
    expect(result.conflicts.some((c) => c.itemId === 'hotel-checkin')).toBe(true);
  });

  it('MAT-002: advance REST_OF_DAY shifts all non-anchor items', () => {
    const items = [
      item('breakfast', 1, 8, 60),
      item('activity', 2, 10, 120),
      item('ferry', 3, 14, 60, { isFixedAnchor: true }),
    ];

    const result = projectShiftTimeMaterialization({
      items,
      targetItemId: 'breakfast',
      deltaMinutes: -45,
      propagation: 'REST_OF_DAY',
    });

    expect(result.updates.map((u) => u.itemId)).toEqual(['breakfast', 'activity']);
    expect(result.updates[0]?.startTimeMs).toBe(8 * 60 * 60 * 1000 - 45 * 60_000);
  });

  it('MAT-003: compress activity end time via COMPRESS_END shift kind', () => {
    const delta = resolveShiftDeltaMinutes({
      before: { durationMinutes: 120 },
      after: { durationMinutes: 60 },
    });
    expect(delta).toBe(-60);

    const items = [item('hike', 1, 10, 120, { minDurationMinutes: 45 })];
    const result = projectShiftTimeMaterialization({
      items,
      targetItemId: 'hike',
      deltaMinutes: -60,
      propagation: 'TARGET_ONLY',
      shiftKind: 'COMPRESS_END',
    });
    expect(result.blocked).toBe(false);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]?.endTimeMs).toBe(10 * 60 * 60 * 1000 + 60 * 60_000);
    expect(result.updates[0]?.startTimeMs).toBe(10 * 60 * 60 * 1000);
  });

  it('MAT-009: blocks shift when booking latest arrival would be missed', () => {
    const latest = 13 * 60 * 60 * 1000 + 45 * 60_000;
    const items = [
      item('drive', 1, 12, 60),
      item('whale-tour', 2, 14, 120, { bookingLatestArrivalMs: latest }),
    ];

    const result = projectShiftTimeMaterialization({
      items,
      targetItemId: 'drive',
      deltaMinutes: 90,
      propagation: 'UNTIL_FIXED_ANCHOR',
    });

    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe('BOOKING_WINDOW_CONFLICT');
  });

  it('MAT-010: blocks shift when activity ends after venue closing', () => {
    const dayStart = 0;
    const items = [
      item('museum', 1, 15, 120, {
        openingHoursStartMs: dayStart + 9 * 60 * 60 * 1000,
        openingHoursEndMs: dayStart + 17 * 60 * 60 * 1000,
      }),
    ];

    const result = projectShiftTimeMaterialization({
      items,
      targetItemId: 'museum',
      deltaMinutes: 60,
      propagation: 'TARGET_ONLY',
    });

    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe('OPENING_HOURS_VIOLATION');
  });

  it('MAT-004: propagation stops at fixed anchor and records conflict', () => {
    const items = [
      item('activity', 1, 10, 90),
      item('booking', 2, 12, 60, { isFixedAnchor: true }),
      item('drive', 3, 14, 45),
    ];

    const result = projectShiftTimeMaterialization({
      items,
      targetItemId: 'activity',
      deltaMinutes: 30,
      propagation: 'UNTIL_FIXED_ANCHOR',
    });

    expect(result.updates.map((u) => u.itemId)).toEqual(['activity']);
    expect(result.conflicts[0]?.reason).toBe('FIXED_ANCHOR_CONFLICT');
  });

  it('MAT-005: cross-day shift is blocked', () => {
    const items = [item('late', 1, 23, 90)];
    const result = projectShiftTimeMaterialization({
      items,
      targetItemId: 'late',
      deltaMinutes: 60,
      propagation: 'TARGET_ONLY',
    });

    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe('CROSS_DAY');
  });

  it('MAT-007: idempotent zero delta produces no updates', () => {
    const result = projectShiftTimeMaterialization({
      items: [item('a', 1, 9, 60)],
      targetItemId: 'a',
      deltaMinutes: 0,
      propagation: 'TARGET_ONLY',
    });
    expect(result.updates).toHaveLength(0);
    expect(result.blocked).toBe(false);
  });

  it('MAT-011: transport segment duration recalculates after cascade', () => {
    const items = [
      item('glacier', 1, 9, 120),
      item('drive', 2, 11, 30),
      item('whale', 3, 12, 120),
    ];

    const result = projectShiftTimeMaterialization({
      items,
      targetItemId: 'glacier',
      deltaMinutes: 30,
      propagation: 'UNTIL_FIXED_ANCHOR',
    });

    const drive = result.updates.find((u) => u.itemId === 'drive');
    const whale = result.updates.find((u) => u.itemId === 'whale');
    expect(drive?.travelFromPreviousDurationMinutes).toBe(0);
    expect(whale?.travelFromPreviousDurationMinutes).toBe(30);
  });

  it('parses opening hours and booking latest from itinerary note tags', () => {
    const parsed = parseItineraryNoteConstraints(
      'Whale tour [opening:09:00-17:00] [latest-arrival:13:45]',
      0,
    );
    expect(parsed.openingHoursStartMs).toBe(9 * 60 * 60 * 1000);
    expect(parsed.openingHoursEndMs).toBe(17 * 60 * 60 * 1000);
    expect(parsed.bookingLatestArrivalMs).toBe(13 * 60 * 60 * 1000 + 45 * 60_000);
  });

  it('defaults propagation to UNTIL_FIXED_ANCHOR', () => {
    expect(resolveShiftPropagationMode({})).toBe('UNTIL_FIXED_ANCHOR');
    expect(resolveShiftPropagationMode({ restOfDay: true })).toBe('REST_OF_DAY');
  });
});
