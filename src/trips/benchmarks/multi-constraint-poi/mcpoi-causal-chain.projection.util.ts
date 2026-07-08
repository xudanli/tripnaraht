import type { PlanningCausalChainNode } from '../../arrange-itinerary/types/planning-causal-chain.types';
import type { PlanProposal } from '../../arrange-itinerary/types/plan-proposal.types';
import {
  buildDownstreamImpacts,
  diffConstraintStates,
  type McpoiPlanEvaluation,
} from '../../arrange-itinerary/harness/mcpoi-benchmark-evaluator.util';

function statusToSeverity(
  status: McpoiPlanEvaluation['status'],
): PlanningCausalChainNode['severity'] {
  if (status === 'INFEASIBLE') return 'risk';
  if (status === 'FEASIBLE_WITH_SPLIT') return 'warn';
  if (status === 'FEASIBLE_WITH_TRADEOFF') return 'warn';
  return 'info';
}

export function projectMcpoiEvaluationToCausalNodes(
  evaluation: McpoiPlanEvaluation,
): PlanningCausalChainNode[] {
  const nodes: PlanningCausalChainNode[] = [];
  let order = 0;

  const violated = evaluation.assessments.filter((a) => a.state === 'VIOLATED');
  if (violated.length === 0) {
    nodes.push({
      id: `mcpoi_ok_d${evaluation.dayIndex + 1}`,
      order: order++,
      severity: 'info',
      description: `D${evaluation.dayIndex + 1} 当前安排满足 benchmark 约束评估`,
      title: '约束传播',
      dayIndex: evaluation.dayIndex,
      source: 'decision_checker',
    });
    return nodes;
  }

  nodes.push({
    id: `mcpoi_root_d${evaluation.dayIndex + 1}`,
    order: order++,
    severity: statusToSeverity(evaluation.status),
    description: `D${evaluation.dayIndex + 1} 计划状态：${evaluation.status}`,
    title: '根因',
    dayIndex: evaluation.dayIndex,
    source: 'decision_checker',
  });

  for (const assessment of violated) {
    nodes.push({
      id: `mcpoi_${assessment.constraintId}_d${evaluation.dayIndex + 1}`,
      order: order++,
      severity: assessment.severity === 'HARD' ? 'risk' : 'warn',
      description: assessment.message,
      title: assessment.constraintId,
      entityLabel: assessment.affectedMembers?.join(', '),
      dayIndex: evaluation.dayIndex,
      source: 'decision_checker',
      propagationHop: 1,
    });
  }

  return nodes;
}

export function projectMcpoiProposalDiffToCausalNodes(input: {
  before: McpoiPlanEvaluation;
  after: McpoiPlanEvaluation;
  proposal?: PlanProposal;
}): PlanningCausalChainNode[] {
  const nodes: PlanningCausalChainNode[] = [];
  let order = 0;

  if (input.proposal?.changes?.length) {
    for (const change of input.proposal.changes) {
      nodes.push({
        id: `mcpoi_change_${order}`,
        order: order++,
        severity: 'info',
        description: `${change.operation} ${change.label ?? change.itemId ?? '行程项'}`,
        title: '变更动作',
        dayIndex: change.dayIndex,
        itemId: change.itemId,
        source: 'proposal',
      });
    }
  }

  for (const impact of diffConstraintStates(input.before, input.after)) {
    nodes.push({
      id: `mcpoi_impact_${impact.constraintId}`,
      order: order++,
      severity: impact.after === 'SATISFIED' ? 'info' : 'risk',
      description: `${impact.constraintId}: ${impact.before} → ${impact.after}`,
      title: '直接约束影响',
      dayIndex: input.after.dayIndex,
      source: 'decision_checker',
      propagationHop: 2,
    });
  }

  for (const downstream of buildDownstreamImpacts(input.before, input.after)) {
    const type = String(downstream.type ?? 'IMPACT');
    nodes.push({
      id: `mcpoi_down_${type}_${order}`,
      order: order++,
      severity: 'warn',
      description: JSON.stringify(downstream),
      title: `下游影响 · ${type}`,
      dayIndex: input.after.dayIndex,
      source: 'decision_checker',
      propagationHop: 3,
      netImpactMinutes:
        typeof downstream.deltaMinutes === 'number' ? downstream.deltaMinutes : undefined,
    });
  }

  nodes.push({
    id: `mcpoi_verdict_${order}`,
    order: order++,
    severity: statusToSeverity(input.after.status),
    description: `计划状态 ${input.before.status} → ${input.after.status}`,
    title: '决策结论',
    dayIndex: input.after.dayIndex,
    source: 'decision_checker',
  });

  return nodes;
}

export function mergeMcpoiCausalChainNodes(
  existing: PlanningCausalChainNode[],
  mcpoiNodes: PlanningCausalChainNode[],
): PlanningCausalChainNode[] {
  if (!mcpoiNodes.length) return existing;
  const combined = [...mcpoiNodes, ...existing.filter((n) => n.source !== 'decision_checker')];
  return combined.map((node, index) => ({ ...node, order: index, id: node.id || `mcpoi_node_${index}` }));
}
