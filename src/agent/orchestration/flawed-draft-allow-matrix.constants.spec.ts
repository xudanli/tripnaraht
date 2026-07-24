import {
  FLAWED_DRAFT_ALLOW_MATRIX_VERSION,
  classifyHardGateViolation,
  isFlawedDraftForbidden,
} from './flawed-draft-allow-matrix.constants';
import type { GateResult } from '../interfaces/trip-plan.interface';

describe('flawed-draft-allow-matrix', () => {
  it('freezes version', () => {
    expect(FLAWED_DRAFT_ALLOW_MATRIX_VERSION).toBe('1.0.0');
  });

  it('forbids HARD SAFETY even with opt-in', () => {
    const gate: GateResult = {
      gate_result: 'ADJUST_REQUIRED',
      violations: [
        { type: 'SAFETY', severity: 'HARD', detail: 'storm risk on F-road' },
      ],
      required_adjustments: [],
      confidence: 0.4,
      evidence_refs: [],
    };
    expect(classifyHardGateViolation(gate.violations[0])).toBe('safety');
    expect(isFlawedDraftForbidden({ gateResult: gate }).forbidden).toBe(true);
  });

  it('allows soft FATIGUE-only for flawed path', () => {
    const gate: GateResult = {
      gate_result: 'ADJUST_REQUIRED',
      violations: [{ type: 'FATIGUE', severity: 'SOFT', detail: 'day too dense' }],
      required_adjustments: [],
      confidence: 0.7,
      evidence_refs: [],
    };
    expect(isFlawedDraftForbidden({ gateResult: gate }).forbidden).toBe(false);
  });

  it('forbids TIME_WINDOW verify issue codes', () => {
    const r = isFlawedDraftForbidden({
      gateResult: null,
      verifyIssueCodes: ['TIME_WINDOW_OVERLAP'],
    });
    expect(r.forbidden).toBe(true);
    expect(r.hits[0].category).toBe('hard_time_window');
  });
});
