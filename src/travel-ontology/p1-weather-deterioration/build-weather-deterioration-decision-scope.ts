/**
 * Bind Ontology P1 weather detection to DecisionScope (Authority Consistency).
 */

import { buildWindDecisionScope } from '../../decision-runtime/builders/build-wind-decision-scope';
import type { DecisionScope } from '../../decision-runtime/contracts/decision-scope.types';
import type { TravelWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';
import type { TravelWorldFact } from '../contracts/travel-world-fact.types';
import type { WeatherPlanImpact, WeatherPlanView } from './weather-deterioration.types';

export function buildWeatherDeteriorationDecisionScope(input: {
  tripId: string;
  plan: WeatherPlanView;
  impact: WeatherPlanImpact;
  facts: TravelWorldFact[];
  nowMs?: number;
}): { worldStateSnapshotId: string; decisionScope: DecisionScope } {
  const createdAt = new Date(input.nowMs ?? Date.now()).toISOString();
  const worldStateSnapshotId = `ws_${input.tripId}_wx_${input.plan.revision}`;
  const segmentId =
    input.impact.matchedSegmentIds[0] ??
    input.plan.segments.find((s) => s.windExposed)?.segmentId ??
    'segment:exposed';
  const activityId =
    input.impact.affectedPlanItemIds[0] ??
    input.plan.segments.find((s) => s.outdoorActivity)?.itineraryItemId ??
    'activity:outdoor';

  const snapshot: TravelWorldStateSnapshot = {
    schemaId: 'tripnara.canonical_world_state_snapshot@v1',
    snapshotId: worldStateSnapshotId,
    tripId: input.tripId,
    revision: String(input.plan.revision),
    createdAt,
    weather: [
      {
        date: createdAt.slice(0, 10),
        alertLevel: input.impact.warningLevel === 'NONE' ? undefined : input.impact.warningLevel,
        locationId: input.impact.regionId,
      },
    ],
    roads: [{ roadId: segmentId, segmentId, status: 'OPEN' }],
    hazards: [],
    ferries: [],
    poiStates: [],
    travelMatrix: { matrixId: 'wx', entries: [] },
    completeness: {
      weather: 'PARTIAL',
      roads: 'PARTIAL',
      hazards: 'MISSING',
      ferries: 'MISSING',
      openingHours: 'PARTIAL',
    },
    sourceVersions: [],
    worldFacts: input.facts,
    vehicle: input.plan.vehicleClass
      ? {
          vehicleClass: input.plan.vehicleClass,
          highRoof: /HIGH_ROOF|CAMPER/i.test(input.plan.vehicleClass),
        }
      : undefined,
    inferred: {
      interventionDeadline: input.impact.timeline.lastActionBy,
      riskTrend: 'DETERIORATING',
      confidence: 0.8,
    },
  };

  const decisionScope = buildWindDecisionScope({
    snapshot,
    activityId,
    segmentId,
    trigger: 'WEATHER_DETERIORATION_STRONG_WIND',
  });

  // Ontology repair kinds use the same allowedActions set as buildWindDecisionScope.
  return { worldStateSnapshotId, decisionScope };
}
