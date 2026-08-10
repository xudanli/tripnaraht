import { maybeInterceptDegradedTransportEvidence } from './degraded-transport-intercept.runner';
import type { DegradedTransportInterceptHost } from './degraded-transport-intercept.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('degraded-transport-intercept.runner', () => {
  it('returns undefined without research_data', () => {
    const host: DegradedTransportInterceptHost = {
      maybeSnapshot: jest.fn(),
      buildClarificationResult: jest.fn(() => ({}) as any),
    };
    const state = { metadata: {} } as unknown as OrchestratorState;
    expect(
      maybeInterceptDegradedTransportEvidence(host, state, undefined, Date.now(), {} as any),
    ).toBeUndefined();
  });

  it('returns undefined when transport evidence does not want clarify', () => {
    const host: DegradedTransportInterceptHost = {
      maybeSnapshot: jest.fn(),
      buildClarificationResult: jest.fn(() => ({}) as any),
    };
    const state = {
      research_data: { transport_evidence: { degraded: false, missing: false } },
      metadata: {},
      clarification_questions: [],
      decision_log: [],
    } as unknown as OrchestratorState;
    expect(
      maybeInterceptDegradedTransportEvidence(host, state, undefined, Date.now(), {} as any),
    ).toBeUndefined();
  });
});
