/**
 * CanonicalWorldStateSnapshot → TravelWorldFact 投影
 */

import type { CanonicalWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';
import {
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  TRAVEL_WORLD_PREDICATES,
  type TravelWorldFact,
} from '../contracts/travel-world-fact.types';

function roadStatusToOntology(
  status: string,
): 'OPEN' | 'CLOSED' | 'UNKNOWN' | 'IMPASSABLE' {
  if (status === 'CLOSED') return 'CLOSED';
  if (status === 'RESTRICTED') return 'IMPASSABLE';
  if (status === 'OPEN') return 'OPEN';
  return 'UNKNOWN';
}

/** 将 Canonical World State 中的道路/天气条目转为 Ontology 事实 */
export function canonicalWorldStateToTravelWorldFacts(
  snapshot: CanonicalWorldStateSnapshot | Record<string, unknown>,
): TravelWorldFact[] {
  if (!snapshot || typeof snapshot !== 'object') return [];

  const createdAt =
    typeof snapshot.createdAt === 'string' ? snapshot.createdAt : new Date().toISOString();
  const tripId = typeof snapshot.tripId === 'string' ? snapshot.tripId : 'unknown';
  const roads = Array.isArray((snapshot as CanonicalWorldStateSnapshot).roads)
    ? (snapshot as CanonicalWorldStateSnapshot).roads
    : [];
  const weatherRows = Array.isArray((snapshot as CanonicalWorldStateSnapshot).weather)
    ? (snapshot as CanonicalWorldStateSnapshot).weather
    : [];

  const facts: TravelWorldFact[] = [];
  const observedAt = createdAt;

  for (const road of roads) {
    facts.push({
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId: `cws_road_${road.roadId}_${road.segmentId ?? 'all'}`,
      subjectType: 'RouteSegment',
      subjectId: road.segmentId ?? road.roadId,
      predicate: TRAVEL_WORLD_PREDICATES.CURRENT_ROAD_STATUS,
      value: roadStatusToOntology(road.status),
      scope: { tripId },
      authorityLevel: 'OFFICIAL_OPERATOR',
      source: { provider: road.sourceRef ?? 'canonical_world_state' },
      validFrom: road.validFrom,
      validTo: road.validUntil,
      observedAt,
      confidence: 0.9,
      freshness: 'FRESH',
      verificationStatus: 'VERIFIED',
      replanTrigger: road.status === 'CLOSED',
    });
  }

  for (const weather of weatherRows) {
    if (weather.alertLevel) {
      facts.push({
        schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
        factId: `cws_weather_${weather.locationId ?? weather.date}`,
        subjectType: 'RouteSegment',
        subjectId: weather.locationId ?? weather.date,
        predicate: TRAVEL_WORLD_PREDICATES.WEATHER_WARNING_LEVEL,
        value: weather.alertLevel,
        scope: { tripId },
        authorityLevel: 'GOVERNMENT',
        source: { provider: weather.sourceRef ?? 'canonical_world_state' },
        observedAt,
        confidence: 0.85,
        freshness: 'FRESH',
        verificationStatus: 'VERIFIED',
        replanTrigger: true,
      });
    }
  }

  return facts;
}
