import { latentSnapshotFromWorldContext } from './latent-from-world-context';

describe('latentSnapshotFromWorldContext', () => {
  it('maps risk tolerance and fitness per LATENT_CONTRACT_FIELD_DICTIONARY v1', () => {
    const world: any = {
      physical: {
        month: 3,
        climateSeasonality: {
          accessibilityScore: 0.82,
          typicalWeather: { windSpeedMps: 10, precipitationMmPerHour: 2 },
        },
      },
      human: { fitnessScore: 60, riskTolerance: 'LOW' },
      routeDirection: { id: 'rd', name: 'Test' },
    };
    const s = latentSnapshotFromWorldContext(world);
    expect(s.contractVersion).toBe('latent-snapshot@v1');
    expect(s.z_user?.risk_tolerance).toBe(0.25);
    expect(s.z_user?.experience_level).toBeCloseTo(0.6, 5);
    expect(s.z_env?.accessibility_01).toBe(0.82);
    expect(s.z_env?.weather_stress_01).toBeGreaterThan(0);
    expect(s.z_env?.weather_stress_01).toBeLessThanOrEqual(1);
  });

  it('omits z_user when human missing', () => {
    const world: any = {
      physical: { month: 1, climateSeasonality: {} },
      human: undefined,
      routeDirection: { id: 'rd', name: 'Test' },
    };
    const s = latentSnapshotFromWorldContext(world);
    expect(s.z_user?.risk_tolerance).toBeUndefined();
    expect(s.z_user?.experience_level).toBeUndefined();
  });
});
