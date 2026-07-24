import { buildOptimizationShadowEvent } from './shadow-divergence-builder.util';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { OptimizationProblem } from '../contracts/optimization-problem';

describe('buildOptimizationShadowEvent', () => {
  const candidates: DecisionCandidate[] = [
    {
      candidateId: 'balanced',
      label: 'Balanced',
      source: 'LEGACY_TRIP_PLANNING',
      plan: { version: 'v1', createdAt: '', days: [] },
      utilityHint: 0.85,
      createdAt: '',
    },
    {
      candidateId: 'conservative',
      label: 'Conservative',
      source: 'LEGACY_TRIP_PLANNING',
      plan: { version: 'v1', createdAt: '', days: [] },
      utilityHint: 0.65,
      createdAt: '',
    },
  ];

  const reports = {
    balanced: {
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
    conservative: {
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

  const problem: OptimizationProblem = {
    schemaId: 'tripnara.optimization_problem@v1',
    problemId: 'p1',
    tripId: 't1',
    snapshotId: 'ws1',
    createdAt: new Date().toISOString(),
    snapshot: {
      schemaId: 'tripnara.canonical_world_state_snapshot@v1',
      snapshotId: 'ws1',
      tripId: 't1',
      revision: '1',
      createdAt: '',
      weather: [],
      roads: [],
      hazards: [],
      ferries: [],
      poiStates: [],
      travelMatrix: { matrixId: 'm', entries: [] },
      completeness: {
        roads: 'COMPLETE',
        weather: 'COMPLETE',
        hazards: 'COMPLETE',
        ferries: 'COMPLETE',
        openingHours: 'MISSING',
      },
      sourceVersions: [],
    },
    profile: {
      phase: 'PLANNING',
      poiCount: 2,
      dayCount: 1,
      memberCount: 2,
      enabledObjectiveCount: 9,
      dataCompleteness: 1,
    },
    objectiveProfile: {
      registryVersion: 'objectives@v1',
      enabledObjectives: ['daily_driving_load', 'interest_match'],
    },
    candidates,
    constraintReport: reports.balanced,
    constraintReportsByCandidateId: reports,
    mandatoryEvaluations: [],
    objectiveRegistryVersion: 'objectives@v1',
    constraintPolicyVersion: 'constraint-policy@v1',
  };

  it('classifies different winner with explainability', () => {
    const event = buildOptimizationShadowEvent({
      tripId: 't1',
      decisionRunId: 'run1',
      runtimeMode: 'SHADOW',
      problem,
      candidates,
      constraintReports: reports,
      authoritySelectedId: 'balanced',
      shadowOptimizationResult: {
        schemaId: 'tripnara.optimization_result@v1',
        problemId: 'p1',
        tripId: 't1',
        snapshotId: 'ws1',
        feasibilityStatus: 'FEASIBLE',
        terminationReason: 'OPTIMAL',
        hasIncumbent: true,
        candidates,
        recommendedCandidateId: 'conservative',
        constraintReport: reports.conservative,
        optimizationTrace: { traceId: 'tr', steps: [] },
        solverMetadata: {
          strategyId: 'cp-sat-lexicographic',
          strategyVersion: '0.1.0-lab',
          elapsedMs: 5,
        },
        explanation: { schemaId: 'tripnara.structured_explanation@v1', summary: 'ok' },
      },
    });

    expect(event.divergence.diverged).toBe(true);
    expect(event.divergence.types).toContain('DIFFERENT_WINNER');
    expect(event.divergence.explainability.length).toBeGreaterThan(0);
    expect(event.inputFingerprint.candidateSetHash).toBeTruthy();
    expect(event.inputConsistent).toBe(true);
  });

  it('records shadow error type', () => {
    const event = buildOptimizationShadowEvent({
      tripId: 't1',
      decisionRunId: 'run1',
      runtimeMode: 'SHADOW',
      problem,
      candidates,
      constraintReports: reports,
      authoritySelectedId: 'balanced',
      shadowError: 'timeout',
    });

    expect(event.divergence.types).toContain('SHADOW_ERROR');
    expect(event.divergence.severity).toBe('HIGH');
  });
});
