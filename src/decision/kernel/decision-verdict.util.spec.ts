import {
  buildDecisionVerdictFromCgusResult,
  buildDecisionVerdictFromHints,
} from './decision-verdict.util';
import type { CGUSSearchResult } from '../../trips/decision/optimization/cgus-search.service';

function mockCgusResult(): CGUSSearchResult {
  return {
    usedMonteCarlo: true,
    rankedCandidates: [
      {
        candidate: {
          id: 'plan-a',
          plan: { segments: [] } as any,
          constraintViolations: [],
          feasible: true,
        },
        utility: 0.8,
        expectedUtility: 0.82,
        feasibilityProbability: 0.95,
      },
      {
        candidate: {
          id: 'plan-b',
          plan: { segments: [] } as any,
          constraintViolations: [
            { type: 'TIME_SLACK', severity: 'HARD', degree: 1 },
          ],
          feasible: false,
        },
        utility: 0.7,
        expectedUtility: 0.71,
        feasibilityProbability: 0.4,
      },
      {
        candidate: {
          id: 'plan-c',
          plan: { segments: [] } as any,
          constraintViolations: [
            { type: 'FATIGUE_SOFT', severity: 'SOFT', degree: 0.3 },
          ],
          feasible: true,
        },
        utility: 0.75,
        expectedUtility: 0.76,
        feasibilityProbability: 0.88,
      },
    ],
    recommended: {
      id: 'plan-a',
      plan: { segments: [] } as any,
      constraintViolations: [],
      feasible: true,
    },
    monteCarloSamplingDetails: {
      totalSamples: 400,
      samplesPerCandidate: { 'plan-a': 150, 'plan-b': 125, 'plan-c': 125 },
    },
  };
}

describe('decision-verdict.util', () => {
  it('buildDecisionVerdictFromCgusResult marks infeasible and rejected with reasons', () => {
    const v = buildDecisionVerdictFromCgusResult(mockCgusResult());
    expect(v?.chosen_plan_id).toBe('plan-a');
    expect(v?.rejected_plans).toHaveLength(2);
    const hard = v?.rejected_plans.find((r) => r.id === 'plan-b');
    expect(hard?.status).toBe('infeasible');
    expect(hard?.rejection_reasons?.[0]).toContain('HARD:TIME_SLACK');
    const soft = v?.rejected_plans.find((r) => r.id === 'plan-c');
    expect(soft?.status).toBe('rejected');
    expect(v?.monte_carlo_summary?.total_samples).toBe(400);
  });

  it('buildDecisionVerdictFromHints mirrors alternatives', () => {
    const v = buildDecisionVerdictFromHints({
      recommendedAlternativeId: 'x',
      alternatives: [
        { id: 'x', score: 0.9, expectedUtility: 0.9 },
        {
          id: 'y',
          score: 0.5,
          violations: [{ type: 'CLOSED', severity: 'HARD', degree: 1 }],
          riskProfile: { hard_violations: 1, soft_degree: 0 },
        },
      ],
    } as any);
    expect(v?.chosen_plan_id).toBe('x');
    expect(v?.rejected_plans[0].status).toBe('infeasible');
  });
});
