/**
 * Adapt Guardian weather / road impact analyzers → ProactiveImpactV1.
 */

import type { WeatherActivityImpactResult } from '../../guardian-decision-core/detection/weather-activity-impact-analyzer';
import type { RoadCloseImpactResult } from '../../guardian-decision-core/detection/road-close-impact.types';
import {
  assertProactiveImpactInvariants,
  PROACTIVE_IMPACT_SCHEMA_ID,
  type ProactiveImpactLevel,
  type ProactiveImpactV1,
  type ProactiveWorldSignalKind,
} from '../contracts/proactive-impact.types';
import { mapProactiveDecisionCase } from '../mappers/proactive-case.mapper';

export type BuildProactiveImpactFromWeatherInput = {
  tripId: string;
  signalEventId: string;
  signalKind: Extract<
    ProactiveWorldSignalKind,
    'WEATHER_WIND' | 'WEATHER_BLIZZARD' | 'WEATHER_HEAVY_RAIN'
  >;
  weatherImpact: WeatherActivityImpactResult;
  impactLevel?: ProactiveImpactLevel;
  activityWindowClosed?: boolean;
  preferPostpone?: boolean;
  affectedItemLabels?: string[];
  createdAt?: string;
};

export type BuildProactiveImpactFromRoadInput = {
  tripId: string;
  signalEventId: string;
  signalKind: Extract<
    ProactiveWorldSignalKind,
    'ROAD_CLOSURE' | 'ROAD_DIFFICULTY_CHANGE' | 'ROUTE_AVAILABILITY_CHANGE'
  >;
  roadImpact: Pick<
    RoadCloseImpactResult,
    'affectedPlanItemIds' | 'roadId'
  >;
  impactLevel?: ProactiveImpactLevel;
  affectedItemLabels?: string[];
  createdAt?: string;
};

function defaultWeatherLevel(
  kind: BuildProactiveImpactFromWeatherInput['signalKind'],
): ProactiveImpactLevel {
  if (kind === 'WEATHER_BLIZZARD') return 'CRITICAL';
  if (kind === 'WEATHER_WIND') return 'HIGH';
  return 'HIGH';
}

function defaultRoadLevel(
  kind: BuildProactiveImpactFromRoadInput['signalKind'],
): ProactiveImpactLevel {
  if (kind === 'ROAD_CLOSURE') return 'CRITICAL';
  return 'HIGH';
}

export function buildProactiveImpactFromWeather(
  input: BuildProactiveImpactFromWeatherInput,
): ProactiveImpactV1 {
  const affectedItems = [...input.weatherImpact.affectedPlanItemIds];
  const impactLevel = input.impactLevel ?? defaultWeatherLevel(input.signalKind);
  const mapped = mapProactiveDecisionCase({
    signalKind: input.signalKind,
    affectedItems,
    impactLevel,
    activityWindowClosed: input.activityWindowClosed,
    preferPostpone: input.preferPostpone,
  });

  const impact: ProactiveImpactV1 = {
    schemaId: PROACTIVE_IMPACT_SCHEMA_ID,
    version: 1,
    tripId: input.tripId,
    signalKind: input.signalKind,
    signalEventId: input.signalEventId,
    impactLevel,
    affectedItems,
    decisionRequired: mapped.decisionRequired,
    caseId: mapped.caseId,
    affectedItemLabels: input.affectedItemLabels,
    countryCode: 'IS',
    createdAt: input.createdAt ?? new Date().toISOString(),
    rationaleZh: mapped.rationaleZh,
  };

  assertProactiveImpactInvariants(impact);
  return impact;
}

export function buildProactiveImpactFromRoad(
  input: BuildProactiveImpactFromRoadInput,
): ProactiveImpactV1 {
  const affectedItems = [...input.roadImpact.affectedPlanItemIds];
  const impactLevel = input.impactLevel ?? defaultRoadLevel(input.signalKind);
  const mapped = mapProactiveDecisionCase({
    signalKind: input.signalKind,
    affectedItems,
    impactLevel,
  });

  const impact: ProactiveImpactV1 = {
    schemaId: PROACTIVE_IMPACT_SCHEMA_ID,
    version: 1,
    tripId: input.tripId,
    signalKind: input.signalKind,
    signalEventId: input.signalEventId,
    impactLevel,
    affectedItems,
    decisionRequired: mapped.decisionRequired,
    caseId: mapped.caseId,
    affectedItemLabels: input.affectedItemLabels,
    countryCode: 'IS',
    createdAt: input.createdAt ?? new Date().toISOString(),
    rationaleZh: mapped.rationaleZh,
  };

  assertProactiveImpactInvariants(impact);
  return impact;
}
