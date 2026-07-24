import { computeSocialBackgroundAlignment } from './social-background-matching.engine';

describe('social background alignment', () => {
  it('adds bonus for same industry cluster', () => {
    const result = computeSocialBackgroundAlignment(
      {
        professionIndustry: 'tech',
        educationDegree: 'master',
        fulfillmentBlocked: false,
      },
      {
        professionIndustry: 'consulting',
        educationDegree: 'master',
        fulfillmentBlocked: false,
      },
    );
    expect(result.bonusPercent).toBeGreaterThanOrEqual(10);
  });

  it('hard blocks when fulfillment flagged', () => {
    const result = computeSocialBackgroundAlignment(
      { fulfillmentBlocked: true },
      { fulfillmentBlocked: false },
    );
    expect(result.hardBlocked).toBe(true);
  });
});
