import { attachTravelCausalDecisionFromTrace } from './attach-travel-causal-decision-from-trace.util';
import { CANONICAL_CAUSAL_TRACE_SCHEMA } from '../../../causal-protocol/causal-trace.types';
import { buildStrongWindAppointmentFixture } from '../../../travel-causal-decision';

describe('attachTravelCausalDecisionFromTrace', () => {
  it('returns empty when trace has no decision', () => {
    expect(
      attachTravelCausalDecisionFromTrace({
        schema: CANONICAL_CAUSAL_TRACE_SCHEMA,
        traceId: 'ct_1',
        tripId: 't1',
        worldStateVersion: 'ws',
        createdAt: '2026-07-17T00:00:00.000Z',
        updatedAt: '2026-07-17T00:00:00.000Z',
        trigger: { type: 'x', source: 'y', observedAt: '2026-07-17T00:00:00.000Z' },
        facts: [],
        effects: [],
        problems: [],
        options: [],
        status: 'PREVIEW',
      }),
    ).toEqual({});
  });

  it('projects decision card from TravelCausalDecision', () => {
    const decision = buildStrongWindAppointmentFixture();
    const attached = attachTravelCausalDecisionFromTrace({
      schema: CANONICAL_CAUSAL_TRACE_SCHEMA,
      traceId: 'ct_1',
      tripId: decision.tripId,
      worldStateVersion: 'ws',
      createdAt: decision.createdAt,
      updatedAt: decision.createdAt,
      trigger: { type: 'x', source: 'y', observedAt: decision.createdAt },
      facts: [],
      effects: [],
      problems: [],
      options: [],
      status: 'PREVIEW',
      travelCausalDecision: decision,
    });
    expect(attached.travelCausalDecision?.decisionId).toBe(decision.decisionId);
    expect(attached.causalDecisionCard?.interventionDeadline).toBe(
      decision.temporalForecast.interventionDeadline,
    );
    expect(attached.causalDecisionCard?.whyItMatters.length).toBeGreaterThan(0);
  });
});
