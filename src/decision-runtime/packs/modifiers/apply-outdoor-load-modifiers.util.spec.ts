import {
  applyWindExposureToKmh,
  applyHighlandFatigueToPhysicalLoad,
  effectiveDailyLoadThresholdHours,
  applyActivityLoadToWeatherFacts,
} from './apply-outdoor-load-modifiers.util';

describe('apply-outdoor-load-modifiers.util', () => {
  it('OUT-001: wind exposure scales outdoor wind for pack rules', () => {
    expect(applyWindExposureToKmh(80, 1.15, true)).toBe(92);
    expect(applyWindExposureToKmh(80, 1.15, false)).toBe(80);
  });

  it('OUT-002: highland fatigue increases physical load', () => {
    expect(applyHighlandFatigueToPhysicalLoad(0.8, 1.1)).toBe(0.88);
    expect(applyHighlandFatigueToPhysicalLoad(0.95, 1.1)).toBe(1);
  });

  it('OUT-003: fatigue lowers effective daily load threshold', () => {
    expect(effectiveDailyLoadThresholdHours(7, 1.1)).toBeCloseTo(6.364, 3);
  });

  it('OUT-004: weather facts helper applies both gust and sustained wind', () => {
    const adjusted = applyActivityLoadToWeatherFacts({
      windSpeedKmh: 80,
      windGustKmh: 85,
      activityExposed: true,
      activityLoad: { windExposureMultiplier: 1.15, highlandFatigueFactor: 1.1 },
    });
    expect(adjusted.windSpeedKmh).toBe(92);
    expect(adjusted.windGustKmh).toBe(97.75);
  });
});
