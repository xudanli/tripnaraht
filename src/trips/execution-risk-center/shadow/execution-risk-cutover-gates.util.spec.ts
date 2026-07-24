import { buildCutoverGoNoGoReport } from './execution-risk-cutover-gates.util';
import type { ExecutionRiskShadowComparison } from './execution-risk-shadow-compare.types';

function comparison(partial: Partial<ExecutionRiskShadowComparison>): ExecutionRiskShadowComparison {
  return {
    schemaId: 'tripnara.execution_risk_shadow_comparison@v2',
    tripId: 'trip-1',
    comparedAt: new Date().toISOString(),
    diverged: false,
    divergenceKind: 'ALIGNED',
    divergenceKinds: ['ALIGNED'],
    legacy: { alertCount: 1, fingerprintIds: [], sourceKeys: [] },
    canonical: { alertCount: 1, fingerprintIds: [], sourceKeys: [] },
    rawRiskComparison: {
      legacyCount: 1,
      canonicalCount: 1,
      directRiskCount: 1,
      derivedRiskCount: 0,
      rootCauseCount: 1,
      unmappedRiskCount: 0,
      overlapRate: 1,
    },
    clusterComparison: {
      legacyIssueCount: 1,
      canonicalClusterCount: 1,
      canonicalIndependentCount: 0,
      duplicateClusterCount: 0,
      primaryRiskAgreement: true,
      unmatchedRootCauses: [],
      clusterSemanticAgreementRate: 1,
    },
    semanticComparison: {
      legacyVisibleCardCount: 1,
      canonicalVisibleCardCount: 1,
      legacyAdjustmentItemCount: 1,
      canonicalAdjustmentItemCount: 1,
      severityMismatchCount: 0,
      requiredActionMismatchCount: 0,
      primaryRiskMismatchCount: 0,
      visibleCardCountMismatch: false,
    duplicateVisibleItemCount: 0,
    clusterVisibility: {
      totalClusterCount: 1,
      visibleClusterCount: 1,
      suppressedClusterCount: 0,
      suppressedByReason: {
        DERIVED_ONLY: 0,
        INFORMATIONAL_ONLY: 0,
        DUPLICATE_DECISION: 0,
        NO_USER_ACTION_REQUIRED: 0,
        RESOLVED: 0,
        UNKNOWN: 0,
      },
      hiddenHighSeverityCount: 0,
      hiddenStopCount: 0,
      unknownSuppressionCount: 0,
      audits: [],
    },
  },
    metrics: {
      sourceKeyOverlapRate: 1,
      levelAgreement: true,
      primaryAgreement: true,
      countDelta: 0,
      unknownKnowledgeCodeCount: 0,
      rootCauseRecallRate: 1,
      highPriorityRecallRate: 1,
      stopMissCount: 0,
    },
    ...partial,
  };
}

describe('buildCutoverGoNoGoReport', () => {
  it('returns GO when critical gates pass', () => {
    const report = buildCutoverGoNoGoReport({
      tripId: 'trip-1',
      comparison: comparison({}),
    });
    expect(report.recommendation).toBe('GO');
    expect(report.pass).toBe(true);
    expect(report.productionStatus).toBe('NOT_YET_CUTOVER');
  });

  it('returns NO_GO when STOP is missed', () => {
    const report = buildCutoverGoNoGoReport({
      tripId: 'trip-1',
      comparison: comparison({
        diverged: true,
        divergenceKind: 'SEVERITY_MISMATCH',
        divergenceKinds: ['SEVERITY_MISMATCH'],
        metrics: {
          sourceKeyOverlapRate: 0.5,
          levelAgreement: false,
          primaryAgreement: false,
          countDelta: 1,
          unknownKnowledgeCodeCount: 0,
          rootCauseRecallRate: 0.5,
          highPriorityRecallRate: 0.5,
          stopMissCount: 1,
        },
      }),
    });
    expect(report.recommendation).toBe('NO_GO');
    expect(report.blockers.some((b) => b.includes('stop-miss-zero'))).toBe(true);
  });
});
