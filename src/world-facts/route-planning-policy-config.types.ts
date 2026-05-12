import type { PolicyBundleSelectionReason } from './policy-selection.types';

/**
 * Configuration Plane：路线规划策略参数（Policy-as-Data 载体）。
 * revision 用于审计 / A-B / 回放对齐。
 */
export interface RoutePlanningPolicyParameters {
  revision: string;
  softStackCap: number;
  softFactorPerStack: number;
  hardPenaltyAfterCount: number;
  hardMultiplier: number;
  excludeAtCount: number;
  ambientCap: number;
  ambientFactor: number;
}

export interface ActiveRoutePlanningPolicy {
  params: RoutePlanningPolicyParameters;
  /** 语义化版本号（可由 JSON/env 覆盖） */
  revision: string;
  /** 配置来源：便于运营排查 */
  sources: string[];
  /** Policy Registry 中选中的 bundle id（回放到策略数据层） */
  activeBundleId?: string;
  /** Domain Router 命中的 rule id（若有） */
  activeRoutingRuleId?: string;
  /** bundle 选择原因（registry / env / domain） */
  policyBundleSelectionReason?: PolicyBundleSelectionReason;
}
