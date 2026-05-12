import { evaluateGravelRoadSurfaceAlerts } from './iceland-gravel-road-surface-alerts.util';

describe('evaluateGravelRoadSurfaceAlerts', () => {
  it('is silent when no gravel surface is declared', () => {
    const r = evaluateGravelRoadSurfaceAlerts([
      { from_region: 'reykjavik', to_region: 'vik', surface: 'paved' },
      { from_region: 'vik', to_region: 'hofn', surface: 'mixed' },
    ]);
    expect(r.triggered).toBe(false);
    expect(r.recommendedAdjustments).toEqual([]);
  });

  it('fires for gravel segments and lists affected preset pairs', () => {
    const r = evaluateGravelRoadSurfaceAlerts([
      { from_region: 'holmavik', to_region: 'isafjordur', distanceKm: 100, surface: 'gravel' },
    ]);
    expect(r.triggered).toBe(true);
    expect(r.recommendedAdjustments).toEqual(['REVIEW_GRAVEL_PROTECTION_INSURANCE']);
    expect(r.affectedSegments).toEqual(['holmavik-isafjordur']);
    expect(r.drivingNotes.some((n) => /Gravel Protection|GP/i.test(n))).toBe(true);
  });
});
