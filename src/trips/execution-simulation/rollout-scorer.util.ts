/**
 * Aggregate physical + organizational robustness scores, timeline, bottlenecks, contingencies.
 */

import { cloneExecutionIR } from './apply-perturbation';
import type { ExecutionSimulationRunResult } from './execution-simulation.types';
import type {
  ContingencyPlan,
  RobustnessBottleneck,
  RobustnessRolloutResult,
  RobustnessSampleSummary,
  RolloutNodeContext,
  RolloutTimelineNode,
} from './robustness-rollout.types';
import { ORGANIZATIONAL_STRESS_THRESHOLD } from '../causal-physics/social-stress-engine';

const FAILURE_WEIGHT = 1000;

export interface PerSampleSocialTrace {
  variantId: string;
  nodeStress: Array<{ nodeId: string; socialStress: number }>;
  peakSocialStress: number;
  organizationalPass: boolean;
  perturbationTags: string[];
}

export interface PhysicalSampleOutcome {
  variantId: string;
  run: ExecutionSimulationRunResult;
  physicalPass: boolean;
  perturbationTags: string[];
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function physicalPassForRun(run: ExecutionSimulationRunResult, baselineCost: number): boolean {
  if (run.irRun.failures.length > 0) return false;
  const overrun = run.irRun.pathCost - baselineCost;
  return overrun <= baselineCost * 0.45 + 120;
}

export function aggregateRobustnessRollout(input: {
  nodeContexts: RolloutNodeContext[];
  physicalOutcomes: PhysicalSampleOutcome[];
  socialTraces: PerSampleSocialTrace[];
  baseIR: import('../execution-ir/execution-ir.types').ExecutionIR;
  organizationalStressThreshold?: number;
}): RobustnessRolloutResult {
  const threshold = input.organizationalStressThreshold ?? ORGANIZATIONAL_STRESS_THRESHOLD;
  const n = input.physicalOutcomes.length;
  if (!n) {
    return {
      physicalRobustnessScore: 0,
      organizationalRobustnessScore: 0,
      bottlenecks: [],
      timeline: [],
      contingencyPlans: [],
      sampleSummaries: [],
    };
  }

  const baselineCost = Math.min(...input.physicalOutcomes.map(o => o.run.irRun.pathCost));

  const sampleSummaries: RobustnessSampleSummary[] = input.physicalOutcomes.map((po, idx) => {
    const social = input.socialTraces[idx];
    const physicalPass = physicalPassForRun(po.run, baselineCost);
    const orgPass = social ? social.peakSocialStress < threshold : true;
    return {
      variantId: po.variantId,
      physicalPass,
      organizationalPass: orgPass,
      peakSocialStress: social?.peakSocialStress ?? 0,
      pathCost: po.run.irRun.pathCost,
      failureCount: po.run.irRun.failures.length,
      perturbationTags: po.perturbationTags,
    };
  });

  const physicalRobustnessScore = clamp01(
    sampleSummaries.filter(s => s.physicalPass).length / n,
  );
  const organizationalRobustnessScore = clamp01(
    sampleSummaries.filter(s => s.organizationalPass).length / n,
  );

  const timeline: RolloutTimelineNode[] = input.nodeContexts.map(ctx => {
    let physicsPassCount = 0;
    let stressSum = 0;
    const perturbationSet = new Set<string>();

    for (let i = 0; i < n; i++) {
      const summary = sampleSummaries[i];
      if (summary.physicalPass) physicsPassCount += 1;
      const social = input.socialTraces[i];
      const nodeEntry = social?.nodeStress.find(ns => ns.nodeId === ctx.nodeId);
      stressSum += nodeEntry?.socialStress ?? 0;
      summary.perturbationTags.forEach(t => perturbationSet.add(t));
    }

    const physicsRobustness = physicsPassCount / n;
    const socialStressIndex = stressSum / n;
    const baseUtility = clamp01(1 - socialStressIndex * 0.4 - (1 - physicsRobustness) * 0.3);

    return {
      timestamp: ctx.date,
      nodeId: ctx.nodeId,
      baseUtility,
      physicsRobustness,
      socialStressIndex,
      activePerturbations: [...perturbationSet],
    };
  });

  const bottlenecks = detectBottlenecks(timeline, input.nodeContexts, threshold);
  const contingencyPlans = buildContingencyPlans(bottlenecks, input.baseIR);

  return {
    physicalRobustnessScore,
    organizationalRobustnessScore,
    bottlenecks,
    timeline,
    contingencyPlans,
    sampleSummaries,
  };
}

function detectBottlenecks(
  timeline: RolloutTimelineNode[],
  contexts: RolloutNodeContext[],
  threshold: number,
): RobustnessBottleneck[] {
  const ctxById = new Map(contexts.map(c => [c.nodeId, c]));
  const bottlenecks: RobustnessBottleneck[] = [];

  for (const node of timeline) {
    const ctx = ctxById.get(node.nodeId);
    let primaryRisk: RobustnessBottleneck['primaryRisk'] | null = null;
    let triggerEvent = '';
    let description = '';

    if (node.physicsRobustness < 0.75) {
      primaryRisk = 'PHYSICAL_BLOCK';
      triggerEvent = node.activePerturbations.join('+') || 'WEATHER';
      description = `物理通过率 ${Math.round(node.physicsRobustness * 100)}% — 扰动下路径成本或 CHECK 失败率偏高`;
    } else if (node.socialStressIndex >= threshold) {
      primaryRisk = 'EMOTIONAL_EXPLOSION';
      triggerEvent = `连续负荷 ${ctx?.durationMinutes ?? '?'}min`;
      description = `社交压力指数 ${Math.round(node.socialStressIndex * 100)}% 逼近团队摩擦临界点`;
    } else if (node.socialStressIndex >= threshold * 0.85 && (ctx?.durationMinutes ?? 0) > 240) {
      primaryRisk = 'TIME_CRUNCH';
      triggerEvent = 'LONG_DRIVE';
      description = `连续拉车 ${ctx?.durationMinutes} 分钟压缩时序窗口，组织鲁棒性下降`;
    }

    if (primaryRisk) {
      bottlenecks.push({
        nodeId: node.nodeId,
        primaryRisk,
        triggerEvent,
        description,
      });
    }
  }

  return bottlenecks.sort((a, b) => {
    const sa = timeline.find(t => t.nodeId === a.nodeId)?.socialStressIndex ?? 0;
    const sb = timeline.find(t => t.nodeId === b.nodeId)?.socialStressIndex ?? 0;
    return sb - sa;
  });
}

function buildContingencyPlans(
  bottlenecks: RobustnessBottleneck[],
  baseIR: import('../execution-ir/execution-ir.types').ExecutionIR,
): ContingencyPlan[] {
  return bottlenecks.slice(0, 3).map(b => {
    const mutated = cloneExecutionIR(baseIR);
    const restStep = {
      type: 'PATCH' as const,
      edgeId: `contingency-rest-${b.nodeId}`,
      op: 'RE_ROUTE' as const,
    };
    mutated.steps = [...mutated.steps, restStep];

    return {
      triggerNodeId: b.nodeId,
      condition:
        b.primaryRisk === 'EMOTIONAL_EXPLOSION'
          ? `social_stress >= threshold @ ${b.nodeId}`
          : `physical_block @ ${b.triggerEvent}`,
      mutatedIR: mutated,
    };
  });
}

export function scoreSimulationRunPenalty(run: ExecutionSimulationRunResult): number {
  return run.irRun.pathCost + run.irRun.failures.length * FAILURE_WEIGHT;
}
