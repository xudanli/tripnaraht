import { addDaysIso, buildHikingDayCardsForTrip } from './hiking-day-schedule.util';

describe('hiking-day-schedule.util', () => {
  const metadata = {
    routeDirectionName: 'IS_LAUGAVEGUR',
    hikingSegments: [
      {
        segmentId: 'seg-1',
        startDate: '2026-07-15',
        endDate: '2026-07-22',
        routeDirectionId: 106,
        hikePlanId: 'plan-1',
        label: '兰格维格 55km · Landmannalaugar → Þórsmörk',
      },
    ],
    hardTrekTrailPlan: {
      routeDirectionName: 'IS_LAUGAVEGUR',
      segments: [
        { day: 1, titleZh: 'Landmannalaugar → Hrafntinnusker', titleEn: 'D1', distanceKm: 12, ascentM: 470 },
        { day: 2, titleZh: 'Hrafntinnusker → Álftavatn', titleEn: 'D2', distanceKm: 12, ascentM: 100 },
        { day: 3, titleZh: 'Álftavatn → Emstrur', titleEn: 'D3', distanceKm: 15, ascentM: 200 },
        { day: 4, titleZh: 'Emstrur → Þórsmörk', titleEn: 'D4', distanceKm: 16, ascentM: 150 },
      ],
    },
  };

  it('maps distinct trail card per trek day and buffer after', () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: addDaysIso('2026-07-15', i),
    }));
    const cards = buildHikingDayCardsForTrip(metadata, days);
    expect(cards[0]?.label).toContain('Landmannalaugar');
    expect(cards[1]?.label).toContain('Hrafntinnusker');
    expect(cards[3]?.label).toContain('Þórsmörk');
    expect(cards[4]?.kind).toBe('buffer');
    expect(cards[0]?.hikePlanId).toBe('plan-1');
    expect(cards[1]?.titleZh).not.toBe(cards[0]?.titleZh);
  });
});
