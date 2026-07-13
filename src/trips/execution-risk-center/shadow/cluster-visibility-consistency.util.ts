import type {
  ClusterVisibilityAuditEntry,
  ClusterVisibilityComparison,
} from './cluster-visibility-audit.types';

export interface ClusterVisibilityConsistencyResult {
  pass: boolean;
  violations: string[];
}

const REQUIRES_REPRESENTATION = new Set(['DERIVED_ONLY', 'DUPLICATE_DECISION']);

export function assertClusterVisibilityConsistency(
  comparison: ClusterVisibilityComparison,
): ClusterVisibilityConsistencyResult {
  const violations: string[] = [];
  const visibleIds = new Set(
    comparison.audits.filter((a) => a.visibility === 'VISIBLE').map((a) => a.clusterId),
  );

  for (const audit of comparison.audits) {
    if (audit.visibility !== 'SUPPRESSED') continue;

    if (!audit.suppressionReason) {
      violations.push(`${audit.clusterId}: SUPPRESSED without suppressionReason`);
      continue;
    }

    if (audit.suppressionReason === 'UNKNOWN') {
      violations.push(`${audit.clusterId}: UNKNOWN suppressionReason not allowed`);
    }

    if (REQUIRES_REPRESENTATION.has(audit.suppressionReason)) {
      if (!audit.representedByClusterId) {
        violations.push(
          `${audit.clusterId}: ${audit.suppressionReason} missing representedByClusterId`,
        );
      } else if (!visibleIds.has(audit.representedByClusterId)) {
        violations.push(
          `${audit.clusterId}: representedByClusterId ${audit.representedByClusterId} is not VISIBLE`,
        );
      }
    }
  }

  for (const audit of comparison.audits) {
    if (!audit.representedByClusterId) continue;
    if (audit.representedByClusterId === audit.clusterId) {
      violations.push(`${audit.clusterId}: self-referencing representedByClusterId`);
    }
  }

  const graph = new Map<string, string>();
  for (const audit of comparison.audits) {
    if (audit.representedByClusterId) {
      graph.set(audit.clusterId, audit.representedByClusterId);
    }
  }
  for (const start of graph.keys()) {
    const visited = new Set<string>();
    let cur: string | undefined = start;
    while (cur && graph.has(cur)) {
      if (visited.has(cur)) {
        violations.push(`cycle detected at ${cur}`);
        break;
      }
      visited.add(cur);
      cur = graph.get(cur);
    }
  }

  return { pass: violations.length === 0, violations };
}

export function clusterVisibilityStructureValid(
  cv: ClusterVisibilityComparison | undefined,
): boolean {
  if (!cv) return false;
  if (
    typeof cv.totalClusterCount !== 'number' ||
    typeof cv.visibleClusterCount !== 'number' ||
    typeof cv.suppressedClusterCount !== 'number' ||
    typeof cv.hiddenStopCount !== 'number' ||
    typeof cv.hiddenHighSeverityCount !== 'number' ||
    typeof cv.unknownSuppressionCount !== 'number' ||
    !Array.isArray(cv.audits)
  ) {
    return false;
  }
  return true;
}
