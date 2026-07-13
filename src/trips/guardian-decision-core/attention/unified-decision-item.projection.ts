/**
 * Unified Decision Item projection — user-visible SSOT scaffold.
 */

import type {
  AttentionOrchestrationProblemInput,
  CausalNode,
  RootCauseCluster,
  UnifiedDecisionItemProjection,
} from '../contracts/attention-orchestration.types';
import { isQueueVisible } from './attention-admission.util';
import { selectPrimaryProblem } from './primary-problem-selector.util';
import {
  semanticCapabilityToWindChainCode,
  WIND_CAUSAL_CHAIN_LABELS,
} from './wind-causal-chain.rules';

function buildCausalStory(
  cluster: RootCauseCluster,
  problems: AttentionOrchestrationProblemInput[],
): CausalNode[] {
  if (cluster.causalChain.length > 0) {
    return [...cluster.causalChain].sort((a, b) => a.order - b.order);
  }

  const nodes: CausalNode[] = [];
  let order = 0;
  for (const problem of problems) {
    const code = semanticCapabilityToWindChainCode(problem.semanticCapability);
    if (!code) continue;
    nodes.push({
      code,
      label: WIND_CAUSAL_CHAIN_LABELS[code],
      problemId: problem.problemId,
      order: order++,
    });
  }
  return nodes;
}

function buildHeadline(
  cluster: RootCauseCluster,
  primary: AttentionOrchestrationProblemInput,
): string {
  if (primary.headline) return primary.headline;
  if (cluster.rootCauseType === 'WEATHER_STRONG_WIND') {
    return '强风导致今天的原计划无法按时完成';
  }
  return primary.semanticCapability;
}

function buildExplanation(
  primary: AttentionOrchestrationProblemInput,
  related: AttentionOrchestrationProblemInput[],
): string {
  if (primary.explanation) return primary.explanation;

  const parts: string[] = [];
  if (related.some((p) => p.semanticCapability === 'ACTIVITY_WINDOW_MISSED')) {
    parts.push('预计到达下一活动时间已超过最晚入场时间');
  }
  if (related.some((p) => p.semanticCapability === 'NIGHT_DRIVING_RISK')) {
    parts.push('绕行还会导致夜间驾驶');
  }
  if (parts.length === 0 && primary.semanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE') {
    parts.push('后续行程可能赶不上，请查看调整建议');
  }
  return parts.join('；') || primary.semanticCapability;
}

function relatedEffectLabel(problem: AttentionOrchestrationProblemInput): string {
  const code = semanticCapabilityToWindChainCode(problem.semanticCapability);
  if (code) return WIND_CAUSAL_CHAIN_LABELS[code];
  return problem.semanticCapability;
}

export function projectUnifiedDecisionItem(input: {
  cluster: RootCauseCluster;
  problems: AttentionOrchestrationProblemInput[];
}): UnifiedDecisionItemProjection | null {
  const { cluster, problems } = input;
  if (!isQueueVisible(cluster.attentionLevel)) {
    return null;
  }
  if (cluster.status === 'RESOLVED') {
    return null;
  }

  const primary = selectPrimaryProblem(problems);
  if (!primary) return null;

  const related = problems.filter((p) => p.problemId !== primary.problemId);

  return {
    clusterId: cluster.clusterId,
    tripId: cluster.tripId,
    primaryProblemId: primary.problemId,
    primarySemanticCapability: primary.semanticCapability,
    headline: buildHeadline(cluster, primary),
    explanation: buildExplanation(primary, related),
    causalStory: buildCausalStory(cluster, problems),
    attentionLevel: cluster.attentionLevel,
    status: cluster.status,
    relatedEffects: related.map((p) => ({
      problemId: p.problemId,
      semanticCapability: p.semanticCapability,
      label: relatedEffectLabel(p),
    })),
    confirmationEntry: {
      problemId: primary.problemId,
      actionRoute: 'decision-queue',
    },
    firstObservedAt: cluster.firstObservedAt,
    lastUpdatedAt: cluster.lastUpdatedAt,
  };
}

export function listVisiblePrimaryItems(input: {
  clusters: RootCauseCluster[];
  problemsById: Map<string, AttentionOrchestrationProblemInput>;
}): UnifiedDecisionItemProjection[] {
  const items: UnifiedDecisionItemProjection[] = [];
  for (const cluster of input.clusters) {
    const problems = cluster.relatedProblemIds
      .concat(cluster.primaryProblemId)
      .filter((id, idx, arr) => arr.indexOf(id) === idx)
      .map((id) => input.problemsById.get(id))
      .filter((p): p is AttentionOrchestrationProblemInput => Boolean(p));

    const projected = projectUnifiedDecisionItem({ cluster, problems });
    if (projected) items.push(projected);
  }
  return items;
}
