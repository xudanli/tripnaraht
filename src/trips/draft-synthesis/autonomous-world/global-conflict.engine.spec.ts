import { detectInterTripConflicts } from './global-conflict.engine';

describe('detectInterTripConflicts', () => {
  it('detects POI overload across trips', () => {
    const refs = [
      { tripId: 't1', dayKey: '2026-06-01', slot: 'lunch', placeId: 99 },
      { tripId: 't2', dayKey: '2026-06-01', slot: 'lunch', placeId: 99 },
    ];
    const c = detectInterTripConflicts(refs);
    expect(c.some((x) => x.type === 'POI_OVERLOAD')).toBe(true);
  });

  it('detects city hotspot when cityKey set', () => {
    const refs = [
      { tripId: 'a', dayKey: '2026-06-01', slot: 'afternoon', placeId: 1, cityKey: 'TYO' },
      { tripId: 'b', dayKey: '2026-06-01', slot: 'afternoon', placeId: 2, cityKey: 'TYO' },
    ];
    const c = detectInterTripConflicts(refs);
    expect(c.some((x) => x.type === 'AREA_HOTSPOT')).toBe(true);
  });
});
