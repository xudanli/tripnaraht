import {
  buildPrepFromHikingDetail,
  computePermitsComplete,
  ensureUniquePermitIds,
  normalizeChecklistGroups,
  normalizePrepState,
  recomputePrepFlags,
} from './hike-plan-prep-builder.util';
import type { HikingTrailDetail } from '../../route-directions/types/hiking-trail-detail.types';

const minimalDetail = (): HikingTrailDetail => ({
  summary: {
    totalDistanceKm: 55,
    totalAscentM: 900,
    suggestedDays: 4,
    maxElevationM: 1100,
    difficulty: 'high',
  },
  geometry: { polyline: [] },
  daySkeleton: [],
  elevationProfile: [],
  terrainSummary: {
    cumulativeAscentM: 900,
    maxSlopePct: 20,
    totalDistanceKm: 55,
    effortScore: 70,
    difficulty: 'high',
    dataSource: 'cached_fixture',
  },
  supplyPois: [],
  riskMatrix: {
    weatherSensitivity: 'high',
    exposureLevel: 'high',
    riverCrossing: true,
    altitudeSickness: false,
    roadClosureRisk: false,
    signalBlackout: true,
  },
  hardGates: [],
  emergency: {},
  checklistTemplates: [
    {
      id: 'gear-core',
      category: 'gear',
      titleZh: '核心装备',
      items: [
        { id: 'boots', labelZh: '防水徒步靴', required: true },
      ],
    },
  ],
  permits: [
    {
      id: 'fi-hut',
      nameCN: 'FÍ 山屋预订',
      titleZh: 'FÍ 山屋预订',
      required: true,
      bookingUrl: 'https://www.fi.is',
    },
  ],
  access: {
    driving: { parkingNameZh: 'Landmannalaugar 停车场', driveDurationMin: 180 },
    transit: { scheduleZh: '夏季巴士' },
  },
  timeWindows: { lastReturnBusTime: '17:30', suggestedDepartTime: '07:00' },
});

describe('hike-plan-prep-builder', () => {
  it('builds grouped checklist and permits from hikingDetail', () => {
    const prep = buildPrepFromHikingDetail(minimalDetail());
    expect(prep.checklist[0].category).toBe('gear');
    expect(prep.checklist[0].items[0].nameCN).toBe('防水徒步靴');
    expect(prep.permits[0].name).toBe('FÍ 山屋预订');
    expect(prep.permits[0].nameCN).toBe('FÍ 山屋预订');
    expect(prep.permits[0].required).toBe(true);
    expect(prep.permits[0].obtained).toBe(false);
    expect(prep.permits[0].bookingUrl).toContain('fi.is');
    expect(prep.permitsComplete).toBe(false);
    expect(prep.transport?.type).toBe('mixed');
    expect(prep.transport?.fromTrailhead?.lastDeparture).toBe('17:30');
  });

  it('permitsComplete is true only when all required permits are obtained', () => {
    const prep = buildPrepFromHikingDetail(minimalDetail());
    expect(computePermitsComplete(prep.permits)).toBe(false);

    const done = recomputePrepFlags({
      ...prep,
      permits: prep.permits.map((p) => ({ ...p, obtained: true })),
    });
    expect(done.permitsComplete).toBe(true);

    const optionalOnly = recomputePrepFlags({
      ...prep,
      permits: [{ ...prep.permits[0], required: false, obtained: false }],
    });
    expect(optionalOnly.permitsComplete).toBe(true);
  });

  it('dedupes duplicate permit ids', () => {
    const deduped = ensureUniquePermitIds([
      {
        id: 'fi-hut',
        name: 'A',
        nameCN: 'A',
        required: true,
        obtained: false,
      },
      {
        id: 'fi-hut',
        name: 'B',
        nameCN: 'B',
        required: true,
        obtained: false,
      },
    ]);
    expect(deduped.map((p) => p.id)).toEqual(['fi-hut', 'fi-hut-2']);
  });

  it('normalizePrepState tolerates undefined checklist items (PATCH dirty data)', () => {
    const normalized = normalizePrepState({
      checklist: [
        {
          id: 'gear',
          category: 'gear',
          items: [
            {
              id: 'boots',
              nameCN: '防水徒步靴',
              required: true,
              checked: true,
            },
            undefined,
            null,
          ],
        },
      ],
      permits: [
        {
          id: 'fi-hut',
          nameCN: 'FÍ 山屋预订',
          required: true,
          obtained: false,
        },
      ],
      offlineReady: false,
    });
    expect(normalized.checklist[0].items).toHaveLength(1);
    expect(normalized.checklistComplete).toBe(true);
    expect(normalized.permits[0].nameCN).toBe('FÍ 山屋预订');
    expect(normalized.permitsComplete).toBe(false);
  });

  it('normalizeChecklistGroups drops holes in items array', () => {
    const groups = normalizeChecklistGroups([
      { id: 'g1', items: [undefined, { id: 'a', nameCN: '地图', required: false }] },
    ]);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].nameCN).toBe('地图');
  });

  it('migrates legacy flat checklist on read', () => {
    const normalized = normalizePrepState({
      checklist: [{ id: 'a', labelZh: '地图', checked: false, required: true }],
      permits: [{ id: 'p1', titleZh: '许可', status: 'pending' }],
      checklistComplete: false,
      permitsComplete: false,
      offlineReady: false,
    });
    expect(normalized.checklist[0].items).toHaveLength(1);
    expect(normalized.permits[0].name).toBe('许可');
  });
});
