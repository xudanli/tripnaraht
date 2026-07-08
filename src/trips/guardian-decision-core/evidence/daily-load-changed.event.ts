/**
 * RFC-002 Slice 3 — DAILY_LOAD_EXCEEDED trigger event.
 */

import type { TravelDecisionEvent } from './travel-decision-event.types';

export const DAILY_LOAD_EXCEEDED_EVENT = 'DAILY_LOAD_EXCEEDED' as const;

export type DailyLoadSourceProvider = 'plan_scan' | 'admin_injection';

export interface DailyLoadChangedPayload {
  dayIndex: number;
  drivingHours: number;
  thresholdHours: number;
  sourceProvider: DailyLoadSourceProvider;
  evidenceRef?: string;
}

export type DailyLoadChangedEvent = TravelDecisionEvent<DailyLoadChangedPayload>;

export interface BuildDailyLoadChangedEventInput {
  tripId: string;
  dayIndex: number;
  drivingHours: number;
  thresholdHours: number;
  sourceProvider?: DailyLoadSourceProvider;
  correlationId?: string;
  occurredAt?: string;
}

export function buildDailyLoadChangedEvent(
  input: BuildDailyLoadChangedEventInput,
): DailyLoadChangedEvent {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const correlationId =
    input.correlationId ?? `corr_${input.tripId}_load_day_${input.dayIndex}`;
  return {
    eventId: `evt_load_${input.tripId}_d${input.dayIndex}_${Date.now()}`,
    eventType: DAILY_LOAD_EXCEEDED_EVENT,
    aggregateType: 'TRIP',
    aggregateId: input.tripId,
    occurredAt,
    correlationId,
    ontologyVersion: 'rfc001-0.1.0',
    payload: {
      dayIndex: input.dayIndex,
      drivingHours: input.drivingHours,
      thresholdHours: input.thresholdHours,
      sourceProvider: input.sourceProvider ?? 'admin_injection',
    },
  };
}

export function dailyLoadImpliesExcessive(payload: DailyLoadChangedPayload): boolean {
  return payload.drivingHours > payload.thresholdHours;
}
