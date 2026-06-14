import {
  calculateSafetyRiskForPhase,
  calculateTransportCertaintyForPhase,
} from './trip-readiness-score.util';
import type { CoverageGap, SegmentCoverage } from '../types/coverage-map.types';

function farFutureStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 120);
  return d;
}

describe('trip-readiness-score.util', () => {
  it('does not heavily penalize long-drive warnings during planning', () => {
    const segments: SegmentCoverage[] = [
      {
        id: 'seg-1',
        fromPoiId: 'a',
        toPoiId: 'b',
        day: 1,
        distance: 250,
        duration: 300,
        routeType: 'driving',
        coverageStatus: 'warning',
        polyline: '',
        hazards: [{ type: 'long_distance', severity: 'medium', message: '长距离' }],
      },
      {
        id: 'seg-2',
        fromPoiId: 'b',
        toPoiId: 'c',
        day: 2,
        distance: 280,
        duration: 320,
        routeType: 'driving',
        coverageStatus: 'warning',
        polyline: '',
        hazards: [{ type: 'winter_driving', severity: 'medium', message: '冬季行驶' }],
      },
    ];

    const planningScore = calculateTransportCertaintyForPhase(segments, 'planning', 3);
    const departureScore = calculateTransportCertaintyForPhase(segments, 'pre_departure', 3);

    expect(planningScore).toBeGreaterThanOrEqual(85);
    expect(departureScore).toBeLessThan(planningScore);
  });

  it('defers generic weather risks from safety score during planning', () => {
    const start = farFutureStart();
    const gaps: CoverageGap[] = [];
    const risks = [
      { type: 'WEATHER', category: 'weather', severity: 'medium', isGenericTemplate: true },
      { type: 'terrain', severity: 'high', summary: 'F 路需要四驱' },
    ];

    const planningScore = calculateSafetyRiskForPhase(gaps, risks, start, []);
    const withWeatherOnly = calculateSafetyRiskForPhase(
      gaps,
      [{ type: 'WEATHER', category: 'weather', severity: 'high', isGenericTemplate: true }],
      start,
      [],
    );

    expect(withWeatherOnly).toBe(100);
    expect(planningScore).toBeLessThan(100);
  });

  it('ignores segment gaps during planning safety score', () => {
    const start = farFutureStart();
    const gaps: CoverageGap[] = [
      {
        id: 'gap-1',
        type: 'segment',
        relatedId: 'seg-1',
        coordinates: { lat: 0, lng: 0 },
        severity: 'high',
        message: '长驾段',
      },
      {
        id: 'gap-2',
        type: 'poi',
        relatedId: 'poi-1',
        coordinates: { lat: 0, lng: 0 },
        severity: 'medium',
        message: '缺少营业时间',
      },
    ];

    const score = calculateSafetyRiskForPhase(gaps, [], start, []);
    expect(score).toBe(92);
  });
});
