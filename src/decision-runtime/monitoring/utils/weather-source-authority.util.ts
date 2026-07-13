/**
 * Authority gates: Open-Meteo fallback must not alone downgrade active Vedur risk.
 */

import type { WeatherRiskTier } from '../../../trips/guardian-decision-core/evidence/weather-observation-change.util';
import type { WeatherSourceProvider } from '../config/iceland-weather-source-authority.config';
import {
  classifyWeatherEvidenceTier,
  type WeatherEvidenceTier,
} from '../config/iceland-weather-source-authority.config';

export interface WeatherSourceTransitionEvent {
  tripId: string;
  dayIndex: number;
  from: WeatherEvidenceTier | 'none';
  to: WeatherEvidenceTier;
  reason: string;
  weatherSource?: string;
  sourceProvider?: WeatherSourceProvider;
  at: string;
}

const transitionLog: WeatherSourceTransitionEvent[] = [];
const MAX_TRANSITION_LOG = 200;

export function recordWeatherSourceTransition(event: Omit<WeatherSourceTransitionEvent, 'at'>): void {
  const row: WeatherSourceTransitionEvent = { ...event, at: new Date().toISOString() };
  transitionLog.push(row);
  if (transitionLog.length > MAX_TRANSITION_LOG) {
    transitionLog.shift();
  }
  console.info(
    `[weather_source_transition] from=${row.from} to=${row.to} reason=${row.reason} trip=${row.tripId} day=${row.dayIndex} source=${row.weatherSource ?? 'none'}`,
  );
}

export function getWeatherSourceTransitionLog(): readonly WeatherSourceTransitionEvent[] {
  return transitionLog;
}

export function resetWeatherSourceTransitionLogForTests(): void {
  transitionLog.length = 0;
}

function tierRank(tier: WeatherRiskTier): number {
  if (tier === 'PROHIBITED') return 3;
  if (tier === 'ELEVATED') return 2;
  return 1;
}

function isExpired(validUntil: string | undefined, nowMs: number): boolean {
  if (!validUntil) return false;
  const ts = Date.parse(validUntil);
  return Number.isFinite(ts) && ts < nowMs;
}

export function canFallbackSourceModifyVedurRisk(input: {
  nextSourceProvider: WeatherSourceProvider;
  previousSourceProvider?: WeatherSourceProvider;
  previousWeatherSource?: string;
  previousRiskTier?: WeatherRiskTier;
  nextRiskTier: WeatherRiskTier;
  previousValidUntil?: string;
  nowMs?: number;
}): boolean {
  if (input.nextSourceProvider === 'iceland_met') {
    return true;
  }

  const prevTier = classifyWeatherEvidenceTier({
    weatherSource: input.previousWeatherSource,
    sourceProvider: input.previousSourceProvider,
  });
  if (prevTier !== 'VEDUR_LIVE') {
    return true;
  }

  const nowMs = input.nowMs ?? Date.now();
  if (isExpired(input.previousValidUntil, nowMs)) {
    return true;
  }

  const prevRank = tierRank(input.previousRiskTier ?? 'CALM');
  const nextRank = tierRank(input.nextRiskTier);
  if (nextRank < prevRank) {
    return false;
  }

  return true;
}

export function canSourceRecoverWeatherProblem(sourceProvider?: WeatherSourceProvider): boolean {
  return sourceProvider === 'iceland_met';
}
