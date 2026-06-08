/**
 * Decision Telemetry Validator — 防止退化为 analytics 日志
 */

import type { DecisionTelemetryEvent, DecisionTelemetryCompleteness } from './decision-telemetry.types';
import type { DecisionCausalStructure } from './decision-causality.types';
import { DECISION_TELEMETRY_CAUSALITY_SCHEMA } from './decision-causality.types';

export interface TelemetryValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  completeness: DecisionTelemetryCompleteness;
  intelligence_grade: 'logging' | 'instrumented' | 'intelligence';
}

function countContextDimensions(ctx: DecisionTelemetryEvent['context']): number {
  let n = 0;
  if (ctx.weather) n++;
  if (ctx.travelExperienceLevel) n++;
  if (ctx.groupComposition) n++;
  if (ctx.timePressure) n++;
  if (ctx.budgetElasticity) n++;
  if (ctx.season || ctx.month != null) n++;
  if (ctx.destinationSignals && Object.keys(ctx.destinationSignals).length > 0) n++;
  return n;
}

function hasCounterfactualProjection(event: DecisionTelemetryEvent): boolean {
  const chosenId = event.decision.optionId;
  const alts = event.candidates.filter((c) => c.optionId !== chosenId);
  if (alts.length === 0) return false;
  return alts.every(
    (c) =>
      c.counterfactual != null &&
      (c.counterfactual.projected_outcome != null ||
        (c.counterfactual.causal_factor_deltas?.length ?? 0) > 0 ||
        c.counterfactual.narrative_zh != null),
  );
}

export function assessTelemetryCompleteness(
  event: Pick<
    DecisionTelemetryEvent,
    'decision' | 'candidates' | 'reasons' | 'outcome' | 'context' | 'causality'
  >,
): DecisionTelemetryCompleteness {
  const hasDecision = Boolean(event.decision?.optionId);
  const hasCandidates = Array.isArray(event.candidates) && event.candidates.length >= 2;
  const hasReasons =
    (event.reasons?.reasonCodes?.length ?? 0) > 0 ||
    Boolean(event.reasons?.userReasoning?.trim()) ||
    Object.keys(event.reasons?.rejectionByOption ?? {}).length > 0;
  const hasOutcome =
    event.outcome != null &&
    (event.outcome.satisfaction != null ||
      event.outcome.regret != null ||
      event.outcome.recommendation_would_change != null ||
      event.outcome.trip_friction_score != null);
  const hasContext = countContextDimensions(event.context) >= 2;
  const hasCounterfactuals = hasCounterfactualProjection(event as DecisionTelemetryEvent);
  const hasCausality =
    (event.causality?.active_factors?.length ?? 0) > 0 &&
    event.causality?.schema === DECISION_TELEMETRY_CAUSALITY_SCHEMA;

  const baseParts = [hasDecision, hasCandidates, hasReasons, hasOutcome];
  const score = baseParts.filter(Boolean).length / baseParts.length;

  const intelParts = [...baseParts, hasContext, hasCounterfactuals, hasCausality];
  const intelligence_score = intelParts.filter(Boolean).length / intelParts.length;

  return {
    hasDecision,
    hasCandidates,
    hasReasons,
    hasOutcome,
    hasContext,
    hasCounterfactuals,
    hasCausality,
    score,
    intelligence_score,
  };
}

export function gradeTelemetry(completeness: DecisionTelemetryCompleteness): TelemetryValidationResult['intelligence_grade'] {
  if (completeness.intelligence_score >= 0.85 && completeness.hasCounterfactuals && completeness.hasCausality) {
    return 'intelligence';
  }
  if (completeness.hasContext && completeness.hasCandidates) {
    return 'instrumented';
  }
  return 'logging';
}

export function validateTelemetryEvent(event: DecisionTelemetryEvent): TelemetryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!event.tripId?.trim()) errors.push('tripId is required');
  if (!event.context?.capturedAt) errors.push('context.capturedAt is required');
  if (!event.decision?.optionId) errors.push('decision.optionId is required');
  if (!Array.isArray(event.candidates) || event.candidates.length < 2) {
    errors.push('candidates must contain at least 2 options for counterfactual comparison');
  }

  const chosen = event.candidates?.find((c) => c.optionId === event.decision?.optionId);
  if (!chosen) errors.push('decision.optionId must match one candidate');

  const completeness = assessTelemetryCompleteness(event);

  if (countContextDimensions(event.context) < 2) {
    warnings.push('context should include at least 2 dimensions (weather, experience, group, time, budget)');
  }

  const alts = event.candidates.filter((c) => c.optionId !== event.decision.optionId);
  for (const alt of alts) {
    if (!alt.counterfactual) {
      warnings.push(`candidate ${alt.optionId} missing counterfactual projection`);
    }
  }

  if (!completeness.hasCausality) {
    warnings.push('causality.active_factors empty — will be inferred from reasonCodes + context');
  }

  const intelligence_grade = gradeTelemetry(completeness);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    completeness,
    intelligence_grade,
  };
}

/** 从 reasonCodes + context 推断表层因果因子（MVP 规则引擎） */
export function inferCausalStructure(event: DecisionTelemetryEvent): DecisionCausalStructure {
  const factors: DecisionCausalStructure['active_factors'] = [];
  const codes = new Set(event.reasons.reasonCodes.map((c) => c.toUpperCase()));

  const add = (
    factor_id: string,
    label: string,
    weight: number,
    polarity: 'for' | 'against' | 'neutral',
    counterfactual_delta_if_absent?: number,
  ) => {
    factors.push({ factor_id, label, weight, polarity, counterfactual_delta_if_absent });
  };

  if (codes.has('WINTER_WEATHER') || event.context.weather?.severity === 'high') {
    add('winter_weather', '冬季天气风险', 0.8, 'for', -0.37);
  }
  if (codes.has('DRIVING_ANXIETY') || codes.has('SELF_DRIVE_REJECT')) {
    add('driving_anxiety', '驾驶焦虑', 0.62, 'for', -0.37);
  }
  if (codes.has('AVOID_CROWD') || codes.has('ANTI_TOURIST')) {
    add('crowd_aversion', '避人群偏好', 0.55, 'for');
  }
  if (event.context.travelExperienceLevel === 'first_time') {
    add('first_time_destination', '首次目的地', 0.45, 'for');
  }
  if (event.context.timePressure === 'high') {
    add('time_pressure', '时间压力', 0.5, 'for');
  }
  if (event.context.budgetElasticity === 'rigid') {
    add('budget_constraint', '预算刚性', 0.4, 'against');
  }

  for (const code of event.reasons.reasonCodes) {
    if (factors.some((f) => f.factor_id === code.toLowerCase())) continue;
    add(code.toLowerCase(), code, 0.3, 'neutral');
  }

  return {
    schema: DECISION_TELEMETRY_CAUSALITY_SCHEMA,
    surface_reason_codes: event.reasons.reasonCodes,
    active_factors: factors,
    causality_id: event.causality?.causality_id,
    confidence: Math.min(1, factors.length * 0.15 + (event.context ? 0.2 : 0)),
  };
}
