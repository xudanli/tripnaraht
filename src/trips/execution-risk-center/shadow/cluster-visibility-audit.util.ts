/**
 * Audit which clusters become user-visible cards vs suppressed — cutover safety check.
 */

import type { ActiveRisk } from '../types/execution-risk.types';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import type { AggregatedExecutionAlertRisk } from '../utils/execution-alerts-aggregation.util';
import type {
  ClusterSuppressionReason,
  ClusterVisibilityAuditEntry,
  ClusterVisibilityComparison,
} from './cluster-visibility-audit.types';
import { classifyClusterSuppression } from './cluster-suppression-classifier.util';

const EMPTY_REASON_COUNTS = (): Record<ClusterSuppressionReason, number> => ({
  DERIVED_ONLY: 0,
  INFORMATIONAL_ONLY: 0,
  DUPLICATE_DECISION: 0,
  NO_USER_ACTION_REQUIRED: 0,
  RESOLVED: 0,
  UNKNOWN: 0,
});

function visiblePrimaryRiskIds(listAlerts: AggregatedExecutionAlertRisk[]): Set<string> {
  return new Set(
    listAlerts
      .filter((e) => e.role === 'PRIMARY' || e.role === 'INDEPENDENT')
      .map((e) => e.risk.id),
  );
}

function isHighSeverity(severity: ExecutionRiskCluster['severity']): boolean {
  return severity === 'STOP' || severity === 'REPLAN_REQUIRED';
}

export function buildClusterVisibilityComparison(input: {
  clusters: ExecutionRiskCluster[];
  listAlerts: AggregatedExecutionAlertRisk[];
  risks: ActiveRisk[];
}): ClusterVisibilityComparison {
  const visibleIds = visiblePrimaryRiskIds(input.listAlerts);
  const visibleClusters = input.clusters.filter((c) => visibleIds.has(c.primaryRiskId));
  const visibleDecisionProblemIds = new Set(
    visibleClusters.map((c) => c.decisionProblemId).filter(Boolean) as string[],
  );

  const suppressedByReason = EMPTY_REASON_COUNTS();
  const audits: ClusterVisibilityAuditEntry[] = [];
  let hiddenHighSeverityCount = 0;
  let hiddenStopCount = 0;
  let unknownSuppressionCount = 0;

  for (const cluster of input.clusters) {
    const primary = input.risks.find((r) => r.id === cluster.primaryRiskId);
    const isVisible = visibleIds.has(cluster.primaryRiskId);

    if (isVisible) {
      audits.push({
        clusterId: cluster.clusterId,
        primaryRiskId: cluster.primaryRiskId,
        severity: cluster.severity,
        visibility: 'VISIBLE',
        requiresUserDecision: cluster.requiresUserDecision,
        title: primary?.title,
      });
      continue;
    }

    const { reason, representedByClusterId } = classifyClusterSuppression({
      cluster,
      risks: input.risks,
      visibleClusters,
      visibleDecisionProblemIds,
    });

    suppressedByReason[reason] += 1;
    if (reason === 'UNKNOWN') unknownSuppressionCount += 1;

    const unrepresentedHighSeverity =
      isHighSeverity(cluster.severity) && !representedByClusterId;
    if (unrepresentedHighSeverity) {
      hiddenHighSeverityCount += 1;
      if (cluster.severity === 'STOP') hiddenStopCount += 1;
    }

    audits.push({
      clusterId: cluster.clusterId,
      primaryRiskId: cluster.primaryRiskId,
      severity: cluster.severity,
      visibility: 'SUPPRESSED',
      suppressionReason: reason,
      representedByClusterId,
      requiresUserDecision: cluster.requiresUserDecision,
      title: primary?.title,
    });
  }

  return {
    totalClusterCount: input.clusters.length,
    visibleClusterCount: visibleClusters.length,
    suppressedClusterCount: input.clusters.length - visibleClusters.length,
    suppressedByReason,
    hiddenHighSeverityCount,
    hiddenStopCount,
    unknownSuppressionCount,
    audits,
  };
}
