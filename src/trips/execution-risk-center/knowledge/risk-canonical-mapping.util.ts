/**
 * Maps runtime ActiveRiskCode (canonical) → Package knowledgeCode.
 */

import type { ActiveRiskCode } from '../types/execution-risk.types';

/** Runtime codes with explicit Package mapping (subset of 104 definitions). */
export const RUNTIME_CANONICAL_TO_KNOWLEDGE: Partial<Record<ActiveRiskCode, string>> = {
  WEATHER_STRONG_WIND: 'ENV-WIND-01',
  WEATHER_HEAVY_RAIN: 'ENV-PRECIP-01',
  WEATHER_SEVERE: 'ENV-VOLC-01',
  ROAD_SLIPPERY: 'ROAD-WET-01',
  ROAD_CLOSED: 'ROAD-CLOSE-01',
  MEMBER_DRIVER_FATIGUE: 'MEMBER-FATIGUE-DRIVER-01',
  MEMBER_PHYSICAL_FATIGUE: 'MEMBER-FATIGUE-01',
  ROUTE_DEVIATION: 'ROUTE-NAV-01',
  SCHEDULE_DELAY: 'SCHEDULE-DELAY-01',
  BOOKING_WINDOW_AT_RISK: 'BOOK-TIME-01',
  TEAM_COORDINATION: 'TEAM-DRIVER-01',
};

export function resolveKnowledgeCode(code: ActiveRiskCode): string | undefined {
  return RUNTIME_CANONICAL_TO_KNOWLEDGE[code];
}

export function resolveCanonicalCode(knowledgeCode: string): ActiveRiskCode | undefined {
  const entry = Object.entries(RUNTIME_CANONICAL_TO_KNOWLEDGE).find(
    ([, kc]) => kc === knowledgeCode,
  );
  return entry?.[0] as ActiveRiskCode | undefined;
}
