import { OptimizationShadowMetricsCollector } from './optimization-shadow-metrics.collector';
import { buildOptimizationShadowEvent } from './shadow-divergence-builder.util';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { OptimizationProblem } from '../contracts/optimization-problem';

describe('OptimizationShadowMetricsCollector', () => {
  it('aggregates dashboard metrics from events', () => {
    const collector = new OptimizationShadowMetricsCollector();
    const candidates: DecisionCandidate[] = [
      {
        candidateId: 'a',
        label: 'A',
        source: 'LEGACY_TRIP_PLANNING',
        plan: { version: 'v1', createdAt: '', days: [] },
        utilityHint: 0.9,
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
    };
    const problem = {
      schemaId: 'tripnara.optimization_problem@v1',
      problemId: 'p1',
      tripId: 't1',
      snapshotId: 'ws1',
      createdAt: '',
      snapshot: {} as OptimizationProblem['snapshot'],
      profile: {
        phase: 'PLANNING',
        poiCount: 1,
        dayCount: 1,
        memberCount: 1,
        enabledObjectiveCount: 1,
        dataCompleteness: 1,
      },
      objectiveProfile: { registryVersion: 'objectives@v1', enabledObjectives: [] },
      candidates,
      constraintReport: reports.a,
      constraintReportsByCandidateId: reports,
      mandatoryEvaluations: [],
      objectiveRegistryVersion: 'objectives@v1',
      constraintPolicyVersion: 'constraint-policy@v1',
    } as OptimizationProblem;

    const event = buildOptimizationShadowEvent({
      tripId: 't1',
      decisionRunId: 'r1',
      runtimeMode: 'SHADOW',
      problem,
      candidates,
      constraintReports: reports,
      authoritySelectedId: 'a',
      shadowOptimizationResult: {
        schemaId: 'tripnara.optimization_result@v1',
        problemId: 'p1',
        tripId: 't1',
        snapshotId: 'ws1',
        feasibilityStatus: 'FEASIBLE',
        terminationReason: 'OPTIMAL',
        hasIncumbent: true,
        candidates,
        recommendedCandidateId: 'a',
        constraintReport: reports.a,
        optimizationTrace: { traceId: 't', steps: [] },
        solverMetadata: {
          strategyId: 'cp-sat-lexicographic',
          strategyVersion: '0.1.0',
          elapsedMs: 10,
        },
        explanation: { schemaId: 'tripnara.structured_explanation@v1', summary: 'ok' },
      },
    });

    collector.recordShadowEvent(event);
    const dash = collector.getDashboardSnapshot();
    expect(dash.runtimeHealth.shadow_run_total).toBe(1);
    expect(dash.runtimeHealth.shadow_success_rate).toBe(1);
    expect(dash.divergence.by_type.SAME_WINNER).toBe(1);
  });
});
