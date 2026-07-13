import type { ActiveRisk } from '../types/execution-risk.types';
import type { ExecutionRiskCluster } from '../types/execution-risk-cluster.types';
import type {
  ExecutionInterventionDto,
  ExecutionInterventionCausalChainDto,
} from '../../../mobile/dto/mobile-execution.types';
import { projectActiveRiskToIntervention } from './active-risk-intervention.adapter';
import { buildClusterHeadline, buildClusterTitle } from '../utils/execution-risk-cluster.util';

export function enrichInterventionWithCluster(
  intervention: ExecutionInterventionDto,
  cluster: ExecutionRiskCluster,
  risks: ActiveRisk[],
): ExecutionInterventionDto {
  const primary = risks.find((r) => r.id === cluster.primaryRiskId);
  const isMergedCluster =
    cluster.relatedRiskIds.length > 1 ||
    cluster.suppressedDecisionCount > 0 ||
    (cluster.consequenceImpacts?.length ?? 0) > 0;
  const clusterTitle =
    isMergedCluster && primary ? buildClusterTitle(primary) : intervention.title;
  const clusterReason =
    isMergedCluster && primary ? buildClusterHeadline(primary) : intervention.reason;

  return {
    ...intervention,
    id: cluster.decisionProblemId ?? intervention.id,
    type: cluster.adjustmentType,
    title: clusterTitle,
    reason: clusterReason,
    clusterId: cluster.clusterId,
    linkedRiskIds: cluster.relatedRiskIds,
    primaryRiskId: cluster.primaryRiskId,
    recommendationId: intervention.recommendationId ?? cluster.recommendationId,
    environmentEventId: intervention.environmentEventId ?? cluster.environmentEventId,
    decisionProblemId: intervention.decisionProblemId ?? cluster.decisionProblemId,
    affectedActivities: mergeUniqueStrings(
      intervention.affectedActivities,
      clusterConsequenceActivityLabels(cluster, risks),
    ),
    affectedMembers: mergeAffectedMembers(intervention.affectedMembers, cluster, risks),
    affectedMembersScope: resolveMembersScope(cluster),
    consequenceImpacts: cluster.consequenceImpacts,
    causalChain: enrichCausalChainWithConsequences(intervention.causalChain, cluster, primary),
  };
}

export function projectClusterToIntervention(
  cluster: ExecutionRiskCluster,
  risks: ActiveRisk[],
  tripId: string,
  actionDeadline?: string,
): ExecutionInterventionDto | null {
  const primary = risks.find((r) => r.id === cluster.primaryRiskId);
  if (!primary) return null;

  const base = projectActiveRiskToIntervention(primary, tripId, actionDeadline);
  if (!base) return null;

  return enrichInterventionWithCluster(
    {
      ...base,
      id: cluster.decisionProblemId ?? `intervention-cluster-${cluster.clusterId}`,
    },
    cluster,
    risks,
  );
}

function clusterConsequenceActivityLabels(
  cluster: ExecutionRiskCluster,
  risks: ActiveRisk[],
): string[] {
  const labels: string[] = [];
  for (const id of cluster.affectedActivityIds) {
    for (const risk of risks) {
      const act = risk.affectedActivities.find((a) => a.id === id);
      if (act) labels.push(act.label);
    }
  }
  return [...new Set(labels)];
}

function mergeAffectedMembers(
  existing: string[],
  cluster: ExecutionRiskCluster,
  risks: ActiveRisk[],
): string[] {
  if (existing.length > 0) return existing;
  const labels: string[] = [];
  for (const id of cluster.affectedMemberIds) {
    for (const risk of risks) {
      const member = risk.affectedMembers.find((m) => m.id === id);
      if (member) labels.push(member.label);
    }
  }
  return [...new Set(labels)];
}

function resolveMembersScope(
  cluster: ExecutionRiskCluster,
): 'ALL_MEMBERS' | 'FOCUSED' | undefined {
  if (cluster.affectedMemberIds.length === 0) return undefined;
  if (cluster.adjustmentType === 'TEAM_COORDINATION') return 'FOCUSED';
  if (cluster.consequenceCodes.some((c) => c.startsWith('MEMBER_'))) return 'FOCUSED';
  return 'ALL_MEMBERS';
}

function enrichCausalChainWithConsequences(
  chain: ExecutionInterventionCausalChainDto,
  cluster: ExecutionRiskCluster,
  primary?: ActiveRisk,
): ExecutionInterventionCausalChainDto {
  const impactNodes = cluster.consequenceImpacts.map((imp, idx) => ({
    nodeId: `cluster_impact_${idx}`,
    type: 'IMPACT' as const,
    title: '影响',
    description: imp.label,
    sourceRefs: imp.sourceRiskId ? [imp.sourceRiskId] : undefined,
  }));

  if (impactNodes.length === 0) return chain;

  const worldNode = chain.nodes.find((n) => n.type === 'WORLD_CHANGE');
  const optionNode = chain.nodes.find((n) => n.type === 'OPTION');
  const conflictNode = chain.nodes.find((n) => n.type === 'CONFLICT') ?? {
    nodeId: 'cluster_conflict',
    type: 'CONFLICT' as const,
    title: '决策冲突',
    description: '需要确认后再继续当前安排',
  };

  return {
    ...chain,
    headline: primary ? buildClusterTitle(primary) : chain.headline,
    assessment: primary ? buildClusterHeadline(primary) : chain.assessment,
    nodes: [
      ...(worldNode ? [worldNode] : []),
      ...impactNodes,
      conflictNode,
      ...(optionNode ? [optionNode] : []),
    ],
  };
}

function mergeUniqueStrings(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
