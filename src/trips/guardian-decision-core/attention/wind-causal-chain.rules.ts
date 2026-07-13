/**
 * Slice 4 MVP — strong wind causal chain rule table (frozen).
 */

import { ROOT_CAUSE_TYPES } from '../contracts/attention-orchestration.types';

export const WIND_CAUSAL_CHAIN_CODES = [
  'WEATHER_STRONG_WIND',
  'DRIVING_SPEED_REDUCED',
  'EXECUTION_DEPARTURE_SLIP',
  'EXECUTION_SCHEDULE_INFEASIBLE',
  'ACTIVITY_WINDOW_MISSED',
  'NIGHT_DRIVING_RISK',
] as const;

export type WindCausalChainCode = (typeof WIND_CAUSAL_CHAIN_CODES)[number];

export const WIND_CAUSAL_CHAIN_LABELS: Record<WindCausalChainCode, string> = {
  WEATHER_STRONG_WIND: '强风',
  DRIVING_SPEED_REDUCED: '驾驶速度下降',
  EXECUTION_DEPARTURE_SLIP: '执行偏差',
  EXECUTION_SCHEDULE_INFEASIBLE: '行程不可执行',
  ACTIVITY_WINDOW_MISSED: '活动最晚入场失效',
  NIGHT_DRIVING_RISK: '夜间驾驶风险',
};

/** semanticCapability values that may attach to a weather strong-wind cluster. */
export const WIND_CLUSTER_SEMANTIC_CAPABILITIES = new Set<string>([
  'WEATHER_ACTIVITY_PROHIBITED',
  'WEATHER_STRONG_WIND',
  'EXECUTION_SCHEDULE_INFEASIBLE',
  'EXECUTION_DEPARTURE_SLIP',
  'ACTIVITY_WINDOW_MISSED',
  'NIGHT_DRIVING_RISK',
  'DRIVING_SPEED_REDUCED',
]);

export const ROAD_CLUSTER_SEMANTIC_CAPABILITIES = new Set<string>([
  'ROAD_SEGMENT_UNAVAILABLE',
  'ROAD_CLOSED',
]);

export function semanticCapabilityToWindChainCode(
  semanticCapability: string,
): WindCausalChainCode | undefined {
  switch (semanticCapability) {
    case 'WEATHER_ACTIVITY_PROHIBITED':
    case 'WEATHER_STRONG_WIND':
      return 'WEATHER_STRONG_WIND';
    case 'DRIVING_SPEED_REDUCED':
      return 'DRIVING_SPEED_REDUCED';
    case 'EXECUTION_DEPARTURE_SLIP':
      return 'EXECUTION_DEPARTURE_SLIP';
    case 'EXECUTION_SCHEDULE_INFEASIBLE':
      return 'EXECUTION_SCHEDULE_INFEASIBLE';
    case 'ACTIVITY_WINDOW_MISSED':
      return 'ACTIVITY_WINDOW_MISSED';
    case 'NIGHT_DRIVING_RISK':
      return 'NIGHT_DRIVING_RISK';
    default:
      return undefined;
  }
}

export function isWindClusterSemanticCapability(semanticCapability: string): boolean {
  return WIND_CLUSTER_SEMANTIC_CAPABILITIES.has(semanticCapability);
}

export function isRoadClusterSemanticCapability(semanticCapability: string): boolean {
  return ROAD_CLUSTER_SEMANTIC_CAPABILITIES.has(semanticCapability);
}

export function defaultWindRootCauseType(): string {
  return ROOT_CAUSE_TYPES.WEATHER_STRONG_WIND;
}
