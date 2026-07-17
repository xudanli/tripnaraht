/**
 * Wall-clock temporal forecast from Iceland self-drive causal metrics + schedule anchors.
 */

import type { IcelandSelfDriveCausalOutput } from '../../trips/causal-runtime/domains/iceland-self-drive-causal.types';
import {
  TEMPORAL_IMPACT_SCHEMA,
  type TemporalImpact,
} from '../types/temporal-impact.types';

export interface IcelandTemporalScheduleAnchors {
  /** When the issue was detected (defaults to now if omitted by caller). */
  detectedAt: string;
  /** Planned departure ISO. */
  plannedDepartureAt: string;
  /** Hard check-in / last-entry ISO. */
  checkInDeadlineAt: string;
  /** Optional: when gusts are forecast to intensify. */
  windOnsetAt?: string;
  /** Optional: when hazard clears. */
  expectedResolutionAt?: string;
  /** Minutes of human decision lead time before earliest actionable departure. */
  decisionLeadMinutes?: number;
}

function parseIso(iso: string): number {
  return new Date(iso).getTime();
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function addMinutes(iso: string, minutes: number): string {
  return toIso(parseIso(iso) + minutes * 60_000);
}

/**
 * Build TemporalImpact for strong-wind → miss-appointment chain.
 *
 * - onset: wind intensifies (or departure)
 * - deterioration: P90 ETA under current plan (enter high-risk vs check-in)
 * - interventionDeadline: latest moment to commit before required early departure
 */
export function buildIcelandTemporalImpact(
  assessment: IcelandSelfDriveCausalOutput,
  anchors: IcelandTemporalScheduleAnchors,
): TemporalImpact {
  const lead = anchors.decisionLeadMinutes ?? 15;
  const shift =
    assessment.recommendedIntervention?.shiftMinutes ??
    Math.max(30, Math.round(assessment.travelTime.p90Minutes - assessment.input.baseDurationMinutes));

  const delayMinutes = Math.max(
    0,
    assessment.travelTime.p90Minutes - assessment.input.baseDurationMinutes,
  );

  const expectedOnsetAt = anchors.windOnsetAt ?? anchors.plannedDepartureAt;
  const deteriorationAt = addMinutes(anchors.plannedDepartureAt, assessment.travelTime.p90Minutes);

  // Must decide early enough to still leave `shift` minutes earlier (+ lead time).
  let interventionDeadline = addMinutes(anchors.plannedDepartureAt, -(shift + lead));
  const detectedMs = parseIso(anchors.detectedAt);
  if (parseIso(interventionDeadline) < detectedMs) {
    // Already past ideal deadline — surface "act immediately" as detectedAt.
    interventionDeadline = anchors.detectedAt;
  }

  const assumptions = [
    `当前路线「${assessment.input.routeLabel}」不变`,
    `预约/签到硬截止 ${anchors.checkInDeadlineAt}`,
    `缓冲 ${assessment.input.appointmentSlackMinutes} 分钟`,
    `风速 ${assessment.input.windMps} m/s（P90 延误约 ${delayMinutes} 分钟）`,
  ];
  if (assessment.input.windExposure) {
    assumptions.push(`暴露度假设：${assessment.input.windExposure}`);
  }

  return {
    schema: TEMPORAL_IMPACT_SCHEMA,
    detectedAt: anchors.detectedAt,
    expectedOnsetAt,
    deteriorationAt,
    interventionDeadline,
    expectedResolutionAt: anchors.expectedResolutionAt,
    confidence: clamp01(0.55 + (1 - assessment.missProbability) * 0.2 + 0.15),
    assumptions,
  };
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export { addMinutes };
