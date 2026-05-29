import { HikingTrailDetailService } from './hiking-trail-detail.service';
import { DEMEffortMetadataService } from '../../trips/dem/services/dem-effort-metadata.service';

describe('HikingTrailDetailService', () => {
  const dem = {
    calculateEffortMetadata: jest.fn().mockRejectedValue(new Error('no dem')),
  } as unknown as DEMEffortMetadataService;

  const service = new HikingTrailDetailService(dem);

  it('builds full hikingDetail for IS_LAUGAVEGUR', async () => {
    const detail = await service.build({
      id: 42,
      name: 'IS_LAUGAVEGUR',
      nameCN: '朗格迈维卢尔步道',
      tags: ['徒步'],
      countryCode: 'IS',
    });
    expect(detail).not.toBeNull();
    expect(detail!.summary.totalDistanceKm).toBeGreaterThan(0);
    expect(detail!.geometry.polyline.length).toBeGreaterThan(1);
    expect(detail!.daySkeleton).toHaveLength(4);
    expect(detail!.summary.suggestedDays).toBe(4);
    expect(detail!.fitnessMatch?.suggestedDays).toBe(4);
    expect(detail!.fitnessMatch?.dayPaceVerdict).toHaveLength(4);
    for (const row of detail!.fitnessMatch!.dayPaceVerdict) {
      expect(row.verdict).toMatch(/^pace_/);
      expect(row.noteZh.length).toBeGreaterThan(0);
    }
    expect(detail!.terrainSummary.dataSource).toBe('cached_fixture');
    expect(detail!.riskMatrix.riverCrossing).toBe(true);
    expect(detail!.riskMatrixRows!.length).toBeGreaterThanOrEqual(5);
    expect(detail!.hardGates.length).toBeGreaterThanOrEqual(3);
    expect(detail!.emergency.rescuePhone).toBe('112');
    expect(detail!.permits!.length).toBe(3);
    for (const p of detail!.permits!) {
      expect(p.nameCN).toBeTruthy();
      expect(p.id).toBeTruthy();
    }
    expect(detail!.access?.transit?.scheduleZh).toContain('巴士');
  });

  it('merges metadata hikingDetailOverride riskMatrix into riskMatrixRows', async () => {
    const detail = await service.build({
      name: 'IS_LAUGAVEGUR',
      tags: ['徒步'],
      metadata: {
        hikingDetailOverride: {
          riskMatrix: [
            {
              id: 'custom',
              labelCN: '运营备注',
              value: '测试',
              level: 'low',
            },
          ],
        },
      },
    });
    expect(detail!.riskMatrixRows).toHaveLength(1);
    expect(detail!.riskMatrixRows![0].labelCN).toBe('运营备注');
  });

  it('expands daySkeleton and fitnessMatch when metadata.estimatedDuration is 7', async () => {
    const detail = await service.build(
      {
        id: 99,
        name: 'IS_LAUGAVEGUR',
        nameCN: '朗格迈维卢尔步道',
        tags: ['徒步'],
        metadata: { estimatedDuration: 7 },
      },
      { longestHike: 2 },
    );
    expect(detail!.summary.suggestedDays).toBe(7);
    expect(detail!.daySkeleton).toHaveLength(7);
    expect(detail!.fitnessMatch?.suggestedDays).toBe(7);
    expect(detail!.fitnessMatch?.dayPaceVerdict).toHaveLength(7);
    expect(detail!.fitnessMatch?.longestHike).toBe(2);
    expect(detail!.fitnessMatch?.dayPaceVerdict[6].noteZh).toContain('7');
  });

  it('shouldIncludeDetailForRoute defaults true for hiking tags', () => {
    expect(
      service.shouldIncludeDetailForRoute({ name: 'IS_LAUGAVEGUR', tags: ['徒步'] }),
    ).toBe(true);
    expect(
      service.shouldIncludeDetailForRoute({ name: 'IS_GOLDEN_CIRCLE', tags: ['自驾'] }),
    ).toBe(false);
    expect(
      service.shouldIncludeDetailForRoute(
        { name: 'IS_LAUGAVEGUR', tags: [] },
        true,
      ),
    ).toBe(true);
  });

  it('generic hiking route includes permits with nameCN', async () => {
    const detail = await service.build({
      id: 42,
      name: 'IS_TREKKING_WILDERNESS',
      nameCN: '荒野徒步',
      tags: ['徒步'],
      countryCode: 'IS',
      metadata: { estimatedDuration: 7, laugavegurCorridor: true },
    });
    expect(detail!.permits!.length).toBeGreaterThanOrEqual(2);
    expect(detail!.permits![0].nameCN).toBe('FÍ 山屋预订');
    expect(detail!.permits![0].id).toBe('fi-hut');
  });

  it('IS_TREKKING_WILDERNESS uses real per-day segments not equal split', async () => {
    const detail = await service.build({
      id: 42,
      name: 'IS_TREKKING_WILDERNESS',
      nameCN: '荒野徒步探险',
      tags: ['徒步'],
      countryCode: 'IS',
      metadata: { estimatedDuration: 7 },
      constraints: { soft: { maxDailyAscentM: 500 } },
    });
    expect(detail!.daySkeleton).toHaveLength(7);
    expect(detail!.daySkeleton[0].distanceKm).toBe(12);
    expect(detail!.daySkeleton[0].ascentM).toBe(470);
    expect(detail!.daySkeleton[0].theme).toContain('Landmannalaugar');
    expect(detail!.daySkeleton[1].ascentM).toBe(100);
    const kmSet = new Set(detail!.daySkeleton.map((d) => d.distanceKm));
    expect(kmSet.size).toBeGreaterThan(1);
    const ascentSet = new Set(detail!.daySkeleton.map((d) => d.ascentM));
    expect(ascentSet.size).toBeGreaterThan(1);
    expect(detail!.fitnessMatch!.dayPaceVerdict[0].noteZh).toContain('470');
    expect(detail!.fitnessMatch!.dayPaceVerdict[0].noteZh).not.toMatch(/每天.*500/);
  });

  it('returns null for non-hiking route', async () => {
    const detail = await service.build({
      name: 'IS_GOLDEN_CIRCLE',
      tags: ['自驾'],
    });
    expect(detail).toBeNull();
  });
});
