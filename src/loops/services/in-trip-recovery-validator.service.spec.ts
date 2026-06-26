import { InTripRecoveryValidatorService } from './in-trip-recovery-validator.service';

describe('InTripRecoveryValidatorService', () => {
  const svc = new InTripRecoveryValidatorService();

  it('passes plan with high equivalence and no booking', () => {
    const result = svc.validateAlternativePlan(
      {
        planId: 'p1',
        name: 'Skip lunch',
        description: 'test',
        timeAdjustment: '跳过 45 分钟停留',
        costDifference: 0,
        experienceEquivalence: 0.8,
        bookingRequired: false,
      },
      { severity: 'yellow', delayMinutes: 55 },
    );
    expect(result.passed).toBe(true);
    expect(result.lateProbabilityAfter).toBeLessThan(result.lateProbabilityBefore);
  });

  it('defers when booking required', () => {
    const result = svc.validateAlternativePlan(
      {
        planId: 'p2',
        name: 'Book indoor',
        description: 'test',
        timeAdjustment: 'replace',
        costDifference: 100,
        experienceEquivalence: 0.9,
        bookingRequired: true,
      },
      { severity: 'red', delayMinutes: 10 },
    );
    expect(result.passed).toBe(false);
  });
});
