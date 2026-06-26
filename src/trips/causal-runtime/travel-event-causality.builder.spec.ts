import { TrajectorySegment, TravelEventSource, TravelEventType } from '../event-store/types/travel-event.types';
import { DECISION_CAUSALITY_SCHEMA_V1 } from './decision-causality-v1.types';
import { buildDecisionCausalityTravelEventEnvelope } from './travel-event-causality.builder';

describe('travel-event-causality.builder', () => {
  it('builds DECISION segment envelope with causal_decision payload', () => {
    const envelope = buildDecisionCausalityTravelEventEnvelope({
      tripId: 'trip-abc',
      record: {
        schema: DECISION_CAUSALITY_SCHEMA_V1,
        causality_id: 'dc_evt_1',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:00:01.000Z',
        tick_kind: 'generate_plan',
        reality: { region: 'IS' },
        policy_engine: { verdict: 'ALLOW', codes: [], reasons: [] },
        execution_gate: { type: 'ALLOW' },
        plan_execution: { phase: 'completed', plan_days: 3 },
        causal_decision: {
          schema: 'tripnara/causal-decision-tuple/v1',
          context: {
            schema: 'tripnara/causal-decision-tuple/v1',
            causality_id: 'dc_evt_1',
            tick_kind: 'generate_plan',
            recorded_at: '2026-01-01T00:00:01.000Z',
          },
          alternatives: [],
        },
      },
      requestId: 'req_1',
    });

    expect(envelope.segment).toBe(TrajectorySegment.DECISION);
    expect(envelope.eventType).toBe(TravelEventType.TRIP_DECISION_CAUSALITY_RECORDED);
    expect(envelope.source).toBe(TravelEventSource.DECISION_OS);
    expect(envelope.payload.causality_id).toBe('dc_evt_1');
    expect(envelope.payload.causal_decision).toBeDefined();
    expect(envelope.idempotencyKey).toContain('dc_evt_1');
  });
});
