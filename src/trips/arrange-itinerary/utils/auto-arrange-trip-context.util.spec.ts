import {
  assignAutoArrangeCandidatesToDays,
  buildAllowedPlaceIdSet,
  filterAutoArrangeCandidates,
  isHighlandOrFroadCandidate,
  parseAutoArrangeTripContext,
  wizardRegionIdsFromRouteScope,
} from './auto-arrange-trip-context.util';

describe('auto-arrange-trip-context.util', () => {
  it('maps SOUTH_COAST_FOCUS to south_coast + golden_circle + reykjanes', () => {
    expect(wizardRegionIdsFromRouteScope('SOUTH_COAST_FOCUS')).toEqual([
      'south_coast',
      'golden_circle',
      'reykjanes',
    ]);
  });

  it('parses trip metadata constraints for excludeFRoad', () => {
    const ctx = parseAutoArrangeTripContext({
      routeScope: 'SOUTH_COAST_FOCUS',
      constraints: { excludeFRoad: true, fRoadAllowed: false, vehicle_type: '4WD' },
      dayThemes: { '4': '冰川徒步' },
      icelandSelfDrive: { wizard: { regionIds: ['south_coast'] } },
    });
    expect(ctx.routeScope).toBe('SOUTH_COAST_FOCUS');
    expect(ctx.excludeFRoad).toBe(true);
    expect(ctx.wizardRegionIds).toEqual(['south_coast']);
    expect(ctx.dayThemes?.['4']).toBe('冰川徒步');
  });

  it('filters out highlands / north / F-road candidates for south-coast trip', () => {
    const allowed = buildAllowedPlaceIdSet(['south_coast', 'golden_circle', 'reykjanes']);
    expect(allowed?.has(381093)).toBe(true); // Svartifoss
    expect(allowed?.has(381107)).toBe(false); // Myvatn is north

    const { kept, dropped } = filterAutoArrangeCandidates({
      candidates: [
        {
          id: '1',
          placeId: 381300,
          priority: 'must_go',
          sortOrder: 0,
          nameCN: '冰岛巫术与魔法博物馆',
        },
        {
          id: '2',
          placeId: 381040,
          priority: 'must_go',
          sortOrder: 1,
          nameCN: '教会山',
        },
        {
          id: '3',
          placeId: 381093,
          priority: 'very_interested',
          sortOrder: 2,
          nameCN: '斯瓦蒂瀑布',
        },
        {
          id: '4',
          placeId: 381126,
          priority: 'very_interested',
          sortOrder: 3,
          nameCN: '阿斯基亚火山环线',
          nameEN: 'Askja',
        },
        {
          id: '5',
          placeId: 381107,
          priority: 'very_interested',
          sortOrder: 4,
          nameCN: '米湖',
        },
        {
          id: '6',
          placeId: 381122,
          priority: 'very_interested',
          sortOrder: 5,
          nameCN: '维提火山口湖',
        },
      ],
      ctx: {
        routeScope: 'SOUTH_COAST_FOCUS',
        excludeFRoad: true,
        excludeHighlands: true,
      },
    });

    expect(kept.map((k) => k.placeId)).toEqual([381093]);
    expect(dropped.some((d) => d.reason === 'froad_or_highlands_blocked')).toBe(true);
    expect(dropped.some((d) => d.reason === 'outside_route_scope')).toBe(true);
  });

  it('detects Askja by name as highland/F-road', () => {
    expect(
      isHighlandOrFroadCandidate({
        placeId: 381126,
        nameCN: '阿斯基亚火山环线',
        nameEN: 'Askja loop',
      }),
    ).toBe(true);
  });

  it('assigns compatible candidates near day centroid / theme', () => {
    const assignments = assignAutoArrangeCandidatesToDays({
      candidates: [
        {
          id: 'sv',
          placeId: 381093,
          priority: 'very_interested',
          sortOrder: 0,
          nameCN: '斯瓦蒂瀑布',
        },
      ],
      days: [
        {
          dayNumber: 1,
          date: new Date('2026-08-15T00:00:00Z'),
          centroid: { lat: 64.14, lng: -21.94 }, // Reykjavik
          theme: '抵达雷克雅未克',
          occupiedUntilHour: 9,
        },
        {
          dayNumber: 4,
          date: new Date('2026-08-18T00:00:00Z'),
          centroid: { lat: 64.02, lng: -16.97 }, // near Jokulsarlon / SE
          theme: '冰川徒步',
          occupiedUntilHour: 9,
        },
      ],
      preferDayNumber: 4,
      eveningCapHour: 17,
      morningStartHour: () => 9,
      coordsByPlaceId: new Map([[381093, { lat: 64.0, lng: -17.0 }]]),
      dwellMinutesByPlaceId: new Map([[381093, 120]]),
    });

    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.dayNumber).toBe(4);
    expect(assignments[0]!.startTime).toBe('09:00');
  });
});
