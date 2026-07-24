import { OrToolsShadowMetricsCollector } from './ortools-shadow-metrics.collector';
import type { OrtToolsEvaluateShadowAttachment } from '../bridge/ortools-road-evaluate-shadow.bridge';

describe('OrToolsShadowMetricsCollector', () => {
  it('aggregates Neptune vs OR-Tools shadow runs', () => {
    const collector = new OrToolsShadowMetricsCollector();
    const sample: OrtToolsEvaluateShadowAttachment = {
      schemaId: 'tripnara.ortools_evaluate_shadow@v1',
      report: {
        schemaId: 'tripnara.ortools_repair_shadow@v1',
        tripId: 't1',
        requestId: 'r1',
        comparedAt: new Date().toISOString(),
        authorityProviderId: 'neptune-repair',
        shadowProviderId: 'ortools-repair',
        authorityProposalCount: 3,
        shadowProposalCount: 2,
        shadowFoundCandidate: true,
        shadowNativeCpSat: false,
        forbiddenEdgeViolations: 0,
        bookedNodeDropped: false,
        undeclaredNodeDrops: false,
        writeAttempted: false,
        gatewayRequired: true,
        notes: [],
      },
      gatewayByCandidateId: {
        c1: {
          candidateId: 'c1',
          overallStatus: 'PASS',
          degraded: false,
          assertionCount: 1,
        },
      },
      neptuneCandidateCount: 3,
      shadowCandidateCount: 2,
      shadowAuthority: false,
      shadowRepairCandidates: [],
    };

    collector.recordEvaluateShadow(sample);
    const snap = collector.snapshot();
    expect(snap.runsTotal).toBe(1);
    expect(snap.solverSolvedTotal).toBe(1);
    expect(snap.neptuneCandidateSum).toBe(3);
    expect(snap.shadowCandidateSum).toBe(2);
    expect(snap.gatewayPassTotal).toBe(1);
    expect(snap.writeAttemptedTotal).toBe(0);
    expect(snap.planningLabCompareTotal).toBe(0);
    expect(snap.planningLabMeanAgreement).toBeNull();
  });
});
