import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { injectGateRelaxationClarificationIfEligible } from './gate-relaxation-clarification.util';

describe('injectGateRelaxationClarificationIfEligible', () => {
  it('injects gate_eval_relax_constraints on BLOCK with REACHABILITY violation', () => {
    const state = {
      request_id: 'req-1',
      gate_result: {
        gate_result: 'BLOCK' as const,
        violations: [
          {
            type: 'REACHABILITY',
            severity: 'HARD' as const,
            detail: 'Route requires 4x4/4WD, but vehicle_type is 2WD.',
          },
        ],
        required_adjustments: [],
        confidence: 0.9,
      },
      metadata: {},
    } as unknown as OrchestratorState;

    const injected = injectGateRelaxationClarificationIfEligible(state);
    expect(injected).toBe(true);
    expect(state.clarification_questions).toHaveLength(1);
    expect(state.clarification_questions![0].id).toBe('gate_eval_relax_constraints');
    expect(state.clarification_questions![0].options?.some((o) =>
      typeof o === 'object' ? o.value === 'upgrade_vehicle_to_4wd' : false,
    )).toBe(true);
    expect((state.metadata as Record<string, unknown>).blocked).toBe(true);
  });

  it('no-ops when gate is ALLOW', () => {
    const state = {
      gate_result: { gate_result: 'ALLOW' as const, violations: [], required_adjustments: [], confidence: 1 },
      metadata: {},
    } as unknown as OrchestratorState;
    expect(injectGateRelaxationClarificationIfEligible(state)).toBe(false);
    expect(state.clarification_questions).toBeUndefined();
  });

  it('is idempotent when question already present', () => {
    const state = {
      gate_result: {
        gate_result: 'BLOCK' as const,
        violations: [{ type: 'SCOPE', detail: 'too many POIs' }],
        required_adjustments: [],
        confidence: 0.9,
      },
      clarification_questions: [{ id: 'gate_eval_relax_constraints', question: 'q', type: 'single_choice', required: true }],
      metadata: {},
    } as unknown as OrchestratorState;
    expect(injectGateRelaxationClarificationIfEligible(state)).toBe(true);
    expect(state.clarification_questions).toHaveLength(1);
  });
});
