/**
 * P6：路线推荐显式策略（Policy Layer）— 可命名、可审计、可调参。
 */

import type { PolicyTraceEntry } from './policy-dsl.types';

/** 单条路线在一次打分上的策略输出 */
export interface RoutePlanningPolicyOutcome {
  score: number;
  /** 命中排除策略时不参与 Top 排序（除非全部被排除则回退） */
  excluded: boolean;
  appliedRuleIds: string[];
  reasons: string[];
  /** 与 appliedRuleIds 对齐的结构化 trace（DSL v1） */
  trace: PolicyTraceEntry[];
  /** 评估时加载的策略 revision（与 Configuration Plane 对齐） */
  policyRevision: string;
  /** Registry bundle id（可选，便于回放对齐） */
  policyBundleId?: string;
  /** Domain Router 命中的 rule id */
  policyRoutingRuleId?: string;
}
