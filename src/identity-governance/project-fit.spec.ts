import { evaluateProjectFit } from './utils/project-fit-evaluation.util';

describe('project-fit-evaluation.util', () => {
  const listing = {
    budgetMinCents: 500000,
    budgetMaxCents: 800000,
    slotsTotal: 6,
    slotsFilled: 2,
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-08-07'),
  };

  it('returns NOT_RECOMMENDED when BLOCKER hard rule fails', () => {
    const result = evaluateProjectFit({
      rules: [
        {
          id: 'r1',
          conditionKey: 'dates_available',
          operator: 'EQ',
          value: { expected: true },
          severity: 'BLOCKER',
          waiverPolicy: 'NOT_ALLOWED',
          explanationTemplate: '日期不满足',
        },
      ],
      answers: { dates_available: false, pace_acceptance: 5 },
      listing,
    });
    expect(result.overallResult).toBe('NOT_RECOMMENDED');
  });

  it('does not let soft dimensions override BLOCKER failure', () => {
    const result = evaluateProjectFit({
      rules: [
        {
          id: 'r1',
          conditionKey: 'budget_affordable',
          operator: 'GTE',
          value: { minCents: 500000 },
          severity: 'BLOCKER',
          waiverPolicy: 'NOT_ALLOWED',
          explanationTemplate: null,
        },
      ],
      answers: { budget_cents: 100000, pace_acceptance: 5, risk_acceptance: 5 },
      listing,
    });
    expect(result.overallResult).toBe('NOT_RECOMMENDED');
  });

  it('returns HIGH_FIT when hard rules pass and team impact is LOW', () => {
    const result = evaluateProjectFit({
      rules: [
        {
          id: 'r1',
          conditionKey: 'dates_available',
          operator: 'EQ',
          value: { expected: true },
          severity: 'BLOCKER',
          waiverPolicy: 'NOT_ALLOWED',
          explanationTemplate: null,
        },
      ],
      answers: {
        dates_available: true,
        budget_cents: 750000,
        pace_acceptance: 5,
        risk_acceptance: 4,
        accommodation_shared: true,
      },
      listing,
    });
    expect(result.overallResult).toBe('HIGH_FIT');
    expect(result.explanationBundle.leader.some((l) => l.includes('HIGH_FIT'))).toBe(true);
  });

  it('uses privacy-safe team impact wording for leader report', () => {
    const result = evaluateProjectFit({
      rules: [],
      answers: { accommodation_shared: false, pace_acceptance: 1 },
      listing: { ...listing, slotsFilled: 5 },
    });
    expect(result.teamImpactResult.privacySafeSummary).not.toMatch(/王女士|预算只有/);
    expect(['MEDIUM', 'HIGH']).toContain(result.teamImpactResult.level);
  });
});
