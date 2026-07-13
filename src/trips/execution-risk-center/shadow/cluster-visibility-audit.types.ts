import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';

export type ClusterSuppressionReason =
  | 'DERIVED_ONLY'
  | 'INFORMATIONAL_ONLY'
  | 'DUPLICATE_DECISION'
  | 'NO_USER_ACTION_REQUIRED'
  | 'RESOLVED'
  | 'UNKNOWN';

export type ClusterVisibilityStatus = 'VISIBLE' | 'SUPPRESSED';

export interface ClusterVisibilityAuditEntry {
  clusterId: string;
  primaryRiskId: string;
  severity: ExecutionRiskCluster['severity'];
  visibility: ClusterVisibilityStatus;
  suppressionReason?: ClusterSuppressionReason;
  representedByClusterId?: string;
  requiresUserDecision: boolean;
  title?: string;
}

export interface ClusterVisibilityComparison {
  totalClusterCount: number;
  visibleClusterCount: number;
  suppressedClusterCount: number;
  suppressedByReason: Record<ClusterSuppressionReason, number>;
  hiddenHighSeverityCount: number;
  hiddenStopCount: number;
  unknownSuppressionCount: number;
  audits: ClusterVisibilityAuditEntry[];
}
