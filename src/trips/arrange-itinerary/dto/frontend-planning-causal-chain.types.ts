/**
 * 规划工作台决策因果链 — 前端类型 SSOT
 */

export type PlanningCausalChainNodeSeverity = 'info' | 'warn' | 'risk';

export type PlanningCausalChainNodeSource =
  | 'proposal'
  | 'readiness'
  | 'decision_checker'
  | 'validation';

export type PlanningCausalChainBasisSource =
  | 'proposal_diff'
  | 'readiness_cascade'
  | 'decision_checker'
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
  propagationHop?: number;
  netImpactMinutes?: number;
}

export interface PlanningDecisionCausalChain {
  schema: 'tripnara.planning_causal_chain@v1';
  tripId: string;
  proposalId?: string;
  generatedAt: string;
  basisUpdatedAt?: string;
  basisSource: PlanningCausalChainBasisSource;
  refreshUrl: string;
  nodes: PlanningCausalChainNode[];
}

export const CAUSAL_CHAIN_SEVERITY_COLORS: Record<
  PlanningCausalChainNodeSeverity,
  'green' | 'blue' | 'red'
> = {
  info: 'green',
  warn: 'blue',
  risk: 'red',
};

export function formatCausalChainBasisAge(basisUpdatedAt?: string, now = Date.now()): string | undefined {
  if (!basisUpdatedAt) return undefined;
  const ms = now - new Date(basisUpdatedAt).getTime();
  if (ms < 60_000) return '刚刚';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
