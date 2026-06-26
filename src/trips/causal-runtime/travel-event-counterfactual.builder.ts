import { createHash } from 'node:crypto';
import {
  TravelEventSource,
  TravelEventType,
  TrajectorySegment,
  type TravelEventEnvelope,
} from '../event-store/types/travel-event.types';
import { eventIdFromIdempotencyKey } from '../event-store/travel-event-idempotency.util';
import type { CausalCounterfactualReport } from './counterfactual/causal-counterfactual.types';

export const TRAVEL_EVENT_COUNTERFACTUAL_SCHEMA_VERSION = 1;

export function buildCounterfactualIdempotencyKey(
  tripId: string,
  causalityId: string,
): string {
  return [tripId, TravelEventType.TRIP_DECISION_CAUSALITY_OUTCOME_RECORDED, causalityId].join('|');
}

export function buildCounterfactualTravelEventEnvelope(input: {
  tripId: string;
  report: CausalCounterfactualReport;
  requestId?: string;
  userId?: string;
  timestamp?: string;
}): TravelEventEnvelope {
  const { tripId, report, requestId, userId } = input;
  const timestamp = input.timestamp ?? report.recorded_at;
  const idempotencyKey = buildCounterfactualIdempotencyKey(tripId, report.causality_id);

  return {
    eventId: eventIdFromIdempotencyKey(idempotencyKey),
    idempotencyKey,
    tripId,
    segment: TrajectorySegment.RESULT,
    eventType: TravelEventType.TRIP_DECISION_CAUSALITY_OUTCOME_RECORDED,
    source: TravelEventSource.DECISION_OS,
    schemaVersion: TRAVEL_EVENT_COUNTERFACTUAL_SCHEMA_VERSION,
    payload: {
      causality_id: report.causality_id,
      schema: report.schema,
      predicted_metrics: report.predictedMetrics,
      observed_metrics: report.observedMetrics,
      metric_deltas: report.metricDeltas,
      drift: report.drift,
      confidence_after: report.confidenceAfter,
      iceland_calibration: report.icelandCalibration,
      user_facing_assessment: report.userFacingAssessment,
    },
    userId,
    timestamp,
    requestId,
    metadata: {
      digest: createHash('sha256')
        .update(JSON.stringify({ causality_id: report.causality_id, schema: report.schema }))
        .digest('hex')
        .slice(0, 16),
    },
  };
}
