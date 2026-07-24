import { assessShadowReviewEligibility } from './shadow-review-eligibility.util';
import type { OptimizationShadowEvent } from './shadow-divergence.types';

function baseEvent(
  overrides: Partial<OptimizationShadowEvent> = {},
): OptimizationShadowEvent {
  return {
    schemaId: 'tripnara.optimization_shadow_event@v1',
    comparisonId: 'cmp_test',
    tripId: 'trip_1',
    decisionRunId: 'run_1',
    problemId: 'prob_1',
    snapshotId: 'snap_1',
    runtimeMode: 'SHADOW',
    authorityStrategyId: 'legacy-frozen',
    shadowStrategyId: 'cp-sat-lexicographic',
    inputFingerprint: {
      snapshotId: 'snap_1',
      snapshotHash: 'a',
      candidateSetHash: 'b',
      candidateCount: 2,
      constraintReportHash: 'c',
      constraintReportVersion: 'v1',
      objectiveRegistryVersion: 'v1',
      objectiveConfigHash: 'd',
    },
    inputConsistent: true,
    eligibleForStrategyComparison: true,
    authorityResult: {
      strategyId: 'legacy-frozen',
      strategyVersion: '0.1.0',
      success: true,
      timedOut: false,
      selectedCandidateId: 'auth_winner',
      feasibilityStatus: 'FEASIBLE',
      terminationReason: 'FEASIBLE_NOT_PROVEN_OPTIMAL',
      hasIncumbent: true,
      elapsedMs: 5,
      rankedTop3: ['auth_winner'],
      hardViolation: false,
      postValidationRejected: false,
    },
    shadowResult: {
      strategyId: 'cp-sat-lexicographic',
      strategyVersion: '0.1.0',
      solverEngine: 'cp-sat-lex-v1',
      success: true,
      timedOut: false,
      selectedCandidateId: 'shadow_winner',
      feasibilityStatus: 'FEASIBLE',
      terminationReason: 'FEASIBLE_NOT_PROVEN_OPTIMAL',
      hasIncumbent: true,
      elapsedMs: 3,
      rankedTop3: ['shadow_winner'],
      hardViolation: false,
      postValidationRejected: false,
    },
    divergence: {
      diverged: true,
      sameWinner: false,
      types: ['DIFFERENT_WINNER'],
      severity: 'MEDIUM',
      explainability: ['lex preferred lower drive'],
      stageTraceComplete: true,
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('assessShadowReviewEligibility', () => {
  it('accepts DIFFERENT_WINNER with both incumbents', () => {
    expect(assessShadowReviewEligibility(baseEvent()).eligible).toBe(true);
  });

  it('rejects INPUT_MISMATCH', () => {
    const r = assessShadowReviewEligibility(
      baseEvent({
        divergence: {
          ...baseEvent().divergence,
          types: ['INPUT_MISMATCH', 'DIFFERENT_WINNER'],
        },
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.exclusionReason).toBe('INPUT_MISMATCH');
  });

  it('rejects SAME_WINNER', () => {
    const r = assessShadowReviewEligibility(
      baseEvent({
        divergence: {
          ...baseEvent().divergence,
          sameWinner: true,
          types: ['SAME_WINNER'],
        },
        shadowResult: {
          ...baseEvent().shadowResult!,
          selectedCandidateId: 'auth_winner',
        },
      }),
    );
    expect(r.eligible).toBe(false);
  });

  it('rejects SHADOW_ERROR', () => {
    const r = assessShadowReviewEligibility(
      baseEvent({
        divergence: {
          ...baseEvent().divergence,
          types: ['SHADOW_ERROR'],
        },
        shadowResult: {
          ...baseEvent().shadowResult!,
          success: false,
          selectedCandidateId: undefined,
        },
      }),
    );
    expect(r.exclusionReason).toBe('SHADOW_ERROR');
  });
});
