import {
  deriveExternalVerdict,
  shouldIntakeClarifyShortCircuit,
} from './external-verdict.util';
import type { GateResult, OrchestratorState } from '../interfaces/trip-plan.interface';

describe('deriveExternalVerdict', () => {
  it('maps Gate ALLOW to ALLOW', () => {
    const gateResult: GateResult = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 1,
    };
    expect(
      deriveExternalVerdict({ gateResult, orchestrationSuccess: true }),
    ).toBe('ALLOW');
  });

  it('maps Gate BLOCK to REJECT', () => {
    const gateResult: GateResult = {
      gate_result: 'BLOCK',
      violations: [],
      required_adjustments: [],
      confidence: 0.9,
    };
    expect(deriveExternalVerdict({ gateResult })).toBe('REJECT');
  });

  it('maps Gate ADJUST_REQUIRED to ADJUST', () => {
    const gateResult: GateResult = {
      gate_result: 'ADJUST_REQUIRED',
      violations: [],
      required_adjustments: [],
      confidence: 0.8,
    };
    expect(deriveExternalVerdict({ gateResult })).toBe('ADJUST');
  });

  it('maps Gate NEED_USER_CONFIRM to CLARIFY', () => {
    const gateResult: GateResult = {
      gate_result: 'NEED_USER_CONFIRM',
      violations: [],
      required_adjustments: [],
      confidence: 0.7,
    };
    expect(deriveExternalVerdict({ gateResult })).toBe('CLARIFY');
  });

  it('Gate BLOCK overrides Policy ALLOW', () => {
    const gateResult: GateResult = {
      gate_result: 'BLOCK',
      violations: [],
      required_adjustments: [],
      confidence: 0.9,
    };
    expect(
      deriveExternalVerdict({ gateResult, policyAction: 'ALLOW' }),
    ).toBe('REJECT');
  });

  it('Gate ALLOW + Policy REJECT -> REJECT', () => {
    const gateResult: GateResult = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 1,
    };
    expect(
      deriveExternalVerdict({ gateResult, policyAction: 'REJECT' }),
    ).toBe('REJECT');
  });

  it('Gate ADJUST_REQUIRED + Policy CLARIFY -> CLARIFY', () => {
    const gateResult: GateResult = {
      gate_result: 'ADJUST_REQUIRED',
      violations: [],
      required_adjustments: [],
      confidence: 0.8,
    };
    expect(
      deriveExternalVerdict({ gateResult, policyAction: 'CLARIFY' }),
    ).toBe('CLARIFY');
  });

  it('intake clarify short-circuit wins', () => {
    const gateResult: GateResult = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 1,
    };
    expect(
      deriveExternalVerdict({
        gateResult,
        intakeClarifyShortCircuit: true,
      }),
    ).toBe('CLARIFY');
  });

  it('without gate uses policyAction when present', () => {
    expect(
      deriveExternalVerdict({ policyAction: 'ADJUST', orchestrationSuccess: true }),
    ).toBe('ADJUST');
  });

  it('without gate uses needsUserConfirmation -> CLARIFY', () => {
    expect(
      deriveExternalVerdict({
        needsUserConfirmation: true,
        orchestrationSuccess: false,
      }),
    ).toBe('CLARIFY');
  });

  it('without gate uses orchestrationSuccess -> ALLOW', () => {
    expect(deriveExternalVerdict({ orchestrationSuccess: true })).toBe('ALLOW');
  });

  it('without gate failure -> REJECT', () => {
    expect(
      deriveExternalVerdict({ orchestrationSuccess: false }),
    ).toBe('REJECT');
  });
});

describe('shouldIntakeClarifyShortCircuit', () => {
  it('true when HARD gap + questions and no gate_result', () => {
    const state: OrchestratorState = {
      request_id: 'r1',
      current_step: 'INTAKE',
      gaps: [{ type: 'MISSING_DATES', severity: 'HARD', detail: 'x' }],
      clarification_questions: [{ id: 'q1', question: 'When?', type: 'text' }],
    };
    expect(shouldIntakeClarifyShortCircuit(state)).toBe(true);
  });

  it('false when gate_result already present', () => {
    const state: OrchestratorState = {
      request_id: 'r1',
      current_step: 'GATE_EVAL',
      gaps: [{ type: 'MISSING_DATES', severity: 'HARD', detail: 'x' }],
      clarification_questions: [{ id: 'q1', question: 'When?', type: 'text' }],
      gate_result: {
        gate_result: 'NEED_USER_CONFIRM',
        violations: [],
        required_adjustments: [],
        confidence: 0.5,
      },
    };
    expect(shouldIntakeClarifyShortCircuit(state)).toBe(false);
  });
});
