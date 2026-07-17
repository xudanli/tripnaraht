/**
 * Attach TravelCausalDecision onto Iceland-seeded Canonical Causal Traces.
 */

import type { IcelandSelfDriveCausalOutput } from '../../trips/causal-runtime/domains/iceland-self-drive-causal.types';
import {
  attachSelectedOption,
  projectIcelandToTravelCausalDecision,
  reconcileTravelCausalDecision,
  type ActualOutcomeSnapshot,
  type IcelandTemporalScheduleAnchors,
  type TravelCausalDecision,
} from '../../travel-causal-decision';
import type { CausalOptionRef } from '../causal-trace-node.types';

export interface TraceScheduleOverrides {
  plannedDepartureAt?: string;
  checkInDeadlineAt?: string;
  windOnsetAt?: string;
  expectedResolutionAt?: string;
  decisionLeadMinutes?: number;
  /** Estimated € loss if appointment missed. */
  costImpactDoNothing?: number;
  recoverableStop?: {
    activityId: string;
    label: string;
    recoverMinutes: number;
  };
  activityLabel?: string;
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/**
 * Derive wall-clock anchors when caller does not supply a full schedule.
 * Defaults: depart in 3h, check-in = depart + base + slack + 30m buffer.
 */
export function deriveIcelandScheduleAnchors(
  assessment: IcelandSelfDriveCausalOutput,
  detectedAt: string,
  overrides?: TraceScheduleOverrides,
): IcelandTemporalScheduleAnchors {
  const plannedDepartureAt =
    overrides?.plannedDepartureAt ?? addMinutesIso(detectedAt, 180);
  const checkInDeadlineAt =
    overrides?.checkInDeadlineAt ??
    addMinutesIso(
      plannedDepartureAt,
      assessment.input.baseDurationMinutes +
        assessment.input.appointmentSlackMinutes +
        30,
    );
  const windOnsetAt =
    overrides?.windOnsetAt ?? addMinutesIso(plannedDepartureAt, 60);

  return {
    detectedAt,
    plannedDepartureAt,
    checkInDeadlineAt,
    windOnsetAt,
    expectedResolutionAt: overrides?.expectedResolutionAt,
    decisionLeadMinutes: overrides?.decisionLeadMinutes ?? 15,
  };
}

export function buildTravelCausalDecisionForTrace(input: {
  tripId: string;
  decisionId: string;
  assessment: IcelandSelfDriveCausalOutput;
  detectedAt: string;
  worldStateVersion: string;
  canonicalTraceId: string;
  schedule?: TraceScheduleOverrides;
}): TravelCausalDecision {
  const schedule = deriveIcelandScheduleAnchors(
    input.assessment,
    input.detectedAt,
    input.schedule,
  );

  return projectIcelandToTravelCausalDecision({
    tripId: input.tripId,
    decisionId: input.decisionId,
    assessment: input.assessment,
    schedule,
    activityLabel: input.schedule?.activityLabel ?? '活动',
    costImpactDoNothing: input.schedule?.costImpactDoNothing ?? 0,
    recoverableStop: input.schedule?.recoverableStop,
    worldStateVersion: input.worldStateVersion,
    canonicalTraceId: input.canonicalTraceId,
    ledgerRef: `trace:${input.canonicalTraceId}`,
  });
}

export function optionsFromTravelCausalDecision(
  decision: TravelCausalDecision,
  problemId: string,
): CausalOptionRef[] {
  return decision.interventions.map((opt) => ({
    optionId: opt.optionId,
    problemId,
    recommended: opt.recommended,
    metricsBefore: decision.baselineOutcome.metrics,
    metricsAfter: opt.expectedOutcome.metrics,
  }));
}

export function applySelectionToTravelCausalDecision(
  decision: TravelCausalDecision | undefined,
  optionId: string,
): TravelCausalDecision | undefined {
  if (!decision) return undefined;
  return attachSelectedOption(decision, optionId);
}

export function applyExecutionActualToTravelCausalDecision(
  decision: TravelCausalDecision | undefined,
  actual: ActualOutcomeSnapshot | undefined,
  selectedOptionId?: string,
): TravelCausalDecision | undefined {
  if (!decision) return undefined;
  let next = decision;
  if (selectedOptionId && decision.outcome?.selectedOptionId !== selectedOptionId) {
    next = attachSelectedOption(next, selectedOptionId);
  }
  if (!actual) return next;
  return reconcileTravelCausalDecision(next, actual, { selectedOptionId });
}

/**
 * Map trace calibration minutes into a coarse actual outcome for reconciliation.
 */
export function actualOutcomeFromCalibration(input: {
  predictedMinutes?: number;
  actualMinutes?: number;
  completed?: boolean;
}): ActualOutcomeSnapshot | undefined {
  if (input.actualMinutes == null && input.completed == null) return undefined;
  const metrics: Record<string, number> = {};
  if (input.actualMinutes != null) {
    metrics.actual_travel_minutes = input.actualMinutes;
  }
  if (input.predictedMinutes != null && input.actualMinutes != null) {
    const overrun = input.actualMinutes - input.predictedMinutes;
    // Heuristic: large overrun → high miss; on-time → low miss
    metrics.iceland_miss_prob = Math.max(0, Math.min(1, 0.15 + overrun / 80));
  }
  return {
    completed: input.completed,
    metrics: Object.keys(metrics).length ? metrics : undefined,
    observedAt: new Date().toISOString(),
    sources: ['SYSTEM_INFERENCE'],
  };
}
