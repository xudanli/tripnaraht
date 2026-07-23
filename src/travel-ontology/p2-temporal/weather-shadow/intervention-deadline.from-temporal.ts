/**
 * ONT-P2-03 — Intervention deadline from TemporalImpact (SHADOW)
 */

import { createHash } from 'crypto';
import {
  INTERVENTION_DEADLINE_SCHEMA_ID,
  type InterventionDeadline,
  type TemporalImpact,
} from '../contracts';

export const DEFAULT_INTERVENTION_LEAD_MINUTES = 150;

export function computeInterventionDeadline(input: {
  temporalImpact: TemporalImpact;
  leadTimeMinutes?: number;
  nowMs?: number;
}): InterventionDeadline {
  const lead = input.leadTimeMinutes ?? DEFAULT_INTERVENTION_LEAD_MINUTES;
  const anchorAt =
    input.temporalImpact.predictedDeterioration ??
    input.temporalImpact.predictedOnset;
  const method = input.temporalImpact.predictedDeterioration
    ? 'LEAD_TIME_BEFORE_DETERIORATION'
    : 'LEAD_TIME_BEFORE_ONSET';
  const deadlineMs = Date.parse(anchorAt) - lead * 60_000;
  const interventionDeadline = new Date(deadlineMs).toISOString();

  const recommendedActions: InterventionDeadline['recommendedActions'] =
    input.temporalImpact.predictedPeakLevel === 'RED'
      ? ['SHIFT_DEPARTURE', 'AVOID_EXPOSED_SEGMENT', 'DOWNGRADE_VEHICLE']
      : input.temporalImpact.predictedPeakLevel === 'ORANGE'
        ? ['SHIFT_DEPARTURE', 'DOWNGRADE_VEHICLE']
        : ['MONITOR_ONLY'];

  const deadlineId = `dl_${createHash('sha256')
    .update(`${input.temporalImpact.temporalImpactId}|${interventionDeadline}`)
    .digest('hex')
    .slice(0, 16)}`;

  return {
    schemaId: INTERVENTION_DEADLINE_SCHEMA_ID,
    deadlineId,
    temporalImpactId: input.temporalImpact.temporalImpactId,
    tripId: input.temporalImpact.tripId,
    interventionDeadline,
    derivation: {
      method,
      leadTimeMinutes: lead,
      anchorAt,
      notes: [
        `SHADOW deadline = ${method} − ${lead}m`,
        'Does not control READY/Confirm/Execute',
      ],
    },
    recommendedActions,
    authorityMode: 'SHADOW',
    computedAt: new Date(
      input.nowMs ?? Date.parse(input.temporalImpact.computedAt),
    ).toISOString(),
  };
}
