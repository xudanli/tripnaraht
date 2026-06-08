import {
  extractNeighborAnchors,
  pickFirstAnchoredPoint,
  pickLastAnchoredPoint,
  ICELAND_KEF_AIRPORT,
} from './itinerary-adjust-neighbor-anchors.util';

describe('itinerary-adjust-neighbor-anchors', () => {
  const days = [
    {
      dateIso: '2026-06-01',
      dayNumber: 1,
      items: [
        {
          type: 'POI',
          lat: 64.0784,
          lng: -16.2306,
          name: '冰河湖',
        },
        {
          type: 'POI',
          lat: 63.4195,
          lng: -19.008,
          name: '维克',
        },
      ],
    },
    {
      dateIso: '2026-06-02',
      dayNumber: 2,
      items: [
        { type: 'POI', lat: 64.31, lng: -20.3011, name: '盖歇尔间歇泉' },
        { type: 'POI', lat: 64.3253, lng: -20.1237, name: '黄金瀑布' },
      ],
    },
    {
      dateIso: '2026-06-03',
      dayNumber: 3,
      items: [{ type: 'POI', lat: 64.8395, lng: -23.2703, name: '格伦达菲厄泽镇' }],
    },
  ];

  it('uses D1 last POI as start and D3 first POI as end for D2 adjust', () => {
    const ctx = extractNeighborAnchors(days, '2026-06-02');
    expect(ctx).not.toBeNull();
    expect(ctx!.startAnchorSource).toBe('prev_day_last');
    expect(ctx!.endAnchorSource).toBe('next_day_first');
    expect(ctx!.startAnchor.lat).toBeCloseTo(63.4195, 2);
    expect(ctx!.endAnchor.lat).toBeCloseTo(64.8395, 2);
  });

  it('falls back to KEF for first day adjust', () => {
    const ctx = extractNeighborAnchors(days, '2026-06-01');
    expect(ctx!.startAnchorSource).toBe('kef_default');
    expect(ctx!.startAnchor).toEqual(ICELAND_KEF_AIRPORT);
    expect(ctx!.endAnchor.lat).toBeCloseTo(64.31, 1);
  });

  it('pickLastAnchoredPoint prefers last timed POI', () => {
    const pt = pickLastAnchoredPoint([
      { type: 'POI', lat: 1, lng: 1, order: 1 },
      { type: 'HOTEL', lat: 63.5, lng: -19.0, order: 2 },
    ]);
    expect(pt).toEqual({ lat: 63.5, lng: -19 });
  });

  it('pickFirstAnchoredPoint uses earliest item', () => {
    const pt = pickFirstAnchoredPoint([
      { type: 'REST', lat: 1, lng: 1 },
      { type: 'POI', lat: 64.8, lng: -23.2, order: 0 },
    ]);
    expect(pt).toEqual({ lat: 64.8, lng: -23.2 });
  });
});
