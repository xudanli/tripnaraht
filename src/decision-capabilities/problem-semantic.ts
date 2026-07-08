/**
 * Cross-capability RFC-001 problem → canonical semantic key resolution.
 */

import {
  buildRfc001ProblemSemanticKey as buildRoadProblemSemanticKey,
} from './road-unavailable/road-unavailable.semantic';
import { buildWeatherActivityProhibitedSemanticKey } from './weather-activity-prohibited/weather-activity-prohibited.semantic';
import { buildExcessiveDailyLoadSemanticKey } from './excessive-daily-load/excessive-daily-load.semantic';

export interface Rfc001ProblemSemanticInput {
  type: string;
  triggerEventId: string;
  semanticCapability?: string;
}

export function resolveRfc001ProblemSemanticKey(
  problem: Rfc001ProblemSemanticInput,
): string {
  if (problem.semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED') {
    return buildWeatherActivityProhibitedSemanticKey(problem.triggerEventId);
  }
  if (problem.semanticCapability === 'EXCESSIVE_DAILY_LOAD') {
    return buildExcessiveDailyLoadSemanticKey(problem.triggerEventId);
  }
  if (problem.semanticCapability === 'ROAD_SEGMENT_UNAVAILABLE') {
    return buildRoadProblemSemanticKey(problem.type, problem.triggerEventId);
  }
  return buildRoadProblemSemanticKey(problem.type, problem.triggerEventId);
}
