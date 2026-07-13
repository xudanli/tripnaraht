import { classifyDriveLoadTier, loadDrivingLoadConfig } from './driving-load-config.loader';

describe('driving-load-config.loader', () => {
  it('loads Iceland driving load factors from pack modifier', () => {
    const config = loadDrivingLoadConfig('IS');
    expect(config.modifierId).toBe('IS_DRIVING_LOAD');
    expect(config.roadFactors.gravel).toBe(1.2);
    expect(config.penalties.noviceAbroadMinutes).toBe(30);
    expect(config.tierThresholdsMinutes.HIGH).toEqual({ min: 301, max: 420 });
  });

  it('classifies drive load tiers per contract thresholds', () => {
    const config = loadDrivingLoadConfig('IS');
    expect(classifyDriveLoadTier(120, config)).toBe('LOW');
    expect(classifyDriveLoadTier(240, config)).toBe('MEDIUM');
    expect(classifyDriveLoadTier(340, config)).toBe('HIGH');
    expect(classifyDriveLoadTier(500, config)).toBe('EXTREME');
  });
});
