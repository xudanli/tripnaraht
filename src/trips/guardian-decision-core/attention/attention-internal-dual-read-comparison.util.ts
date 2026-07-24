/**
 * Slice 4 Internal Dual-Read — legacy queue vs Attention Primary projection comparison.
 */

import type {
  AttentionInternalDualReadComparison,
  AttentionOrchestrationProblemInput,
  RootCauseCluster,
  UnifiedDecisionItemProjection,
} from '../contracts/attention-orchestration.types';

export function buildAttentionInternalDualReadComparison(input: {
  currentQueueItems: Array<{ problemId: string }>;
  attentionPrimaryItems: UnifiedDecisionItemProjection[];
  shadowClusters: RootCauseCluster[];
  inputProblems: AttentionOrchestrationProblemInput[];
}): AttentionInternalDualReadComparison {
  const currentVisibleCount = input.currentQueueItems.length;
  const attentionVisibleCount = input.attentionPrimaryItems.length;
  const reductionCount = Math.max(0, currentVisibleCount - attentionVisibleCount);

  const primaryProblemIds = input.attentionPrimaryItems.map((item) => item.primaryProblemId);

  const relatedByPrimary = new Set(
    input.attentionPrimaryItems.flatMap((item) =>
      item.relatedEffects.map((effect) => effect.problemId),
    ),
  );

  const currentIds = new Set(input.currentQueueItems.map((item) => item.problemId));

  const hiddenProblemIds = [...currentIds].filter(
    (problemId) => !primaryProblemIds.includes(problemId) && relatedByPrimary.has(problemId),
  );

  const missedProblemIds = [...currentIds].filter((problemId) => {
    if (primaryProblemIds.includes(problemId)) return false;
    if (relatedByPrimary.has(problemId)) return false;
    const cluster = findClusterForProblem(problemId, input.shadowClusters);
    if (!cluster) return true;
    return !input.attentionPrimaryItems.some((item) => item.clusterId === cluster.clusterId);
  });

  return {
    currentVisibleCount,
    attentionVisibleCount,
    reductionCount,
    hiddenProblemIds,
    primaryProblemIds,
    missedProblemIds,
    openClusterCount: input.shadowClusters.filter((cluster) => cluster.status === 'OPEN').length,
    canonicalProblemCount: input.inputProblems.length,
  };
}

function findClusterForProblem(
  problemId: string,
  clusters: RootCauseCluster[],
): RootCauseCluster | undefined {
  return clusters.find(
    (cluster) =>
      cluster.primaryProblemId === problemId || cluster.relatedProblemIds.includes(problemId),
  );
}
