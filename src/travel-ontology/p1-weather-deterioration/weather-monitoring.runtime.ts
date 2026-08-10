/**
 * Weather monitoring runtime — minimal in-memory tick (restored surface).
 */

import type { WeatherWarningObservation, WeatherPlanView } from './weather-deterioration.types';
import { runWeatherDeteriorationDetection } from './weather-loop.orchestrator';
import type { TravelWorldFact } from '../contracts/travel-world-fact.types';

export type WeatherMonitorPhase = 'IDLE' | 'MONITORING' | 'DECISION_OPEN' | 'APPLIED';
export type WeatherMonitorNotifyKind = 'NONE' | 'INFO' | 'ACTION_REQUIRED';

export interface WeatherMonitorConfig {
  pollIntervalMs: number;
}

export const DEFAULT_WEATHER_MONITOR_CONFIG: WeatherMonitorConfig = {
  pollIntervalMs: 60_000,
};

export interface WeatherMonitorState {
  tripId: string;
  phase: WeatherMonitorPhase;
  fingerprint?: string;
  lastTickAt?: string;
}

export interface WeatherMonitorTickResult {
  state: WeatherMonitorState;
  notify: WeatherMonitorNotifyKind;
  detectionOpen: boolean;
}

export function createIdleWeatherMonitorState(tripId: string): WeatherMonitorState {
  return { tripId, phase: 'IDLE' };
}

export function weatherMonitorFingerprint(
  observations: WeatherWarningObservation[],
): string {
  return observations
    .map((o) => `${o.regionId}:${o.warningLevel}:${o.observedAt}`)
    .sort()
    .join('|');
}

export function tickWeatherDeteriorationMonitor(input: {
  state: WeatherMonitorState;
  plan: WeatherPlanView;
  existingFacts?: TravelWorldFact[];
  observations: WeatherWarningObservation[];
  nowMs?: number;
}): WeatherMonitorTickResult {
  const fp = weatherMonitorFingerprint(input.observations);
  const detection = runWeatherDeteriorationDetection({
    tripId: input.state.tripId,
    plan: input.plan,
    existingFacts: input.existingFacts,
    observations: input.observations,
    nowMs: input.nowMs,
  });
  const detectionOpen = detection.decisionProblem != null;
  const phase: WeatherMonitorPhase = detectionOpen
    ? 'DECISION_OPEN'
    : detection.impact
      ? 'MONITORING'
      : 'IDLE';
  return {
    state: {
      ...input.state,
      phase,
      fingerprint: fp,
      lastTickAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    },
    notify: detectionOpen ? 'ACTION_REQUIRED' : detection.impact ? 'INFO' : 'NONE',
    detectionOpen,
  };
}

export class WeatherDeteriorationMonitorStore {
  private readonly byTrip = new Map<string, WeatherMonitorState>();

  get(tripId: string): WeatherMonitorState {
    return this.byTrip.get(tripId) ?? createIdleWeatherMonitorState(tripId);
  }

  set(state: WeatherMonitorState): void {
    this.byTrip.set(state.tripId, state);
  }
}
