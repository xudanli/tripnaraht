import { formatDecisionVerdictNarrationZh } from './decision-verdict-narration.zh.util';

describe('formatDecisionVerdictNarrationZh', () => {
  it('renders chosen and rejected with reasons', () => {
    const text = formatDecisionVerdictNarrationZh(
      {
        chosen_plan_id: 'plan-a',
        rejected_plans: [
          {
            id: 'plan-b',
            status: 'infeasible',
            rejection_reasons: ['HARD:TIME_SLACK'],
          },
        ],
        monte_carlo_summary: { used: true, total_samples: 500 },
      },
      { method: 'CGUS' },
    );
    expect(text).toContain('plan-a');
    expect(text).toContain('plan-b');
    expect(text).toContain('500');
  });
});
