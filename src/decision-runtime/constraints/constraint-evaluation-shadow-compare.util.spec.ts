import { buildConstraintEvaluationShadowComparison } from './constraint-evaluation-shadow-compare.util';
import type { CanonicalConstraintReport } from './contracts/canonical-constraint-report';

function report(overallStatus: CanonicalConstraintReport['overallStatus']): CanonicalConstraintReport {
  return {
    schemaId: 'tripnara.canonical_constraint_report@v1',
    tripId: 't1',
    evaluatedAt: new Date().toISOString(),
    assertions:
      overallStatus === 'FEASIBLE'
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
    overallStatus,
    degraded: false,
    degradedReasons: [],
  };
}

describe('constraint-evaluation-shadow-compare', () => {
  it('marks aligned when legacy and canonical agree', () => {
    const cmp = buildConstraintEvaluationShadowComparison({
      legacyFeasible: true,
      canonicalReport: report('FEASIBLE'),
    });
    expect(cmp.diverged).toBe(false);
    expect(cmp.divergenceKind).toBe('ALIGNED');
  });

  it('detects legacy pass vs canonical block', () => {
    const cmp = buildConstraintEvaluationShadowComparison({
      legacyFeasible: true,
      canonicalReport: report('INFEASIBLE'),
    });
    expect(cmp.diverged).toBe(true);
    expect(cmp.divergenceKind).toBe('LEGACY_PASS_CANONICAL_BLOCK');
  });
});
