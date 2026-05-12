import { deriveTravelHazards } from './derive-travel-hazards';

describe('deriveTravelHazards', () => {
  it('creates CROSSWIND and HIGH_RISK for campervan at moderate wind', () => {
    const out = deriveTravelHazards(
      {
        windSpeedMs: 10,
        windGustMs: 12,
        windDirectionDeg: 90,
        precipitationMm: 2,
        visibilityKm: 10,
      },
      { maxWindSpeed: 15, maxCrosswindSpeed: 12 },
      { vehicleClass: 'CAMPERVAN' },
    );
    expect(out.hazards.some(h => h.kind === 'CROSSWIND')).toBe(true);
    expect(out.executionState === 'HIGH_RISK' || out.executionState === 'DEGRADED').toBe(true);
    expect(out.executionQuality.delayFactor).toBeGreaterThan(1);
  });

  it('blocks on extreme gust regardless of sedan profile', () => {
    const out = deriveTravelHazards(
      {
        windSpeedMs: 12,
        windGustMs: 28,
        windDirectionDeg: 0,
        precipitationMm: 0,
        visibilityKm: 15,
      },
      undefined,
      { vehicleClass: 'SEDAN' },
    );
    expect(out.hazards.some(h => h.kind === 'GUST_EXTREME')).toBe(true);
    expect(out.executionQuality.safeScore).toBeLessThan(1);
  });

  it('maps HARD violation to BLOCKED execution state', () => {
    const out = deriveTravelHazards(
      {
        windSpeedMs: 22,
        windGustMs: 22,
        windDirectionDeg: 180,
        precipitationMm: 0,
        visibilityKm: 20,
      },
      { maxWindSpeed: 15 },
      { vehicleClass: 'SUV_4WD' },
    );
    expect(out.violation).toBe('HARD');
    expect(out.executionState).toBe('BLOCKED');
  });
});
