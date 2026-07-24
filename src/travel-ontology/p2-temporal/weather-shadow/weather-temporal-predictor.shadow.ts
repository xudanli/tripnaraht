/**
 * ONT-P2-02 — Weather temporal predictor (SHADOW / offline only)
 */

import { createHash } from 'crypto';
import {
  TEMPORAL_IMPACT_SCHEMA_ID,
  type TemporalImpact,
  type TemporalRiskLevel,
} from '../contracts';
import type { WeatherForecastPoint, WeatherOfflineAccuracyCase } from './weather-forecast-series.types';

export const WEATHER_TEMPORAL_PREDICTOR_ID = 'weather_temporal_predictor.shadow@v0' as const;
export const WEATHER_TEMPORAL_PREDICTION_VERSION = 'p2.0.0-shadow' as const;

const LEVEL_RANK: Record<TemporalRiskLevel, number> = {
  NONE: 0,
  YELLOW: 1,
  ORANGE: 2,
  RED: 3,
};

export function parseTemporalRiskLevel(raw: string): TemporalRiskLevel {
  const u = raw.trim().toUpperCase();
  if (u === 'RED') return 'RED';
  if (u === 'ORANGE') return 'ORANGE';
  if (u === 'YELLOW') return 'YELLOW';
  return 'NONE';
}

function isHazard(level: TemporalRiskLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK.ORANGE;
}

/** First forecast point at/after asOf that reaches ORANGE+ */
export function findPredictedOnset(
  series: WeatherForecastPoint[],
  asOf: string,
): { at: string; level: TemporalRiskLevel } | null {
  const asOfMs = Date.parse(asOf);
  const sorted = [...series].sort((a, b) => a.at.localeCompare(b.at));
  for (const p of sorted) {
    if (Date.parse(p.at) < asOfMs) continue;
    if (isHazard(p.predictedLevel)) {
      return { at: p.at, level: p.predictedLevel };
    }
  }
  return null;
}

/** First step-up after onset to a strictly higher hazard rank */
export function findPredictedDeterioration(
  series: WeatherForecastPoint[],
  onsetAt: string,
  onsetLevel: TemporalRiskLevel,
): string | undefined {
  const sorted = [...series]
    .filter((p) => p.at > onsetAt)
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const p of sorted) {
    if (LEVEL_RANK[p.predictedLevel] > LEVEL_RANK[onsetLevel]) {
      return p.at;
    }
  }
  return undefined;
}

export function findPredictedPeak(
  series: WeatherForecastPoint[],
  asOf: string,
  horizonEndAt: string,
): TemporalRiskLevel {
  const lo = Date.parse(asOf);
  const hi = Date.parse(horizonEndAt);
  let peak: TemporalRiskLevel = 'NONE';
  for (const p of series) {
    const t = Date.parse(p.at);
    if (t < lo || t > hi) continue;
    if (LEVEL_RANK[p.predictedLevel] > LEVEL_RANK[peak]) peak = p.predictedLevel;
  }
  return peak;
}

export function predictWeatherTemporalImpact(
  input: WeatherOfflineAccuracyCase,
  nowMs?: number,
): TemporalImpact | null {
  const onset = findPredictedOnset(input.forecastSeries, input.asOf);
  const peak = findPredictedPeak(
    input.forecastSeries,
    input.asOf,
    input.horizonEndAt,
  );
  if (!onset && peak === 'NONE') return null;

  const onsetAt = onset?.at ?? input.horizonEndAt;
  const onsetLevel = onset?.level ?? peak;
  const deterioration = onset
    ? findPredictedDeterioration(input.forecastSeries, onset.at, onset.level)
    : undefined;

  const confBase = peak === 'RED' ? 0.85 : peak === 'ORANGE' ? 0.75 : 0.55;
  const temporalImpactId = `ti_${createHash('sha256')
    .update(`${input.caseId}|${input.asOf}|${onsetAt}|${peak}`)
    .digest('hex')
    .slice(0, 16)}`;

  return {
    schemaId: TEMPORAL_IMPACT_SCHEMA_ID,
    temporalImpactId,
    semanticScope: 'WEATHER_DETERIORATION',
    subjectType: 'WeatherRegion',
    subjectId: input.subjectId,
    tripId: input.tripId,
    regionId: input.regionId,
    predictedOnset: onsetAt,
    predictedDeterioration: deterioration,
    predictedPeakLevel: peak === 'NONE' ? onsetLevel : peak,
    affectedScopes: [...input.affectedScopes],
    confidence: confBase,
    evidenceRefs: input.forecastSeries.map(
      (p) => `fc:${p.forecastIssuedAt}:${p.at}:${p.predictedLevel}`,
    ),
    predictionVersion: WEATHER_TEMPORAL_PREDICTION_VERSION,
    authorityMode: 'SHADOW',
    computedAt: new Date(nowMs ?? Date.parse(input.asOf)).toISOString(),
  };
}
