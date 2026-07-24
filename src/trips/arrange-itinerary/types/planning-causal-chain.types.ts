/**
 * 规划工作台决策因果链 — 竖向影响传播节点（编排 BFF）
 * @see ARRANGE_ITINERARY_API.md § 决策因果链
 */

export type PlanningCausalChainNodeSeverity = 'info' | 'warn' | 'risk';

export type PlanningCausalChainNodeSource =
  | 'proposal'
  | 'readiness'
  | 'decision_checker'
  | 'problem_assertion'
  | 'option_preview'
  | 'world_context'
  | 'validation';

export type PlanningCausalChainBasisSource =
  | 'proposal_diff'
  | 'readiness_cascade'
  | 'decision_checker'
  | 'world_context'
  | 'mixed'
  | 'empty';

export interface PlanningCausalChainNode {
  id: string;
  order: number;
  severity: PlanningCausalChainNodeSeverity;
  description: string;
  title?: string;
  entityLabel?: string;
  itemId?: string;
  dayIndex?: number;
  source: PlanningCausalChainNodeSource;
  /** 传播跳数（readiness 级联） */
  propagationHop?: number;
  /** 净时间影响（分钟） */
  netImpactMinutes?: number;
}

export interface PlanningDecisionCausalChain {
  schema: 'tripnara.planning_causal_chain@v1';
  tripId: string;
  proposalId?: string;
  /** 决策空间模式 — 与 decision-problems[].problemId 对齐 */
  problemId?: string;
  /** 已选修复方案 — 与 decision-problems options[].actionId 对齐 */
  optionId?: string;
  generatedAt: string;
  basisUpdatedAt?: string;
  basisSource: PlanningCausalChainBasisSource;
  refreshUrl: string;
  nodes: PlanningCausalChainNode[];
}
