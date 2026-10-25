/**
 * PD-9.4 — Proactive Decision telemetry event (Accept / FP / Useful funnels).
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveLensId } from '../lenses/lens-activation.types';
import type { InterventionSurfaceLevelV1 } from '../../../agent/decision-intelligence/intervention-intelligence/intervention-candidate.util';

export const PROACTIVE_TELEMETRY_EVENT_SCHEMA =
  'nara.proactive_telemetry_event@v1' as const;

export type ProactiveTelemetryEventKind =
  | 'OBSERVED'
  | 'IMPACT_DETECTED'
  | 'DECISION_OPENED'
  | 'LENS_PLANNED'
  | 'SYNTHESIZED'
  | 'INTERVENTION_GATED'
  | 'CARD_SHOWN'
  | 'SILENT_SUPPRESSED'
  | 'DRAFT_OPENED'
  | 'DRAFT_CONFIRMED'
  | 'DRAFT_APPLIED'
  | 'DRAFT_DEFERRED'
  | 'USER_FEEDBACK_USEFUL'
  | 'USER_FEEDBACK_NOT_USEFUL'
  | 'NEPTUNE_TRIGGERED'
  | 'NEPTUNE_SKIPPED';

export type ProactiveTelemetryEventV1 = {
  schemaId: typeof PROACTIVE_TELEMETRY_EVENT_SCHEMA;
  version: 1;
  kind: ProactiveTelemetryEventKind;
  tripId: string;
  caseId: ProactiveDecisionCaseId | null;
  decisionProblemId: string | null;
  interventionCandidateId: string | null;
  surfaceLevel: InterventionSurfaceLevelV1 | null;
  lensActivated: ProactiveLensId[];
  signalEventId?: string;
  neptuneTriggered?: boolean;
  interventionValue?: number;
  at: string;
};

export function buildProactiveTelemetryEvent(
  partial: Omit<ProactiveTelemetryEventV1, 'schemaId' | 'version' | 'at'> & {
    at?: string;
  },
): ProactiveTelemetryEventV1 {
  return {
    schemaId: PROACTIVE_TELEMETRY_EVENT_SCHEMA,
    version: 1,
    kind: partial.kind,
    tripId: partial.tripId,
    caseId: partial.caseId,
    decisionProblemId: partial.decisionProblemId,
    interventionCandidateId: partial.interventionCandidateId,
    surfaceLevel: partial.surfaceLevel,
    lensActivated: [...partial.lensActivated],
    signalEventId: partial.signalEventId,
    neptuneTriggered: partial.neptuneTriggered,
    interventionValue: partial.interventionValue,
    at: partial.at ?? new Date().toISOString(),
  };
}

export type ProactiveTelemetryCountersV1 = {
  shown: number;
  accepted: number;
  silentSuppressed: number;
  neptuneTriggered: number;
  neptuneSkipped: number;
  useful: number;
  notUseful: number;
};

export function emptyProactiveTelemetryCounters(): ProactiveTelemetryCountersV1 {
  return {
    shown: 0,
    accepted: 0,
    silentSuppressed: 0,
    neptuneTriggered: 0,
    neptuneSkipped: 0,
    useful: 0,
    notUseful: 0,
  };
}

export function reduceProactiveTelemetryCounters(
  events: ProactiveTelemetryEventV1[],
): ProactiveTelemetryCountersV1 {
  const c = emptyProactiveTelemetryCounters();
  for (const e of events) {
    if (e.kind === 'CARD_SHOWN') c.shown += 1;
    if (e.kind === 'DRAFT_CONFIRMED' || e.kind === 'DRAFT_APPLIED') c.accepted += 1;
    if (e.kind === 'SILENT_SUPPRESSED') c.silentSuppressed += 1;
    if (e.kind === 'NEPTUNE_TRIGGERED') c.neptuneTriggered += 1;
    if (e.kind === 'NEPTUNE_SKIPPED') c.neptuneSkipped += 1;
    if (e.kind === 'USER_FEEDBACK_USEFUL') c.useful += 1;
    if (e.kind === 'USER_FEEDBACK_NOT_USEFUL') c.notUseful += 1;
  }
  return c;
}

export function computeProactiveAcceptRate(
  c: ProactiveTelemetryCountersV1,
): number | null {
  if (c.shown <= 0) return null;
  return c.accepted / c.shown;
}

export function computeNeptuneTriggerRate(
  c: ProactiveTelemetryCountersV1,
): number | null {
  const total = c.neptuneTriggered + c.neptuneSkipped;
  if (total <= 0) return null;
  return c.neptuneTriggered / total;
}

export function computeSilentSuppressRate(input: {
  impactsRequiringDecision: number;
  silentSuppressed: number;
}): number | null {
  if (input.impactsRequiringDecision <= 0) return null;
  return input.silentSuppressed / input.impactsRequiringDecision;
}
