/**
 * Partial Replanning Graph：TripPlan → 可局部重算的执行依赖图（非 itinerary 可视化）
 */

export type ReplanNodeType = 'SLOT' | 'DAY' | 'ROUTE';

export interface ReplanNode {
  readonly id: string;
  readonly type: ReplanNodeType;
  /** 上游依赖（必须先满足 / 一致） */
  readonly dependsOn: readonly string[];
  /** 反向索引：哪些节点依赖本节点 */
  impactedBy: string[];
  version: number;
}

export interface PartialReplanGraph {
  readonly nodes: Map<string, ReplanNode>;
}

export function dayNodeId(date: string): string {
  return `day:${date}`;
}
