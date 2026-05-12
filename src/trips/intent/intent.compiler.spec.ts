import { compileIntent } from './intent.compiler';

describe('compileIntent', () => {
  it('maps LOW_DRIVE + RELAXED to conservative drive budget', () => {
    const c = compileIntent({
      explicitIntent: {
        mobilityPreference: 'LOW_DRIVE',
        pace: 'RELAXED',
        riskTolerance: 'LOW',
        experienceBias: { nature: 3, driving: 1, city: 0 },
      },
    });
    expect(c.constraints.maxDailyDriveHours).toBe(3);
    expect(c.constraints.preferScenicRoutes).toBe(true);
    expect(c.priorities).toContain('minimize_daily_drive');
  });

  it('infers low-drive from Chinese lightweight keywords', () => {
    const c = compileIntent({
      message: { text: '尽量少开车，轻松一点，多看风景' },
    });
    expect(c.constraints.maxDailyDriveHours).toBeLessThanOrEqual(3);
    expect(c.weights.driveTime).toBeLessThan(0);
  });
});
