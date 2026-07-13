/**
 * Slice 3 — EXECUTION_DEPARTURE_SLIP trigger event.
 */

import type { TravelDecisionEvent } from './travel-decision-event.types';
import type { ExecutionDepartureSource } from '../contracts/execution-slip.types';

export const EXECUTION_DEPARTURE_SLIP_EVENT = 'EXECUTION_DEPARTURE_SLIP' as const;

export interface ExecutionDepartureSlipPayload {
  observationId: string;
  activityId: string;
  planVersionId: string;
  plannedDepartAt: string;
  observedAt: string;
  stillAtPoi: boolean;
  source: ExecutionDepartureSource;
  slipMinutes: number;
  nextActivityId?: string;
  projectedEta?: string;
  lastEntryAt?: string;
  evidenceRef?: string;
}

export type ExecutionDepartureSlipEvent =
  TravelDecisionEvent<ExecutionDepartureSlipPayload>;

export interface BuildExecutionDepartureSlipEventInput {
  tripId: string;
  observationId: string;
  activityId: string;
  planVersionId: string;
  plannedDepartAt: string;
  observedAt: string;
  stillAtPoi: boolean;
  source: ExecutionDepartureSource;
  slipMinutes: number;
  nextActivityId?: string;
  projectedEta?: string;
  lastEntryAt?: string;
  correlationId?: string;
  occurredAt?: string;
}

export function buildExecutionDepartureSlipEvent(
  input: BuildExecutionDepartureSlipEventInput,
): ExecutionDepartureSlipEvent {
  const occurredAt = input.occurredAt ?? input.observedAt;
  const correlationId =
    input.correlationId ?? `corr_exec_slip_${input.tripId}_${input.activityId}`;
  return {
    eventId: `evt_exec_slip_${input.tripId}_${input.observationId}`,
    eventType: EXECUTION_DEPARTURE_SLIP_EVENT,
    aggregateType: 'EXECUTION',
    aggregateId: input.tripId,
    occurredAt,
    correlationId,
    ontologyVersion: 'rfc001-0.1.0',
    payload: {
      observationId: input.observationId,
      activityId: input.activityId,
      planVersionId: input.planVersionId,
      plannedDepartAt: input.plannedDepartAt,
      observedAt: input.observedAt,
      stillAtPoi: input.stillAtPoi,
      source: input.source,
      slipMinutes: input.slipMinutes,
      nextActivityId: input.nextActivityId,
      projectedEta: input.projectedEta,
      lastEntryAt: input.lastEntryAt,
    },
  };
}
