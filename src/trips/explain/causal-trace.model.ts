/**
 * Causal trace — 执行因果图节点（审计 / 回放 / 用户解释）
 */

export type CausalTraceNodeType =
  | 'CONSTRAINT'
  | 'IMPACT'
  | 'REPAIR'
  | 'REPLAN'
  | 'MUTATION';

export interface CausalTraceNode {
  readonly id: string;
  readonly type: CausalTraceNodeType;
  /** 上游：域、道路 ID、系统等 */
  readonly source: string;
  /** 下游：槽位 id、动作名、delta kind 等 */
  readonly target: string;
  readonly reasonCode: string;
  readonly timestamp: number;
}

export interface CausalGraph {
  readonly nodes: readonly CausalTraceNode[];
}
