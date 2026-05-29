import { applyHikingDetailOverride } from './hiking-detail-override-merge.util';
import type { HikingTrailDetail } from '../../route-directions/types/hiking-trail-detail.types';

const base = (): HikingTrailDetail => ({
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
    weatherSensitivity: 'low',
    exposureLevel: 'low',
    riverCrossing: false,
    altitudeSickness: false,
    roadClosureRisk: false,
    signalBlackout: false,
  },
  hardGates: [],
  emergency: {},
  checklistTemplates: [
    {
      id: 'old',
      category: 'gear',
      titleZh: '旧清单',
      items: [{ id: 'old-item', labelZh: '旧项', required: true }],
    },
  ],
  permits: [{ id: 'old-permit', titleZh: '旧许可', required: true }],
});

describe('applyHikingDetailOverride prep fields', () => {
  it('replaces checklistTemplates and permits from override', () => {
    const merged = applyHikingDetailOverride(base(), {
      checklistTemplates: [
        {
          id: 'essential',
          category: 'essential',
          titleZh: '必备',
          items: [
            {
              id: 'map',
              nameCN: '地图和指南针',
              required: true,
            },
          ],
        },
      ],
      permits: [
        {
          id: 'p1',
          name: 'Laugavegur 许可',
          required: true,
          bookingUrl: 'https://example.com',
        },
      ],
    });

    expect(merged.checklistTemplates?.[0].items[0].labelZh).toBe('地图和指南针');
    expect(merged.permits?.[0].nameCN).toBe('Laugavegur 许可');
    expect(merged.permits?.[0].titleZh).toBe('Laugavegur 许可');
    expect(merged.permits?.[0].bookingUrl).toBe('https://example.com');
  });
});
