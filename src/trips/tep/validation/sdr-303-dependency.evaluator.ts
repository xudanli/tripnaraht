/**
 * SDR-303 — 依赖链分析与影响摘要
 */

import type {
  DailyDrivePlan,
  DependencyImpactSummary,
  PlanDependency,
  PlanFlexibility,
  PlanningRuleResult,
} from '../contracts/tep-self-drive.types';
import { buildPlanDependencies } from '../utils/plan-dependency.builder';

function isEditableFlexibility(flexibility: PlanFlexibility): boolean {
  return flexibility !== 'FIXED';
}

function collectEditableNodeRefs(dailyDrivePlans: DailyDrivePlan[]): string[] {
  const refs: string[] = [];
  for (const day of dailyDrivePlans) {
    for (const leg of day.legs) {
      if (isEditableFlexibility(leg.flexibility)) refs.push(leg.legId);
    }
    for (const activity of day.activities) {
      if (isEditableFlexibility(activity.flexibility)) refs.push(activity.ref);
    }
  }
  return refs;
}

function resolveDownstreamRefs(nodeRef: string, dependencies: PlanDependency[]): string[] {
  const visited = new Set<string>();
  const queue = [nodeRef];
  const downstream: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dep of dependencies) {
      if (dep.fromRef !== current) continue;
      if (visited.has(dep.toRef)) continue;
      visited.add(dep.toRef);
      downstream.push(dep.toRef);
      queue.push(dep.toRef);
    }
  }

  return downstream;
}

/** SDR-303 — 为 RecoveryGraph 生成依赖影响摘要 */
export function buildSdr303DependencyImpacts(input: {
  dailyDrivePlans: DailyDrivePlan[];
  dependencies?: PlanDependency[];
}): DependencyImpactSummary[] {
  const dependencies = input.dependencies ?? buildPlanDependencies(input.dailyDrivePlans);
  const editableRefs = collectEditableNodeRefs(input.dailyDrivePlans);

  return editableRefs.map((nodeRef) => {
    const related = dependencies.filter(
      (d) => d.fromRef === nodeRef || d.toRef === nodeRef,
    );
    const downstreamRefs = resolveDownstreamRefs(nodeRef, dependencies);

    return {
      nodeRef,
      editable: true,
      downstreamRefs,
      dependencyKinds: [...new Set(related.map((d) => d.kind))],
    };
  });
}

/** SDR-303 — 规划期规则评估（不阻断，PASS 由调用方决定是否展示） */
export function evaluateSdr303DependencyChain(input: {
  dailyDrivePlans: DailyDrivePlan[];
  dependencies?: PlanDependency[];
}): PlanningRuleResult[] {
  const dependencies = input.dependencies ?? buildPlanDependencies(input.dailyDrivePlans);
  const impacts = buildSdr303DependencyImpacts({
    dailyDrivePlans: input.dailyDrivePlans,
    dependencies,
  });

  if (impacts.length === 0 || dependencies.length === 0) return [];

  const nodesWithDownstream = impacts.filter((i) => i.downstreamRefs.length > 0);
  if (nodesWithDownstream.length === 0) return [];

  return [
    {
      ruleId: 'SDR-303',
      outcome: 'PASS',
      severity: 'INFO',
      affectedRefs: nodesWithDownstream.map((i) => i.nodeRef).slice(0, 12),
      explanation: `已投影 ${dependencies.length} 条依赖链，${nodesWithDownstream.length} 个可编辑节点存在下游影响`,
      evidenceRefs: [],
    },
  ];
}
