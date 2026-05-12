import type { ExecutionPolicy } from './execution-policy.types';

/** 版本化默认策略 —— 仅人工更新，禁止运行时Mutation。 */
export const DEFAULT_EXECUTION_POLICY_V1: ExecutionPolicy = {
  id: 'default-v1',
  version: '1',
  weights: {
    reliability: 10,
    cost: 1,
    daylightRisk: 5,
    roadRisk: 5,
    crossDayPenalty: 8,
  },
};
