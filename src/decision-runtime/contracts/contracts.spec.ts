import type { OptimizationResult } from './optimization-result';
import type { OptimizationProblem } from './optimization-problem';
import { DECISION_CANDIDATE_SCHEMA_ID } from './decision-candidate';

describe('decision-runtime contracts', () => {
  it('exports stable schema ids', () => {
    expect(DECISION_CANDIDATE_SCHEMA_ID).toBe('tripnara.decision_candidate@v1');
  });

  it('exports decision run request schema id', async () => {
    const { DECISION_RUN_REQUEST_SCHEMA_ID } = await import('./decision-run-request');
    expect(DECISION_RUN_REQUEST_SCHEMA_ID).toBe('tripnara.decision_run_request@v1');
  });

  it('allows TIME_LIMIT with incumbent as FEASIBLE', () => {
    const result: OptimizationResult = {
      schemaId: 'tripnara.optimization_result@v1',
      problemId: 'p1',
      tripId: 't1',
      snapshotId: 'ws1',
      feasibilityStatus: 'FEASIBLE',
      terminationReason: 'TIME_LIMIT',
      hasIncumbent: true,
      candidates: [],
      constraintReport: {
        schemaId: 'tripnara.canonical_constraint_report@v1',
        tripId: 't1',
        evaluatedAt: new Date().toISOString(),
        assertions: [],
        completeness: {
          roads: 'MISSING',
          weather: 'MISSING',
          hazards: 'MISSING',
          ferries: 'MISSING',
          openingHours: 'MISSING',
        },
        overallStatus: 'UNVERIFIED',
        degraded: false,
        degradedReasons: [],
      },
      optimizationTrace: { traceId: 'tr1', steps: [] },
      solverMetadata: {
        strategyId: 'legacy-frozen',
        strategyVersion: '0.1.0',
        elapsedMs: 100,
      },
      explanation: {
        schemaId: 'tripnara.structured_explanation@v1',
        summary: 'ok',
      },
    };
    expect(result.feasibilityStatus).toBe('FEASIBLE');
    expect(result.terminationReason).toBe('TIME_LIMIT');
  });

  it('types OptimizationProblem with mandatory evaluations', () => {
    const problem: OptimizationProblem = {
      schemaId: 'tripnara.optimization_problem@v1',
      problemId: 'prob1',
      tripId: 't1',
      snapshotId: 'ws1',
      createdAt: new Date().toISOString(),
      snapshot: {
        schemaId: 'tripnara.canonical_world_state_snapshot@v1',
        snapshotId: 'ws1',
        tripId: 't1',
        revision: '1',
        createdAt: new Date().toISOString(),
        weather: [],
        roads: [],
        hazards: [],
        ferries: [],
        poiStates: [],
        travelMatrix: { matrixId: 'm1', entries: [] },
        completeness: {
          roads: 'MISSING',
          weather: 'MISSING',
          hazards: 'MISSING',
          ferries: 'MISSING',
          openingHours: 'MISSING',
        },
        sourceVersions: [],
      },
      profile: {
        phase: 'PLANNING',
        poiCount: 5,
        dayCount: 3,
        memberCount: 2,
        enabledObjectiveCount: 8,
        dataCompleteness: 0.5,
      },
      objectiveProfile: {
        registryVersion: 'objectives@v1',
        enabledObjectives: ['daily_driving_load'],
      },
      candidates: [],
      constraintReport: {
        schemaId: 'tripnara.canonical_constraint_report@v1',
        tripId: 't1',
        evaluatedAt: new Date().toISOString(),
        assertions: [],
        completeness: {
          roads: 'MISSING',
          weather: 'MISSING',
          hazards: 'MISSING',
          ferries: 'MISSING',
          openingHours: 'MISSING',
        },
        overallStatus: 'UNVERIFIED',
        degraded: false,
        degradedReasons: [],
      },
      mandatoryEvaluations: [],
      objectiveRegistryVersion: 'objectives@v1',
      constraintPolicyVersion: 'policy@v1',
    };
    expect(problem.snapshotId).toBe('ws1');
  });
});
