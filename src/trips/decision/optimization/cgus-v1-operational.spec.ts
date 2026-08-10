import { DEFAULT_UNIFIED_WEIGHTS } from './unified-decision-formula.service';
import {
  CGUS_WEIGHT_LEARNING_INTO_RANKING_AUTHORIZED,
  resolveCgusUnifiedRankingWeights,
} from './cgus-v1-authorization';
import { projectCgusDecisionTraceFromSearchResult } from './cgus-decision-trace.util';
import type { CGUSSearchResult } from './cgus-search.service';

describe('CGUS V1 operational boundaries', () => {
  it('does not authorize WeightLearner into ranking by default', () => {
    expect(CGUS_WEIGHT_LEARNING_INTO_RANKING_AUTHORIZED).toBe(false);
  });

  it('resolveCgusUnifiedRankingWeights ignores learned weights while unauthorized', () => {
    const learned = { safety: 0.99, experienceDensity: 0.01 };
    expect(resolveCgusUnifiedRankingWeights(learned)).toEqual(DEFAULT_UNIFIED_WEIGHTS);
  });

  it('projectCgusDecisionTraceFromSearchResult captures ranking margin', () => {
    const result = {
      recommended: { id: 'A', plan: {} as any, constraintViolations: [], feasible: true },
      usedMonteCarlo: false,
      rankedCandidates: [
        {
          candidate: { id: 'A', plan: {} as any, constraintViolations: [], feasible: true },
          utility: 0.9,
          expectedUtility: 0.88,
          utilityBreakdown: {
            safety: 0.9,
            experience: 0.7,
            philosophy: 0.8,
            risk_penalty: 0.1,
            budget_penalty: 0,
            time_penalty: 0.2,
          },
        },
        {
          candidate: { id: 'B', plan: {} as any, constraintViolations: [], feasible: true },
          utility: 0.8,
          expectedUtility: 0.8,
          utilityBreakdown: {
            safety: 0.85,
            experience: 0.75,
            philosophy: 0.7,
            risk_penalty: 0.05,
            budget_penalty: 0,
          },
        },
      ],
    } as CGUSSearchResult;

    const trace = projectCgusDecisionTraceFromSearchResult({
      decision_id: 'd1',
      trip_id: 't1',
      decision_type: 'OPTIMIZE',
      result,
    });

    expect(trace.schemaVersion).toBe('cgus-decision-trace/v1');
    expect(trace.ranking).toEqual(['A', 'B']);
    expect(trace.recommended_candidate).toBe('A');
    expect(trace.top1_margin).toBeCloseTo(0.08);
    expect(trace.candidate_scores.A.safety).toBe(0.9);
    expect(trace.candidate_scores.A.budget_penalty).toBe(0);
    expect(trace.candidate_scores.A.expected_utility).toBe(0.88);
    expect(trace.user_action).toBeUndefined();
  });
});
