import { computeFeasibilityDistanceAndDuration, surfaceVelocityFactor } from './iceland-route-feasibility-metrics.util';

describe('iceland-route-feasibility-metrics', () => {
  it('surfaceVelocityFactor matches gravel / mixed / paved', () => {
    expect(surfaceVelocityFactor('gravel')).toBe(0.7);
    expect(surfaceVelocityFactor('mixed')).toBe(0.85);
    expect(surfaceVelocityFactor('paved')).toBe(1);
    expect(surfaceVelocityFactor(undefined)).toBe(1);
  });

  it('extends driving hours on gravel vs paved at same km', () => {
    const paved = computeFeasibilityDistanceAndDuration(
      [{ from_region: 'a', to_region: 'b', distanceKm: 120, surface: 'paved' }],
      60,
    );
    const gravel = computeFeasibilityDistanceAndDuration(
      [{ from_region: 'a', to_region: 'b', distanceKm: 120, surface: 'gravel' }],
      60,
    );
    expect(paved.totalKm).toBe(120);
    expect(gravel.totalKm).toBe(120);
    expect(gravel.estimatedDrivingHours).toBeGreaterThan(paved.estimatedDrivingHours);
    expect(gravel.estimatedDrivingHours).toBeCloseTo(120 / (60 * 0.7), 5);
  });
});
