import {
  assertClusterVisibilityConsistency,
  clusterVisibilityStructureValid,
} from './cluster-visibility-consistency.util';
import type { ClusterVisibilityComparison } from './cluster-visibility-audit.types';

function cv(partial: Partial<ClusterVisibilityComparison>): ClusterVisibilityComparison {
  return {
    totalClusterCount: 2,
    visibleClusterCount: 1,
    suppressedClusterCount: 1,
    suppressedByReason: {
      DERIVED_ONLY: 1,
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
    ...partial,
  };
}

describe('cluster-visibility-consistency', () => {
  it('validates structure', () => {
    expect(clusterVisibilityStructureValid(cv({ audits: [] }))).toBe(true);
    expect(clusterVisibilityStructureValid(undefined)).toBe(false);
  });

  it('requires suppressionReason for SUPPRESSED clusters', () => {
    const result = assertClusterVisibilityConsistency(
      cv({
        audits: [{ clusterId: 'c1', primaryRiskId: 'r1', visibility: 'SUPPRESSED', severity: 'HIGH', requiresUserDecision: false }],
      }),
    );
    expect(result.pass).toBe(false);
    expect(result.violations[0]).toContain('suppressionReason');
  });

  it('requires representedByClusterId for DERIVED_ONLY', () => {
    const result = assertClusterVisibilityConsistency(
      cv({
        audits: [
          { clusterId: 'visible', primaryRiskId: 'r1', visibility: 'VISIBLE', severity: 'STOP', requiresUserDecision: true },
          {
            clusterId: 'derived',
            primaryRiskId: 'r2',
            visibility: 'SUPPRESSED',
            severity: 'HIGH',
            suppressionReason: 'DERIVED_ONLY',
            requiresUserDecision: false,
          },
        ],
      }),
    );
    expect(result.pass).toBe(false);
    expect(result.violations[0]).toContain('representedByClusterId');
  });

  it('passes when SUPPRESSED cluster points to VISIBLE cluster', () => {
    const result = assertClusterVisibilityConsistency(
      cv({
        audits: [
          { clusterId: 'cluster_strong_wind', primaryRiskId: 'r1', visibility: 'VISIBLE', severity: 'STOP', requiresUserDecision: true },
          {
            clusterId: 'cluster_booking_risk',
            primaryRiskId: 'r2',
            visibility: 'SUPPRESSED',
            severity: 'HIGH',
            suppressionReason: 'DERIVED_ONLY',
            representedByClusterId: 'cluster_strong_wind',
            requiresUserDecision: false,
          },
        ],
      }),
    );
    expect(result.pass).toBe(true);
  });
});
