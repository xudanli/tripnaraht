import { FeasibilityPomdpMonteCarloService } from './feasibility-pomdp-monte-carlo.service';
import { assessMonteCarloDeterministicAlignment } from '../utils/feasibility-mc-alignment.util';
import type { ExpectedUtilityResult } from '../../decision/optimization/probabilistic/expected-utility.service';

describe('FeasibilityPomdpMonteCarloService MC↔deterministic consistency', () => {
  const buildMcResult = (feasibilityProbability: number, expectedUtility: number): ExpectedUtilityResult => ({
    feasibilityProbability,
    expectedUtility,
    confidenceInterval: { lower: expectedUtility - 0.1, upper: expectedUtility + 0.1, level: 0.9 },
    riskMetrics: {
      downRiskProbability: 0.1,
      worstCase: expectedUtility - 0.2,
      bestCase: expectedUtility + 0.2,
      volatility: 0.05,
    },
    dimensionExpectations: {
      safety: 0.7,
      fatigueRisk: 0.3,
      weatherRisk: 0.2,
      budgetOverrun: 0.1,
    },
    samplingDetails: {
      sampleSize: 100,
      convergenceAchieved: true,
      effectiveSampleSize: 95,
    },
  });

  it('narrative states MC does not override must_handle gate', () => {
    const service = new FeasibilityPomdpMonteCarloService({} as never);
    const narrative = (service as unknown as {
      buildNarrative: (r: ExpectedUtilityResult, f: string[]) => string;
    }).buildNarrative(buildMcResult(0.75, 0.6), []);
    expect(narrative).toContain('不覆盖 must_handle');
  });

  it('alignment util agrees with high-utility deterministic fixture direction', () => {
    const mc = buildMcResult(0.78, 0.65);
    const detUtility = 0.62;
    const report = assessMonteCarloDeterministicAlignment(
      { feasibilityProbability: mc.feasibilityProbability, expectedUtility: mc.expectedUtility },
      { totalUtility: detUtility, hardViolationCount: 0 },
    );
    expect(report.aligned).toBe(true);
    expect(report.session_consistency_score).toBeGreaterThanOrEqual(75);
  });

  it('alignment util rejects optimistic MC when deterministic has hard violations', () => {
    const mc = buildMcResult(0.9, 0.8);
    const report = assessMonteCarloDeterministicAlignment(
      { feasibilityProbability: mc.feasibilityProbability, expectedUtility: mc.expectedUtility },
      { totalUtility: 0.4, hardViolationCount: 1 },
    );
    expect(report.aligned).toBe(false);
    expect(report.dominant_cid).toBe('HARD_CONSTRAINT');
  });
});
