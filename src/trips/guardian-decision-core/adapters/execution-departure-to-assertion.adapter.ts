/**
 * Slice 3 — ExecutionDepartureObservation → WorldStateAssertion.
 */

import type { EntityRef } from '../contracts/entity-ref.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { WorldStateAssertionSource } from '../contracts/world-state.types';
import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../config/rfc001-iceland.config';
import type { ExecutionDepartureSlipEvent } from '../evidence/execution-departure-changed.event';

export interface ExecutionDepartureAssertionPayload {
  factType: 'EXECUTION_DEPARTURE_SLIP';
  activityId: string;
  plannedDepartAt: string;
  observedAt: string;
  stillAtPoi: boolean;
  slipMinutes: number;
  nextActivityId?: string;
  projectedEta?: string;
  lastEntryAt?: string;
}

export interface ExecutionDepartureToAssertionInput {
  tripId: string;
  event: ExecutionDepartureSlipEvent;
  evidenceRef: string;
  confidence?: number;
  assertionId?: string;
}

const ASSERTION_VALIDITY_MS = 4 * 60 * 60 * 1000;

function resolveSubjectRef(tripId: string, activityId: string): EntityRef {
  return {
    kind: 'PLAN_ITEM',
    id: activityId,
    label: `trip:${tripId}`,
  };
}

export function buildEvidenceRefForExecutionDeparture(
  tripId: string,
  activityId: string,
  observedAt: string,
): string {
  const bucket = observedAt.slice(0, 13);
  return `ev_exec_slip_${activityId}_${tripId.slice(0, 8)}_${bucket}`;
}

export function executionDepartureSlipToAssertion(
  input: ExecutionDepartureToAssertionInput,
): WorldStateAssertion<ExecutionDepartureAssertionPayload> {
  const { event, tripId, evidenceRef } = input;
  const { payload } = event;
  const assertionId =
    input.assertionId ??
    `wsa_exec_slip_${payload.activityId}_${tripId.slice(0, 8)}_${Date.now()}`;
  const observedAt = payload.observedAt;
  const validUntil = new Date(
    new Date(observedAt).getTime() + ASSERTION_VALIDITY_MS,
  ).toISOString();

  const source: WorldStateAssertionSource = {
    provider: payload.source,
    sourceType: payload.source === 'USER_REPORT' ? 'USER' : 'INTERNAL',
    evidenceRefs: [evidenceRef],
  };

  return {
    assertionId,
    subjectRef: resolveSubjectRef(tripId, payload.activityId),
    predicate: 'execution.departure_slip',
    payload: {
      factType: 'EXECUTION_DEPARTURE_SLIP',
      activityId: payload.activityId,
      plannedDepartAt: payload.plannedDepartAt,
      observedAt: payload.observedAt,
      stillAtPoi: payload.stillAtPoi,
      slipMinutes: payload.slipMinutes,
      nextActivityId: payload.nextActivityId,
      projectedEta: payload.projectedEta,
      lastEntryAt: payload.lastEntryAt,
    },
    source,
    observedAt,
    validFrom: observedAt,
    validUntil,
    confidence: Math.min(1, Math.max(0, input.confidence ?? 0.95)),
    status: 'ACTIVE',
    version: 1,
  };
}

export function assertionImpliesScheduleInfeasible(
  assertion: WorldStateAssertion<ExecutionDepartureAssertionPayload>,
): boolean {
  if (!assertion.payload.lastEntryAt || !assertion.payload.projectedEta) {
    return false;
  }
  return (
    new Date(assertion.payload.projectedEta).getTime() >
    new Date(assertion.payload.lastEntryAt).getTime()
  );
}

export { RFC001_EVIDENCE_RESOLVER_VERSION };
