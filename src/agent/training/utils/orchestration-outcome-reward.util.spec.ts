import { computeOrchestrationOutcomeReward } from './orchestration-outcome-reward.util';
import { DECISION_TRAJECTORY_SCHEMA_ID } from '../interfaces/decision-trajectory.types';

describe('computeOrchestrationOutcomeReward', () => {
  const base = {
    schema_id: DECISION_TRAJECTORY_SCHEMA_ID,
    request_id: 'r1',
    input_context: {},
    axiom_gate: { gate_result: 'ALLOW' as const },
    orchestration_steps: [],
  };

  it('returns CRITICAL_FAIL when BLOCK gate but itinerary in final output', () => {
    const r = computeOrchestrationOutcomeReward(
      {
        ...base,
        axiom_gate: { gate_result: 'BLOCK' },
        final_output: { itinerary: { days: [{ day_index: 1, items: [] }] } as any },
      },
      [],
    );
    expect(r.outcome).toBe('CRITICAL_FAIL');
    expect(r.totalReward).toBe(-1);
    expect(r.trainable).toBe(false);
  });

  it('returns GOLDEN for clean ALLOW path with PLAN_GEN', () => {
    const r = computeOrchestrationOutcomeReward(base, [
      {
        request_id: 'r1',
        step: 'PLAN_GEN',
        actor: 'Planner',
        inputs_summary: '',
        outputs_summary: '',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
      },
    ]);
    expect(r.outcome).toBe('GOLDEN');
    expect(r.totalReward).toBe(1);
  });
});
