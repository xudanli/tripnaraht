import type { RoutePlanningPolicyParameters } from './route-planning-policy-config.types';

/** 内嵌默认策略（无外部文件/env 时的 single source of truth 基底） */
export const DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS: RoutePlanningPolicyParameters = {
  revision: '2026.05.08/route-planning-policy@v1',
  softStackCap: 3,
  softFactorPerStack: 0.97,
  hardPenaltyAfterCount: 3,
  hardMultiplier: 0.35,
  excludeAtCount: 8,
  ambientCap: 5,
  ambientFactor: 0.992,
};
