/**
 * Slice 3 — DAILY_LOAD_EXCEEDED → WorldStateAssertion.
 */

import type { EntityRef } from '../contracts/entity-ref.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../config/rfc001-iceland.config';
import type {
  DailyLoadChangedPayload,
  DailyLoadSourceProvider,
} from '../evidence/daily-load-changed.event';

export const RFC001_DAILY_LOAD_ASSERTION_VALIDITY_MS = 24 * 60 * 60 * 1000;

export interface DailyLoadAssertionPayload {
  dayIndex: number;
  drivingHours: number;
  thresholdHours: number;
}

export interface DailyLoadToAssertionInput {
  tripId: string;
  payload: DailyLoadChangedPayload;
  evidenceRef: string;
  observedAt: string;
  assertionId?: string;
}

function resolveSubjectRef(tripId: string, dayIndex: number): EntityRef {
  return {
    kind: 'DAY',
    id: `day_${dayIndex}`,
    label: `trip:${tripId}:day:${dayIndex}`,
  };
}

export function buildEvidenceRefForDailyLoad(
  tripId: string,
  dayIndex: number,
  observedAt: string,
): string {
  const bucket = observedAt.slice(0, 13);
  return `ev_load_${tripId.slice(0, 8)}_d${dayIndex}_${bucket}`;
}

export function dailyLoadChangedToAssertion(
  input: DailyLoadToAssertionInput,
): WorldStateAssertion<DailyLoadAssertionPayload> {
  const assertionId =
    input.assertionId ??
    `wsa_load_${input.tripId}_d${input.payload.dayIndex}_${Date.now()}`;
  const validUntil = new Date(
    new Date(input.observedAt).getTime() + RFC001_DAILY_LOAD_ASSERTION_VALIDITY_MS,
  ).toISOString();

  return {
    assertionId,
    subjectRef: resolveSubjectRef(input.tripId, input.payload.dayIndex),
    predicate: 'daily.load',
    payload: {
      dayIndex: input.payload.dayIndex,
      drivingHours: input.payload.drivingHours,
      thresholdHours: input.payload.thresholdHours,
    },
    source: {
      provider: input.payload.sourceProvider,
      sourceType:
        input.payload.sourceProvider === 'admin_injection' ? 'INTERNAL' : 'INTERNAL',
      evidenceRefs: [input.evidenceRef],
    },
    observedAt: input.observedAt,
    validFrom: input.observedAt,
    validUntil,
    confidence: 0.9,
    status: 'ACTIVE',
    version: 1,
  };
}

export function assertionImpliesExcessiveDailyLoad(
  assertion: WorldStateAssertion<DailyLoadAssertionPayload>,
): boolean {
  return assertion.payload.drivingHours > assertion.payload.thresholdHours;
}

export const DAILY_LOAD_ASSERTION_ADAPTER_VERSION = RFC001_EVIDENCE_RESOLVER_VERSION;
