import { resolveTripHardConstraintEnforcement } from './trip-constraint-hard-enforcement.util';

describe('trip-constraint-hard-enforcement.util', () => {
  it('resolves noNightDrive + maxDailyDrive from metadata for self-drive', () => {
    const enforcement = resolveTripHardConstraintEnforcement({
      metadata: {
        constraints: {
          maxDailyDrivingHours: 4,
          noNightDrive: { maxMinutesAfterSunset: 45 },
        },
      },
      pacingConfig: { travelMode: 'self_drive' },
      budgetTotal: 50000,
      budgetCurrency: 'CNY',
    });
    expect(enforcement.maxDailyDrivingHours).toBe(4);
    expect(enforcement.noNightDrive?.maxMinutesAfterSunset).toBe(45);
    expect(enforcement.budgetTotal).toEqual({ total: 50000, currency: 'CNY' });
  });

  it('skips noNightDrive when disabled', () => {
    const enforcement = resolveTripHardConstraintEnforcement({
      metadata: { constraints: { noNightDrive: { enabled: false } } },
      pacingConfig: { travelMode: 'self_drive' },
    });
    expect(enforcement.noNightDrive).toBeUndefined();
  });
});
