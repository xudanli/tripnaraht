import {
  classifyBlueprintStop,
  dayDrivingKm,
  projectRouteBlueprint,
  projectRouteBlueprintOverviewSummary,
  resolveDayConfirmationStatus,
  type RouteBlueprintDayFact,
} from './route-blueprint.projection.util';

function day(
  dayNumber: number,
  opts: Partial<RouteBlueprintDayFact> & {
    attractions?: Array<{ title: string; lat: number; lng: number }>;
    hotelCity?: string;
  },
): RouteBlueprintDayFact {
  const stops = (opts.attractions ?? []).map((a, i) => ({
    itemId: `item-${dayNumber}-${i}`,
    title: a.title,
    type: 'ACTIVITY',
    category: 'ATTRACTION',
    bookingStatus: null,
    coords: { lat: a.lat, lng: a.lng },
    cityName: null,
    isCoreAttraction: true,
    isAccommodation: false,
  }));
  if (opts.hotelCity) {
    stops.push({
      itemId: `hotel-${dayNumber}`,
      title: `${opts.hotelCity} 酒店`,
      type: 'REST',
      category: 'HOTEL',
      bookingStatus: 'CONFIRMED',
      coords: null,
      cityName: opts.hotelCity,
      isCoreAttraction: false,
      isAccommodation: true,
    });
  }
  return {
    id: `day-${dayNumber}`,
    dayNumber,
    label: opts.label,
    theme: opts.theme,
    stops: opts.stops ?? stops,
  };
}

describe('route-blueprint.projection.util', () => {
  it('projects days with theme, core attractions, accommodation, pace labels', () => {
    const result = projectRouteBlueprint({
      tripName: '冰岛环岛旅行',
      destinationLabel: '冰岛环岛',
      nightCount: 6,
      contextVersion: 10,
      planVersion: 3,
      days: [
        day(1, {
          label: 'Reykjavik',
          theme: '抵达',
          attractions: [{ title: '哈尔格林姆斯教堂', lat: 64.14, lng: -21.93 }],
          hotelCity: 'Reykjavik',
        }),
        day(2, {
          label: '黄金圈',
          theme: '间歇泉与瀑布',
          attractions: [
            { title: '辛格维利尔', lat: 64.25, lng: -21.12 },
            { title: '盖歇尔', lat: 64.31, lng: -20.3 },
            { title: '居尔福斯', lat: 64.32, lng: -20.12 },
          ],
          hotelCity: 'Selfoss',
        }),
        day(3, {
          label: '南岸',
          theme: '瀑布与黑沙滩',
          attractions: [
            { title: '塞里雅兰瀑布', lat: 63.6156, lng: -19.9885 },
            { title: '黑沙滩', lat: 63.4045, lng: -19.0484 },
          ],
          hotelCity: 'Vik',
        }),
      ],
    });

    expect(result.title).toBe('环岛路线蓝图');
    expect(result.summary).toBe('3天6晚 · 冰岛环岛结构');
    expect(result.days).toHaveLength(3);
    expect(result.days[2]).toMatchObject({
      dayNumber: 3,
      label: '南岸',
      theme: '瀑布与黑沙滩',
      coreAttractions: ['塞里雅兰瀑布', '黑沙滩'],
      accommodationCity: 'Vik',
      confirmationStatus: 'CONFIRMED',
    });
    expect(result.pace?.totalDrivingLabel).toMatch(/km|—/);
    expect(result.pace?.accommodationChangeLabel).toBe('2 次');
    expect(result.pace?.highIntensityDayIndexes).toEqual(expect.any(Array));
    expect(result.contextVersion).toBe(10);
    expect(result.planVersion).toBe(3);
  });

  it('marks empty days PENDING and assigns timeline statuses', () => {
    const result = projectRouteBlueprint({
      tripName: 'Trip',
      destinationLabel: 'IS',
      contextVersion: 1,
      days: [
        day(1, {
          theme: '已排',
          attractions: [{ title: 'A', lat: 64, lng: -21 }],
        }),
        { id: 'day-2', dayNumber: 2, theme: '待填', stops: [] },
        { id: 'day-3', dayNumber: 3, theme: '更远', stops: [] },
      ],
    });

    expect(result.days[0].status).toBe('completed');
    expect(result.days[1].status).toBe('current');
    expect(result.days[1].confirmationStatus).toBe('PENDING');
    expect(result.days[2].status).toBe('upcoming');
  });

  it('overview summary strips detail fields', () => {
    const full = projectRouteBlueprint({
      tripName: '冰岛环岛',
      destinationLabel: '冰岛环岛',
      contextVersion: 2,
      days: [
        day(1, {
          label: '南岸',
          theme: '瀑布',
          attractions: [{ title: '斯科加', lat: 63.53, lng: -19.51 }],
        }),
      ],
    });
    const summary = projectRouteBlueprintOverviewSummary(full);
    expect(summary).toEqual({
      title: full.title,
      summary: full.summary,
      days: [
        {
          id: full.days[0].id,
          dayNumber: 1,
          label: '南岸',
          subtitle: full.days[0].subtitle,
          status: full.days[0].status,
        },
      ],
    });
    expect((summary.days[0] as { theme?: string }).theme).toBeUndefined();
  });

  it('classifies stops and computes driving km', () => {
    expect(
      classifyBlueprintStop({ type: 'ACTIVITY', category: 'ATTRACTION', name: '瀑布' }),
    ).toEqual({ isCoreAttraction: true, isAccommodation: false });
    expect(
      classifyBlueprintStop({ type: 'REST', category: 'HOTEL', name: 'Hotel Vik' }),
    ).toEqual({ isCoreAttraction: false, isAccommodation: true });
    expect(
      classifyBlueprintStop({ type: 'MEAL_ANCHOR', category: 'RESTAURANT', name: '餐厅' }),
    ).toEqual({ isCoreAttraction: false, isAccommodation: false });

    const km = dayDrivingKm([
      {
        itemId: '1',
        title: 'A',
        coords: { lat: 63.6156, lng: -19.9885 },
        isCoreAttraction: true,
        isAccommodation: false,
      },
      {
        itemId: '2',
        title: 'B',
        coords: { lat: 63.4045, lng: -19.0484 },
        isCoreAttraction: true,
        isAccommodation: false,
      },
    ]);
    expect(km).toBeGreaterThan(50);

    expect(
      resolveDayConfirmationStatus(
        day(1, { attractions: [{ title: 'A', lat: 64, lng: -21 }] }),
        300,
      ),
    ).toBe('NEEDS_OPTIMIZATION');
  });
});
