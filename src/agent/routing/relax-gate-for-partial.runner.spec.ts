import {
  isDateOnlyDataMissingViolation,
  relaxGateForPartialIfEligible,
} from './relax-gate-for-partial.runner';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('relax-gate-for-partial.runner', () => {
  it('recognizes date-only DATA_MISSING', () => {
    expect(
      isDateOnlyDataMissingViolation([{ type: 'DATA_MISSING', detail: '缺少 date_range' }]),
    ).toBe(true);
  });

  it('downgrades BLOCK gate under allow_partial', () => {
    const state = {
      request_id: 'r1',
      decision_log: [],
      metadata: { allow_partial: true },
      gate_result: {
        gate_result: 'BLOCK',
        violations: [{ type: 'DATA_MISSING', detail: '缺少日期' }],
        required_adjustments: [],
      },
    } as unknown as OrchestratorState;
    relaxGateForPartialIfEligible(state);
    expect(state.gate_result?.gate_result).toBe('ADJUST_REQUIRED');
    expect(state.metadata.gate_relaxed_for_partial).toBe(true);
  });
});
