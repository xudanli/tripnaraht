import { createHash } from 'crypto';
import {
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  TRAVEL_WORLD_PREDICATES,
  type TravelWorldFact,
} from '../contracts/travel-world-fact.types';
import type {
  WeatherWarningLevel,
  WeatherWarningObservation,
} from './weather-deterioration.types';

export const WEATHER_WARNING_RANK: Record<WeatherWarningLevel, number> = {
  NONE: 0,
  YELLOW: 1,
  ORANGE: 2,
  RED: 3,
};

export function parseWeatherWarningLevel(raw: string): WeatherWarningLevel {
  const u = raw.trim().toUpperCase();
  if (u === 'RED') return 'RED';
  if (u === 'ORANGE') return 'ORANGE';
  if (u === 'YELLOW') return 'YELLOW';
  return 'NONE';
}

function stableFactId(input: {
  subjectId: string;
  level: string;
  observedAt: string;
}): string {
  const raw = `${input.subjectId}|weather.warningLevel|${input.level}|${input.observedAt}`;
  return `fact_wx_${createHash('sha256').update(raw).digest('hex').slice(0, 20)}`;
}

export function weatherWarningObservationToTravelWorldFact(
  obs: WeatherWarningObservation,
): TravelWorldFact {
  const level = obs.warningLevel;
  const observedAt = obs.observedAt;
  const expiresAt =
    obs.expiresAt ??
    obs.validTo ??
    new Date(Date.parse(observedAt) + 6 * 3600000).toISOString();
  return {
    schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
    factId: stableFactId({ subjectId: obs.subjectId, level, observedAt }),
    subjectType: 'WeatherRegion',
    subjectId: obs.subjectId,
    predicate: TRAVEL_WORLD_PREDICATES.WEATHER_WARNING_LEVEL,
    value: level,
    scope: {
      country: obs.country ?? 'IS',
      region: obs.region ?? obs.regionId,
      tripId: obs.tripId,
      geometry: { regionId: obs.regionId, subjectId: obs.subjectId },
    },
    authorityLevel: obs.authorityLevel ?? 'GOVERNMENT',
    source: {
      provider: obs.provider ?? 'vedur.is',
      evidenceId: obs.evidenceId ?? `wx:${obs.regionId}:${observedAt}`,
    },
    observedAt,
    validFrom: obs.validFrom ?? observedAt,
    validTo: obs.validTo ?? expiresAt,
    expiresAt,
    confidence: obs.confidence ?? 0.95,
    freshness: level === 'ORANGE' || level === 'RED' ? 'LIVE' : 'FRESH',
    verificationStatus: 'VERIFIED',
    replanTrigger: level === 'ORANGE' || level === 'RED' || level === 'YELLOW',
  };
}

export function applyWeatherFactLifecycle(
  existing: TravelWorldFact[],
  incoming: TravelWorldFact,
  nowMs = Date.now(),
): TravelWorldFact[] {
  const active = existing.filter((f) => {
    if (f.freshness === 'EXPIRED') return false;
    if (f.expiresAt && Date.parse(f.expiresAt) < nowMs) return false;
    return true;
  });
  const sameTriple = (f: TravelWorldFact) =>
    f.subjectType === incoming.subjectType &&
    f.subjectId === incoming.subjectId &&
    f.predicate === incoming.predicate;
  const peers = active.filter(sameTriple);
  const others = active.filter((f) => !sameTriple(f));
  const superseded = peers.map((p) => ({
    ...p,
    freshness: 'EXPIRED' as const,
    expiresAt: incoming.observedAt,
  }));
  return [...others, ...superseded, incoming];
}

export function expireStaleWeatherFacts(
  facts: TravelWorldFact[],
  nowMs = Date.now(),
): TravelWorldFact[] {
  return facts.map((f) => {
    if (
      f.predicate === TRAVEL_WORLD_PREDICATES.WEATHER_WARNING_LEVEL &&
      f.expiresAt &&
      Date.parse(f.expiresAt) < nowMs &&
      f.freshness !== 'EXPIRED'
    ) {
      return { ...f, freshness: 'EXPIRED' as const };
    }
    return f;
  });
}

export function ensureRouteExposureFacts(
  facts: TravelWorldFact[],
  exposedSegmentIds: string[],
  observedAt: string,
): TravelWorldFact[] {
  let next = [...facts];
  for (const segmentId of exposedSegmentIds) {
    const id = `fact_wx_exp_${createHash('sha256').update(segmentId).digest('hex').slice(0, 12)}`;
    if (next.some((f) => f.factId === id)) continue;
    next.push({
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId: id,
      subjectType: 'RouteSegment',
      subjectId: segmentId,
      predicate: 'route.windExposed',
      value: true,
      scope: { country: 'IS' },
      authorityLevel: 'MODEL_INFERENCE',
      source: { provider: 'weather-plan-impact' },
      observedAt,
      confidence: 0.7,
      freshness: 'FRESH',
      verificationStatus: 'UNVERIFIED',
    });
  }
  return next;
}
