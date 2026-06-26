/**
 * 从编排态 / 证据包提取级联影响分析（route-and-run P1）。
 */

import type { EvidenceEnvelope } from '../types/evidence-envelope.types';
import type { NonTransactionalReplanResult } from '../types/travel-entity-graph.types';
import type { TripItineraryItemLike } from './trip-dependency-chain.util';
import { extractFullTripDependencyChain } from './trip-dependency-chain.util';
import { buildNonTransactionalReplanResult } from './dependency-impact.analyzer';
import {
  isFroadRoadStatus,
  isRoadClosureBlocking,
  type RoadStatusValue,
  type WeatherWindowValue,
} from './iceland-dependency-impact.analyzer';
import { travelEntityRefFromCoordinates } from '../../data-contracts/mappers/evidence-envelope.mapper';

export interface DependencyImpactFromEvidenceInput {
  tripId?: string;
  prefetchedEvidence?: unknown[];
  hardFacts?: Array<{ rule_id?: string; is_violated?: boolean; ref_id?: string }>;
  itineraryItems?: TripItineraryItemLike[];
  locale?: 'zh' | 'en';
  nowMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function envelopeFromPrefetched(entry: Record<string, unknown>, nowMs: number): EvidenceEnvelope | null {
  const kind = String(entry.kind ?? entry.type ?? '').toLowerCase();
  const at = String(entry.at ?? entry.observedAt ?? new Date(nowMs).toISOString());
  const source = String(entry.source ?? 'prefetched_evidence');

  if (kind.includes('road') || entry.roadStatus || entry.isOpen !== undefined) {
    const road = (entry.roadStatus ?? entry) as RoadStatusValue;
    const coords = entry.coordinates ?? entry.location;
    const lat = isRecord(coords) ? Number(coords.lat) : undefined;
    const lng = isRecord(coords) ? Number(coords.lng) : undefined;
    return {
      factType: 'ROAD',
      entityRef:
        lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
          ? travelEntityRefFromCoordinates(lat, lng, 'ROAD')
          : { kind: 'ROAD', id: String(entry.roadId ?? entry.id ?? 'road:unknown') },
      value: road,
      source,
      observedAt: at,
      confidence: typeof entry.confidence === 'number' ? entry.confidence : 0.75,
    };
  }

  const overrides = entry.overrides;
  if (kind === 'environment_overrides_v1' && isRecord(overrides)) {
    const weather = overrides.weather;
    if (isRecord(weather)) {
      const lat = Number(weather.lat ?? entry.lat ?? 64.13);
      const lng = Number(weather.lng ?? entry.lng ?? -21.94);
      const forecastSeries = weather.forecastSeries ?? weather.forecast_series;
      let value: WeatherWindowValue = {
        windSpeed: Number(weather.wind_mps ?? weather.windSpeedMps ?? 0),
        visibility: Number(weather.visibility_m ?? weather.visibility ?? Infinity),
        precipitationSum: Number(weather.precipitation_mm ?? 0),
      };
      if (Array.isArray(forecastSeries) && forecastSeries.length > 0) {
        const peak = forecastSeries.reduce((best: any, row: any) => {
          const w = Number(row?.wind_mps ?? row?.windSpeedKph ?? 0);
          return w > Number(best?.wind_mps ?? 0) ? row : best;
        }, forecastSeries[0]);
        value = {
          ...value,
          maxWindSpeed: Number(peak?.wind_mps ?? peak?.windSpeedKph ?? value.windSpeed),
          precipitationSum: Number(peak?.precipitation_mm ?? value.precipitationSum),
        };
      }
      return {
        factType: 'WEATHER',
        entityRef: travelEntityRefFromCoordinates(lat, lng, 'REGION'),
        value,
        source,
        observedAt: at,
        confidence: 0.8,
      };
    }
  }

  if (entry.factType === 'ROAD' || entry.factType === 'WEATHER' || entry.factType === 'FLIGHT_STATUS') {
    return entry as unknown as EvidenceEnvelope;
  }

  return null;
}

function envelopeFromHardFact(fact: { rule_id?: string; is_violated?: boolean }): EvidenceEnvelope | null {
  if (fact.is_violated !== true) return null;
  const ruleId = String(fact.rule_id ?? '');
  if (ruleId.includes('drive_safety') || ruleId.includes('precipitation') || ruleId.includes('snow')) {
    return {
      factType: 'WEATHER',
      entityRef: travelEntityRefFromCoordinates(64.13, -21.94, 'REGION'),
      value: { windSpeed: 20, condition: 'wind', metadata: { rule_id: ruleId } },
      source: ruleId,
      observedAt: new Date().toISOString(),
      confidence: 0.85,
    };
  }
  return null;
}

function isActionableTrigger(envelope: EvidenceEnvelope): boolean {
  if (envelope.factType === 'FLIGHT_STATUS') return true;
  if (envelope.factType === 'ROAD') {
    return isRoadClosureBlocking((envelope.value ?? {}) as RoadStatusValue);
  }
  if (envelope.factType === 'WEATHER') {
    const w = (envelope.value ?? {}) as WeatherWindowValue;
    const wind = Math.max(Number(w.windSpeed ?? 0), Number(w.maxWindSpeed ?? 0));
    return wind >= 12 || (w.alerts?.length ?? 0) > 0;
  }
  return false;
}

/**
 * 扫描证据并返回首个有下游影响的级联分析结果；无可行动证据时返回 null。
 */
export function buildDependencyImpactFromEvidence(
  input: DependencyImpactFromEvidenceInput,
): NonTransactionalReplanResult | null {
  const nowMs = input.nowMs ?? Date.now();
  const chain = extractFullTripDependencyChain(input.itineraryItems ?? []);
  const triggers: EvidenceEnvelope[] = [];

  for (const raw of input.prefetchedEvidence ?? []) {
    if (!isRecord(raw)) continue;
    const env = envelopeFromPrefetched(raw, nowMs);
    if (env) triggers.push(env);
  }

  for (const fact of input.hardFacts ?? []) {
    const env = envelopeFromHardFact(fact);
    if (env) triggers.push(env);
  }

  for (const trigger of triggers) {
    if (!isActionableTrigger(trigger)) continue;
    const result = buildNonTransactionalReplanResult({
      tripId: input.tripId,
      trigger,
      chain,
      locale: input.locale,
      nowMs,
    });
    if (result.impact.affected.length > 0) {
      return result;
    }
    if (trigger.factType === 'ROAD' && isFroadRoadStatus((trigger.value ?? {}) as RoadStatusValue)) {
      return result;
    }
  }

  return null;
}
