/**
 * ProactiveSurfaceEvent — Surface → View → Response → Decision → Action → Outcome。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { DeliveryChannelV1 } from './delivery-policy.util';

export const PROACTIVE_SURFACE_EVENT_SCHEMA =
  'nara.proactive_surface_event@v1' as const;

export type L2UserResponseV1 =
  | 'ACCEPT'
  | 'DISMISS'
  | 'SNOOZE'
  | 'CONTINUE_ANYWAY'
  | 'NONE';

export type ProactiveSurfaceEventV1 = {
  schemaId: typeof PROACTIVE_SURFACE_EVENT_SCHEMA;
  version: 1;
  eventId: string;
  scenarioId: TemporalScenarioId;
  tripId: string;
  candidateId: string;
  channel: DeliveryChannelV1;
  /** 生命周期阶段时间戳 */
  surfacedAt: string;
  viewedAt?: string;
  respondedAt?: string;
  decidedAt?: string;
  actedAt?: string;
  outcomeAt?: string;
  response?: L2UserResponseV1;
  decisionId?: string;
  actionId?: string;
  outcomeSummaryZh?: string;
  /** 是否保持沉默（未 Surface） */
  stayedSilent: boolean;
  silenceReasonZh?: string;
  pushForbidden: true;
  autoApplyForbidden: true;
  autoCancelForbidden: true;
  autoRerouteForbidden: true;
};

export function createProactiveSurfaceEvent(input: {
  scenarioId: TemporalScenarioId;
  tripId: string;
  candidateId: string;
  channel: DeliveryChannelV1;
  surfacedAt?: string;
  eventId?: string;
}): ProactiveSurfaceEventV1 {
  return {
    schemaId: PROACTIVE_SURFACE_EVENT_SCHEMA,
    version: 1,
    eventId: input.eventId ?? `pse_${input.candidateId}_${Date.now()}`,
    scenarioId: input.scenarioId,
    tripId: input.tripId,
    candidateId: input.candidateId,
    channel: input.channel,
    surfacedAt: input.surfacedAt ?? new Date().toISOString(),
    stayedSilent: false,
    pushForbidden: true,
    autoApplyForbidden: true,
    autoCancelForbidden: true,
    autoRerouteForbidden: true,
  };
}

export function recordSilentSurfaceDecision(input: {
  scenarioId: TemporalScenarioId;
  tripId: string;
  candidateId: string;
  silenceReasonZh: string;
  eventId?: string;
}): ProactiveSurfaceEventV1 {
  return {
    schemaId: PROACTIVE_SURFACE_EVENT_SCHEMA,
    version: 1,
    eventId: input.eventId ?? `pse_silent_${input.candidateId}`,
    scenarioId: input.scenarioId,
    tripId: input.tripId,
    candidateId: input.candidateId,
    channel: 'NONE',
    surfacedAt: new Date().toISOString(),
    stayedSilent: true,
    silenceReasonZh: input.silenceReasonZh,
    pushForbidden: true,
    autoApplyForbidden: true,
    autoCancelForbidden: true,
    autoRerouteForbidden: true,
  };
}

export function advanceProactiveSurfaceEvent(
  event: ProactiveSurfaceEventV1,
  patch: {
    viewedAt?: string;
    respondedAt?: string;
    response?: L2UserResponseV1;
    decidedAt?: string;
    decisionId?: string;
    actedAt?: string;
    actionId?: string;
    outcomeAt?: string;
    outcomeSummaryZh?: string;
  },
): ProactiveSurfaceEventV1 {
  if (event.stayedSilent) {
    throw new Error('[ProactiveSurfaceEvent] silent_event_cannot_advance');
  }
  return { ...event, ...patch };
}
