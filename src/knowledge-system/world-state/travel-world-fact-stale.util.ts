/**
 * TravelWorldFact freshness / stale (Phase 2 World State SSOT).
 */

import type { TravelWorldFact } from '../../travel-ontology/contracts/travel-world-fact.types';
import type { FactFreshness } from '../../travel-ontology/contracts/common-states.types';

/** Default TTLs aligned with decision-tick-freshness (road 15m / weather 30m-ish). */
export const ROAD_FACT_TTL_MS = 15 * 60 * 1000;
export const WEATHER_FACT_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_FACT_TTL_MS = 60 * 60 * 1000;

export type FactStaleReason = 'EXPIRED_VALID_TO' | 'TTL_EXCEEDED' | 'MARKED_STALE' | 'LOW_FRESHNESS';

export interface FactStaleAssessment {
  factId: string;
  subjectId: string;
  predicate: string;
  stale: boolean;
  reasons: FactStaleReason[];
  ageMs: number;
  ttlMs: number;
  freshness: FactFreshness | string;
  excludeFromHardBlock: boolean;
}

export function ttlForPredicate(predicate: string): number {
  if (predicate.includes('road') || predicate.includes('Road') || predicate === 'route.currentRoadStatus') {
    return ROAD_FACT_TTL_MS;
  }
  if (predicate.startsWith('weather.') || predicate.includes('weather')) {
    return WEATHER_FACT_TTL_MS;
  }
  return DEFAULT_FACT_TTL_MS;
}

export function assessTravelWorldFactStale(
  fact: TravelWorldFact,
  nowMs = Date.now(),
): FactStaleAssessment {
  const observed = Date.parse(fact.observedAt);
  const ageMs = Number.isFinite(observed) ? Math.max(0, nowMs - observed) : 0;
  const ttlMs = ttlForPredicate(fact.predicate);
  const reasons: FactStaleReason[] = [];

  if (fact.validTo) {
    const vt = Date.parse(fact.validTo);
    if (Number.isFinite(vt) && vt < nowMs) reasons.push('EXPIRED_VALID_TO');
  }
  if (ageMs > ttlMs) reasons.push('TTL_EXCEEDED');
  if (fact.freshness === 'STALE' || fact.freshness === 'EXPIRED') reasons.push('MARKED_STALE');
  if (fact.confidence < 0.4) reasons.push('LOW_FRESHNESS');

  const stale = reasons.length > 0;
  return {
    factId: fact.factId,
    subjectId: fact.subjectId,
    predicate: fact.predicate,
    stale,
    reasons,
    ageMs,
    ttlMs,
    freshness: fact.freshness,
    /** Stale road/weather must not drive HARD BLOCK alone */
    excludeFromHardBlock: stale && (reasons.includes('EXPIRED_VALID_TO') || reasons.includes('TTL_EXCEEDED') || reasons.includes('MARKED_STALE')),
  };
}

/** Facts eligible for Gate HARD BLOCK evaluation. */
export function filterFactsForHardBlock(
  facts: TravelWorldFact[],
  nowMs = Date.now(),
): { eligible: TravelWorldFact[]; excluded: FactStaleAssessment[] } {
  const eligible: TravelWorldFact[] = [];
  const excluded: FactStaleAssessment[] = [];
  for (const f of facts) {
    const a = assessTravelWorldFactStale(f, nowMs);
    if (a.excludeFromHardBlock) excluded.push(a);
    else eligible.push(f);
  }
  return { eligible, excluded };
}
