import { createHash } from 'node:crypto';
import {
  TravelEventSource,
  TravelEventType,
  TrajectorySegment,
  type TravelEventEnvelope,
} from '../event-store/types/travel-event.types';
import { eventIdFromIdempotencyKey } from '../event-store/travel-event-idempotency.util';
import type { DecisionCausalityRecord } from './decision-causality-v1.types';
import { isDecisionCausalityRecordV1 } from './decision-causality-v1.types';

export const TRAVEL_EVENT_CAUSALITY_SCHEMA_VERSION = 1;

export function buildDecisionCausalityIdempotencyKey(
  tripId: string,
  causalityId: string,
): string {
  return [tripId, TravelEventType.TRIP_DECISION_CAUSALITY_RECORDED, causalityId].join('|');
}

export function buildDecisionCausalityTravelEventEnvelope(input: {
  tripId: string;
  record: DecisionCausalityRecord;
  requestId?: string;
  userId?: string;
  timestamp?: string;
}): TravelEventEnvelope {
  const { tripId, record, requestId, userId } = input;
  const timestamp = input.timestamp ?? record.completed_at;
  const idempotencyKey = buildDecisionCausalityIdempotencyKey(tripId, record.causality_id);

  const payload: Record<string, unknown> = {
    causality_id: record.causality_id,
    schema: record.schema,
    tick_kind: record.tick_kind,
    trace_request_id: record.trace_request_id,
    reality: record.reality,
    policy_engine: record.policy_engine,
    execution_gate: record.execution_gate,
    plan_execution: record.plan_execution,
    outcome: record.outcome,
  };

  if (isDecisionCausalityRecordV1(record) && record.causal_decision) {
    payload.causal_decision = record.causal_decision;
  }

  return {
    eventId: eventIdFromIdempotencyKey(idempotencyKey),
    idempotencyKey,
    tripId,
    segment: TrajectorySegment.DECISION,
    eventType: TravelEventType.TRIP_DECISION_CAUSALITY_RECORDED,
    source: TravelEventSource.DECISION_OS,
    schemaVersion: TRAVEL_EVENT_CAUSALITY_SCHEMA_VERSION,
    payload,
    userId,
    timestamp,
    requestId,
    metadata: {
      causality_schema: record.schema,
      digest: createHash('sha256')
        .update(JSON.stringify({ causality_id: record.causality_id, schema: record.schema }))
        .digest('hex')
        .slice(0, 16),
    },
  };
}
