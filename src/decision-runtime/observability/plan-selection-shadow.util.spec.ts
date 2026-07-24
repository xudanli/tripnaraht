import { compareOptimizationShadow } from './plan-selection-shadow.util';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';

describe('compareOptimizationShadow', () => {
  const candidates: DecisionCandidate[] = [
    {
      candidateId: 'a',
      label: 'A',
      source: 'LEGACY_TRIP_PLANNING',
      plan: { version: 'v1', createdAt: '', days: [] },
      utilityHint: 0.9,
      createdAt: '',
    },
    {
      candidateId: 'b',
      label: 'B',
      source: 'LEGACY_TRIP_PLANNING',
      plan: { version: 'v1', createdAt: '', days: [] },
      utilityHint: 0.7,
      createdAt: '',
    },
  ];

  const reports = {
    a: {
      schemaId: 'tripnara.canonical_constraint_report@v1' as const,
      tripId: 't1',
      evaluatedAt: '',
      assertions: [],
      completeness: {
        roads: 'COMPLETE' as const,
        weather: 'COMPLETE' as const,
        hazards: 'COMPLETE' as const,
        ferries: 'COMPLETE' as const,
        openingHours: 'MISSING' as const,
      },
      overallStatus: 'FEASIBLE' as const,
      degraded: false,
      degradedReasons: [],
    },
    b: {
      schemaId: 'tripnara.canonical_constraint_report@v1' as const,
      tripId: 't1',
      evaluatedAt: '',
      assertions: [],
      completeness: {
        roads: 'COMPLETE' as const,
        weather: 'COMPLETE' as const,
        hazards: 'COMPLETE' as const,
        ferries: 'COMPLETE' as const,
        openingHours: 'MISSING' as const,
      },
      overallStatus: 'FEASIBLE' as const,
      degraded: false,
      degradedReasons: [],
    },
  };

  it('detects strategy vs legacy finalize divergence', () => {
    const result = compareOptimizationShadow({
      candidates,
      constraintReports: reports,
      legacyFinalizeSelectedId: 'a',
      optimizationResult: {
        schemaId: 'tripnara.optimization_result@v1',
        problemId: 'p1',
        tripId: 't1',
        snapshotId: 'ws1',
        feasibilityStatus: 'FEASIBLE',
        terminationReason: 'OPTIMAL',
        hasIncumbent: true,
        candidates,
        recommendedCandidateId: 'b',
        constraintReport: reports.a,
        optimizationTrace: { traceId: 't', steps: [] },
        solverMetadata: {
          strategyId: 'cp-sat-lexicographic',
          strategyVersion: '0.1.0',
          elapsedMs: 1,
        },
        explanation: { schemaId: 'tripnara.structured_explanation@v1', summary: 'ok' },
      },
    });
    expect(result.diverged).toBe(true);
    expect(result.legacyUtilityWinnerId).toBe('a');
    expect(result.strategySelectedId).toBe('b');
  });
});
