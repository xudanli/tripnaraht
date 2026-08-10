import {
  inferCnClassicRouteIdsFromLatLng,
  resolveCnSeasonalRoadStatus,
} from './cn-seasonal-road-status.util';

describe('cn-seasonal-road-status.util', () => {
  it('infers G318 corridor from Kangding-ish coordinates', () => {
    // 康定附近
    expect(inferCnClassicRouteIdsFromLatLng(30.05, 101.96)).toContain(
      'cn.route.g318',
    );
  });

  it('marks G318 July as LIMITED with elevated risk (not fake-safe)', () => {
    const r = resolveCnSeasonalRoadStatus({
      classicRouteId: 'cn.route.g318',
      asOfDate: '2026-07-15',
    });
    expect(r.isOpen).toBe(true);
    expect(r.roadStatus).toBe('LIMITED');
    expect(r.riskLevel).toBeGreaterThanOrEqual(2);
    expect(r.source).toBe('cn.seasonal-advisory');
    expect(r.seasonWindowIds).toContain('g318_rainy_season');
    expect(r.evidenceGrade).toBe('seasonal_static');
  });

  it('marks Duku December as CLOSED outside open window', () => {
    const r = resolveCnSeasonalRoadStatus({
      classicRouteId: 'cn.route.duku',
      asOfDate: '2026-12-01',
    });
    expect(r.isOpen).toBe(false);
    expect(r.roadStatus).toBe('CLOSED');
    expect(r.riskLevel).toBe(3);
    expect(r.seasonWindowIds).toContain('duku_open_season');
  });

  it('never returns riskLevel 0 for unmatched CN point', () => {
    // 上海大致坐标：无经典走廊
    const r = resolveCnSeasonalRoadStatus({
      lat: 31.23,
      lng: 121.47,
      asOfDate: '2026-05-01',
    });
    expect(r.riskLevel).toBeGreaterThanOrEqual(1);
    expect(r.roadStatus).toBe('UNKNOWN');
    expect(r.evidenceGrade).toBe('seasonal_static');
  });

  it('uses geo inference for Duku bbox in winter', () => {
    const r = resolveCnSeasonalRoadStatus({
      lat: 43.2,
      lng: 84.5,
      asOfDate: '2026-12-10',
    });
    expect(r.classicRouteIds).toContain('cn.route.duku');
    expect(r.roadStatus).toBe('CLOSED');
  });
});
