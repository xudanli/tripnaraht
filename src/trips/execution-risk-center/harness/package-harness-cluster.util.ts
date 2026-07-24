import type { ActiveRisk } from '../types/execution-risk.types';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import { buildClusterFromRisks } from '../utils/execution-risk-cluster.util';
import type { PackageHarnessScenario } from './package-harness.types';

/**
 * Build clusters from package harness expectations — supports multiple independent
 * primaries (e.g. SH-SCHED-005) that production single-primary aggregation cannot represent.
 */
export function buildHarnessExecutionRiskClusters(
  scenario: PackageHarnessScenario,
  active: ActiveRisk[],
): ExecutionRiskCluster[] {
  const clusters: ExecutionRiskCluster[] = [];
  const usedPrimaryIds = new Set<string>();

  for (const expected of scenario.expected.clusters ?? []) {
    const primaryCandidates = active.filter(
      (r) => r.knowledgeCode === expected.primaryKnowledgeCode,
    );
    const primary =
      primaryCandidates.find((r) => r.isRootCause !== false) ?? primaryCandidates[0];
    if (!primary || usedPrimaryIds.has(primary.id)) continue;
    usedPrimaryIds.add(primary.id);

    const related: ActiveRisk[] = [primary];
    for (const memberCode of expected.memberRiskCodes ?? []) {
      if (memberCode === expected.primaryKnowledgeCode) {
        for (const dup of active.filter(
          (r) => r.knowledgeCode === memberCode && r.id !== primary.id,
        )) {
          if (!related.some((r) => r.id === dup.id)) related.push(dup);
        }
        continue;
      }
      for (const member of active.filter((r) => r.knowledgeCode === memberCode)) {
        if (!related.some((r) => r.id === member.id)) related.push(member);
      }
    }

    clusters.push(buildClusterFromRisks(primary, related));
  }

  return clusters;
}

/** Scenarios like SH-SCHED-001 may have plans but no expected clusters. */
export function buildSyntheticHarnessCluster(
  scenario: PackageHarnessScenario,
  active: ActiveRisk[],
): ExecutionRiskCluster | null {
  const primaryCode = scenario.expected.activeRisks[0]?.knowledgeCode;
  const primary =
    active.find((r) => r.knowledgeCode === primaryCode) ??
    active.find((r) => r.isRootCause !== false) ??
    active[0];
  if (!primary) return null;

  return buildClusterFromRisks(primary, [primary]);
}
