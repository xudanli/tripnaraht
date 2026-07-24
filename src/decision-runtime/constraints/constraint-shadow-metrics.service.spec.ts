import { ConstraintShadowMetricsService } from './constraint-shadow-metrics.service';
import { buildConstraintEvaluationShadowComparison } from './constraint-evaluation-shadow-compare.util';
import type { CanonicalConstraintReport } from './contracts/canonical-constraint-report';

function report(status: CanonicalConstraintReport['overallStatus']): CanonicalConstraintReport {
  return {
    schemaId: 'tripnara.canonical_constraint_report@v1',
    tripId: 't1',
    evaluatedAt: new Date().toISOString(),
    assertions:
      status === 'FEASIBLE'
        ? []
        : [
            {
              assertionId: 'a1',
              constraintType: 'ROAD',
              status: 'BLOCK',
              severity: 'HARD',
              scope: { tripId: 't1' },
              reasonCode: 'ROAD_CLOSED',
              evidenceRefs: [],
              message: 'blocked',
              evaluator: { engine: 'test', version: '0' },
            },
          ],
    completeness: {
      roads: 'MISSING',
      weather: 'MISSING',
      hazards: 'MISSING',
      ferries: 'MISSING',
      openingHours: 'MISSING',
    },
    overallStatus: status,
    degraded: false,
    degradedReasons: [],
  };
}

describe('ConstraintShadowMetricsService', () => {
  it('tracks aligned and diverged comparisons', () => {
    const svc = new ConstraintShadowMetricsService();
    svc.recordComparison(
      buildConstraintEvaluationShadowComparison({
        legacyFeasible: true,
        canonicalReport: report('FEASIBLE'),
      }),
    );
    svc.recordComparison(
      buildConstraintEvaluationShadowComparison({
        legacyFeasible: true,
        canonicalReport: report('INFEASIBLE'),
      }),
    );

    const snap = svc.snapshot();
    expect(snap.comparedTotal).toBe(2);
    expect(snap.divergedTotal).toBe(1);
    expect(snap.byDivergenceKind.LEGACY_PASS_CANONICAL_BLOCK).toBe(1);
  });
});
