/**
 * Slice 2 — Abu weather/activity constraint via destination pack rules.
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { WeatherHazardAssertionPayload } from './weather-hazard-to-assertion.adapter';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';
import { WEATHER_ACTIVITY_PROHIBITED } from '../../../decision-capabilities/weather-activity-prohibited/weather-activity-prohibited.semantic';
import {
  applyPackEvaluationToAssertionEnvelope,
  executePackRuleConstraint,
} from '../../../decision-runtime/packs/rules/pack-rule-constraint.executor';
import { applyActivityLoadToWeatherFacts } from '../../../decision-runtime/packs/modifiers/apply-outdoor-load-modifiers.util';
import { resolveActivityLoadEnvironmentForCountry } from '../../../decision-runtime/packs/modifiers/pack-modifier-bundle.loader';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';
import {
  indexSegmentsByDay,
  readSegmentItineraryItemId,
} from '../detection/segment-plan-item.util';

export const ABU_WEATHER_RULE_VERSION = 'abu-weather-activity-rfc002-0.1.0';

export interface AbuWeatherActivityConstraintInput {
  tripId: string;
  workspaceId: string;
  targetCandidateId: string;
  weatherAssertion: WorldStateAssertion<WeatherHazardAssertionPayload>;
  affectedPlanItemIds: string[];
  candidatePlan: RoutePlanDraft;
  destinationCountry?: string;
  now?: Date;
}

function candidateExposesOutdoorActivity(
  plan: RoutePlanDraft,
  affectedPlanItemIds: string[],
  dayIndex?: number,
): boolean {
  const affected = new Set(affectedPlanItemIds);
  const byDay = indexSegmentsByDay(plan);

  for (const [day, segments] of byDay) {
    if (dayIndex != null && day !== dayIndex) continue;
    for (const segment of segments) {
      const itemId = readSegmentItineraryItemId(segment as any);
      if (itemId && affected.has(itemId)) {
        const exposure = (segment.metadata as { exposure?: string })?.exposure;
        if (exposure === 'indoor') return false;
        return true;
      }
    }
  }
  return affectedPlanItemIds.length > 0;
}

function isAssertionExpired(
  assertion: WorldStateAssertion<WeatherHazardAssertionPayload>,
  now: Date,
): boolean {
  if (!assertion.validUntil) return false;
  return new Date(assertion.validUntil).getTime() < now.getTime();
}

export function evaluateAbuWeatherActivityConstraintForCandidate(
  input: AbuWeatherActivityConstraintInput,
): Rfc001ConstraintAssertion {
  const now = input.now ?? new Date();
  const payload = input.weatherAssertion.payload;
  const activityExposed = candidateExposesOutdoorActivity(
    input.candidatePlan,
    input.affectedPlanItemIds,
    payload.dayIndex,
  );

  const base: Omit<
    Rfc001ConstraintAssertion,
    'verdict' | 'constraintCode' | 'reasonCodes' | 'overridable'
  > = {
    assertionId: `abu_weather_${input.workspaceId}_${input.targetCandidateId}_${Date.now()}`,
    workspaceId: input.workspaceId,
    actor: 'ABU',
    targetCandidateId: input.targetCandidateId,
    affectedEntityRefs: [input.weatherAssertion.subjectRef],
    affectedPlanItemIds: input.affectedPlanItemIds,
    evidenceRefs: input.weatherAssertion.source.evidenceRefs,
    ruleVersion: ABU_WEATHER_RULE_VERSION,
    confidence: input.weatherAssertion.confidence,
    createdAt: now.toISOString(),
  };

  if (isAssertionExpired(input.weatherAssertion, now)) {
    return {
      ...base,
      verdict: 'UNKNOWN',
      constraintCode: 'EVIDENCE_STALE',
      reasonCodes: [RFC001_REASON_CODES.EVIDENCE_STALE],
      overridable: false,
    };
  }

  const country = resolveTripDestinationCountry(input.destinationCountry);
  const activityLoad = country
    ? resolveActivityLoadEnvironmentForCountry(country)
    : { windExposureMultiplier: 1, highlandFatigueFactor: 1 };
  const adjustedWind = applyActivityLoadToWeatherFacts({
    windSpeedKmh: payload.windSpeedKmh,
    windGustKmh: payload.windGustKmh ?? payload.windSpeedKmh,
    activityExposed,
    activityLoad,
  });

  const evaluation = executePackRuleConstraint({
    country: country ?? '',
    semanticKey: WEATHER_ACTIVITY_PROHIBITED,
    facts: {
      weather: adjustedWind,
      activity: {
        exposed: activityExposed,
        requiresGuide: payload.requiresGuide ?? false,
        type: payload.activityType ?? '',
      },
    },
    candidateUsesRoute: activityExposed,
    ruleVersionPrefix: ABU_WEATHER_RULE_VERSION,
  });

  if (evaluation) {
    return applyPackEvaluationToAssertionEnvelope(
      {
        ...base,
        verdict: 'PASS',
        constraintCode: '',
        reasonCodes: [],
        overridable: true,
      },
      evaluation,
    ) as Rfc001ConstraintAssertion;
  }

  if (!activityExposed) {
    return {
      ...base,
      verdict: 'PASS',
      constraintCode: 'WEATHER_INDOOR_ALTERNATIVE',
      reasonCodes: [],
      overridable: true,
    };
  }

  return {
    ...base,
    verdict: 'PASS',
    constraintCode: 'WEATHER_WITHIN_TOLERANCE',
    reasonCodes: [],
    overridable: true,
  };
}
