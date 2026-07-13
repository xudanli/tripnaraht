/**
 * Maps Package knowledgeCode → runtime ActiveRiskCode for projections.
 */
import type { ActiveRiskCode, ActiveRiskType } from '../types/execution-risk.types';
import { resolveCanonicalCode } from './risk-canonical-mapping.util';

const KNOWLEDGE_TYPE_FALLBACK: Record<string, ActiveRiskType> = {
  ENVIRONMENT: 'ENVIRONMENT',
  ROAD_TRANSPORT: 'ROAD_TRANSPORT',
  MEMBER_STATE: 'MEMBER_STATE',
  ROUTE_EXECUTION: 'ROUTE_EXECUTION',
  SCHEDULE: 'SCHEDULE',
  BOOKING_FULFILLMENT: 'BOOKING_FULFILLMENT',
  TEAM_COORDINATION: 'TEAM_COORDINATION',
  RESOURCE: 'RESOURCE',
};

const KNOWLEDGE_RUNTIME_CODE: Record<string, ActiveRiskCode> = {
  'ENV-PRECIP-02': 'WEATHER_HEAVY_RAIN',
  'ENV-VIS-01': 'WEATHER_SEVERE',
  'ENV-VIS-02': 'WEATHER_SEVERE',
  'ROAD-CROSSWIND-01': 'ROAD_SLIPPERY',
  'ROAD-ICE-01': 'ROAD_SLIPPERY',
  'ROAD-CLOSE-02': 'ROAD_CLOSED',
  'MEMBER-FATIGUE-01': 'MEMBER_PHYSICAL_FATIGUE',
  'TEAM-DRIVER-01': 'TEAM_COORDINATION',
};

export function resolveRuntimeCodeForKnowledge(knowledgeCode: string): ActiveRiskCode {
  return (
    resolveCanonicalCode(knowledgeCode) ??
    KNOWLEDGE_RUNTIME_CODE[knowledgeCode] ??
    'GENERIC'
  );
}

export function resolveRiskTypeForKnowledge(
  knowledgeCode: string,
  riskType?: string,
): ActiveRiskType {
  if (riskType && KNOWLEDGE_TYPE_FALLBACK[riskType]) {
    return KNOWLEDGE_TYPE_FALLBACK[riskType];
  }
  const prefix = knowledgeCode.split('-')[0];
  if (prefix === 'ENV') return 'ENVIRONMENT';
  if (prefix === 'ROAD') return 'ROAD_TRANSPORT';
  if (prefix === 'MEMBER') return 'MEMBER_STATE';
  if (prefix === 'BOOK') return 'BOOKING_FULFILLMENT';
  if (prefix === 'SCHEDULE') return 'SCHEDULE';
  if (prefix === 'TEAM') return 'TEAM_COORDINATION';
  if (prefix === 'ROUTE') return 'ROUTE_EXECUTION';
  return 'SCHEDULE';
}
