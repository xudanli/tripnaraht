import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { ensureHarnessPlanningInputsOnDecisionState } from './plan-gen-harness-input.util';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('plan-gen-harness-input.util', () => {
  it('projects gate_result from orchestrator into DSO constraints', () => {
    const state = {
      request_id: 'req-1',
      gate_result: {
        gate_result: 'ALLOW' as const,
        violations: [],
        required_adjustments: [],
        confidence: 0.9,
        evidence_refs: [],
      },
      trip_plan_request: { request_id: 'req-1', origin: 'RVK', destination: 'IS', trip_id: 't1' },
    } as OrchestratorState;
    const dso = { userIntent: {}, systemState: { requestId: 'req-1' } } as DecisionState;
    const out = ensureHarnessPlanningInputsOnDecisionState(dso, state);
    expect(out?.constraints?.gateOutcome).toBe('ALLOW');
  });

  it('allows bound trip when route_and_run_intent is ITINERARY_ADJUST', () => {
    const state = {
      request_id: 'req-1',
      metadata: {
        route_and_run_intent: { primary: 'ITINERARY_ADJUST', sub_signals: {}, slot_placement_requested: false, intake_nl: '' },
        tripId: 't1',
      },
      trip_plan_request: { request_id: 'req-1', origin: 'RVK', destination: 'IS', trip_id: 't1' },
    } as OrchestratorState;
    const dso = { userIntent: {}, systemState: { requestId: 'req-1' } } as DecisionState;
    expect(ensureHarnessPlanningInputsOnDecisionState(dso, state)?.constraints?.gateOutcome).toBe('ALLOW');
  });
});
