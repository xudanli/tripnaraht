import {
  buildCnDrivingContext,
  toCnDrivingContextMetadataProjection,
} from './cn-driving-context.util';

describe('cn-driving-context.util', () => {
  it('builds G318 July context with plateau + rainy season + Chengdu limit', () => {
    const ctx = buildCnDrivingContext({
      classicRouteId: 'cn.route.g318',
      startDate: '2026-07-01',
      endDate: '2026-07-14',
    });
    expect(ctx.wantsXizang).toBe(true);
    expect(ctx.wantsSichuan).toBe(true);
    expect(ctx.requiresAltitudeAcclimatization).toBe(true);
    expect(ctx.checkpointLikely).toBe(true);
    expect(ctx.drivingThresholdPackCode).toBe('CN_XIZANG');
    expect(ctx.drivingSegmentThresholds?.maxSegmentDistanceKm).toBe(250);
    expect(ctx.cityDrivingLimits.some((c) => c.cityCN === '成都')).toBe(true);
    expect(
      ctx.seasonWindowHits.some((h) => h.windowId === 'g318_rainy_season'),
    ).toBe(true);
    expect(ctx.advisoriesCN.length).toBeGreaterThan(0);
    expect(ctx.advisoriesCN.some((a) => a.includes('不代办'))).toBe(true);
    expect(ctx.tibetCheckpointPlaybook?.playbook_id).toBe(
      'cn.playbook.tibet_checkpoint_pilot',
    );
    expect(ctx.etcRecommended).toBe(true);
    expect(ctx.roadStatusHint.roadStatus).toBe('LIMITED');
    expect(ctx.roadStatusHint.riskLevel).toBeGreaterThanOrEqual(2);
  });

  it('merges explicit city hints for limits', () => {
    const ctx = buildCnDrivingContext({
      classicRouteId: 'cn.route.qinggan_loop',
      cityHints: ['北京'],
    });
    expect(ctx.drivingThresholdPackCode).toBe('CN');
    expect(ctx.cityDrivingLimits.some((c) => c.cityCN === '北京')).toBe(true);
  });

  it('projects compact metadata for trip bootstrap', () => {
    const ctx = buildCnDrivingContext({
      classicRouteId: 'cn.route.duku',
      startDate: '2026-12-01',
      endDate: '2026-12-04',
    });
    const proj = toCnDrivingContextMetadataProjection(ctx);
    expect(proj.classicRouteId).toBe('cn.route.duku');
    expect(proj.highSeveritySeasonHits).toEqual(
      expect.arrayContaining(['duku_open_season']),
    );
    expect(Array.isArray(proj.advisoriesCN)).toBe(true);
  });
});
