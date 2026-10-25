/**
 * PD-1/PD-3 — Intake: WorldSignal + analyzer impact → Silent | Continue(+Impact).
 */

import type { WeatherActivityImpactResult } from '../../guardian-decision-core/detection/weather-activity-impact-analyzer';
import type { RoadCloseImpactResult } from '../../guardian-decision-core/detection/road-close-impact.types';
import {
  buildProactiveImpactFromRoad,
  buildProactiveImpactFromWeather,
} from '../adapters/build-proactive-impact.util';
import type { ProactiveImpactLevel } from '../contracts/proactive-impact.types';
import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import { isProactiveDecisionV1Enabled } from '../config/proactive-decision-feature-flags.util';
import {
  buildProactiveIdempotencyKey,
  type ProactiveOrchestratorShortCircuit,
  type ProactiveOrchestratorStepResult,
  type ProactiveWorldSignalV1,
} from '../orchestration/proactive-decision-orchestrator.types';
import { isProactiveV1SignalAllowlisted } from '../signals/proactive-trigger-allowlist.util';

export type RunProactiveIntakeWeatherInput = {
  signal: ProactiveWorldSignalV1;
  weatherImpact: WeatherActivityImpactResult;
  impactLevel?: ProactiveImpactLevel;
  activityWindowClosed?: boolean;
  preferPostpone?: boolean;
  affectedItemLabels?: string[];
  /** Inject for tests; defaults to process.env flag */
  enabled?: boolean;
};

export type RunProactiveIntakeRoadInput = {
  signal: ProactiveWorldSignalV1;
  roadImpact: Pick<RoadCloseImpactResult, 'affectedPlanItemIds' | 'roadId'>;
  impactLevel?: ProactiveImpactLevel;
  affectedItemLabels?: string[];
  enabled?: boolean;
};

function silent(
  reason: ProactiveOrchestratorShortCircuit,
  signal: ProactiveWorldSignalV1,
  impact?: ProactiveImpactV1,
): ProactiveOrchestratorStepResult {
  return {
    status: 'SILENT',
    reason,
    impact,
    idempotencyKey: buildProactiveIdempotencyKey({
      tripId: signal.tripId,
      signalEventId: signal.signalEventId,
      caseId: impact?.caseId ?? null,
    }),
  };
}

function continueWith(impact: ProactiveImpactV1): ProactiveOrchestratorStepResult {
  return {
    status: 'CONTINUE',
    impact,
    idempotencyKey: buildProactiveIdempotencyKey({
      tripId: impact.tripId,
      signalEventId: impact.signalEventId,
      caseId: impact.caseId,
    }),
  };
}

export function runProactiveDecisionIntakeFromWeather(
  input: RunProactiveIntakeWeatherInput,
): ProactiveOrchestratorStepResult {
  const enabled =
    input.enabled ?? isProactiveDecisionV1Enabled();
  if (!enabled) {
    return silent('FEATURE_FLAG_OFF', input.signal);
  }
  if (!isProactiveV1SignalAllowlisted(input.signal.signalKind)) {
    return silent('SIGNAL_NOT_ALLOWLISTED', input.signal);
  }
  if (!input.signal.signalKind.startsWith('WEATHER_')) {
    return silent('SIGNAL_NOT_ALLOWLISTED', input.signal);
  }

  const impact = buildProactiveImpactFromWeather({
    tripId: input.signal.tripId,
    signalEventId: input.signal.signalEventId,
    signalKind: input.signal.signalKind as
      | 'WEATHER_WIND'
      | 'WEATHER_BLIZZARD'
      | 'WEATHER_HEAVY_RAIN',
    weatherImpact: input.weatherImpact,
    impactLevel: input.impactLevel,
    activityWindowClosed: input.activityWindowClosed,
    preferPostpone: input.preferPostpone,
    affectedItemLabels: input.affectedItemLabels,
    createdAt: input.signal.observedAt,
  });

  if (!impact.decisionRequired || !impact.caseId) {
    if (!impact.affectedItems.length) {
      return silent('NO_AFFECTED_ITEMS', input.signal, impact);
    }
    return silent('IMPACT_BELOW_THRESHOLD', input.signal, impact);
  }

  return continueWith(impact);
}

export function runProactiveDecisionIntakeFromRoad(
  input: RunProactiveIntakeRoadInput,
): ProactiveOrchestratorStepResult {
  const enabled = input.enabled ?? isProactiveDecisionV1Enabled();
  if (!enabled) {
    return silent('FEATURE_FLAG_OFF', input.signal);
  }
  if (!isProactiveV1SignalAllowlisted(input.signal.signalKind)) {
    return silent('SIGNAL_NOT_ALLOWLISTED', input.signal);
  }
  if (input.signal.signalKind.startsWith('WEATHER_')) {
    return silent('SIGNAL_NOT_ALLOWLISTED', input.signal);
  }

  const impact = buildProactiveImpactFromRoad({
    tripId: input.signal.tripId,
    signalEventId: input.signal.signalEventId,
    signalKind: input.signal.signalKind as
      | 'ROAD_CLOSURE'
      | 'ROAD_DIFFICULTY_CHANGE'
      | 'ROUTE_AVAILABILITY_CHANGE',
    roadImpact: input.roadImpact,
    impactLevel: input.impactLevel,
    affectedItemLabels: input.affectedItemLabels,
    createdAt: input.signal.observedAt,
  });

  if (!impact.decisionRequired || !impact.caseId) {
    if (!impact.affectedItems.length) {
      return silent('NO_AFFECTED_ITEMS', input.signal, impact);
    }
    return silent('CASE_UNMAPPED', input.signal, impact);
  }

  return continueWith(impact);
}
