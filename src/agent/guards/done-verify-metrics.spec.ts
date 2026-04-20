import {
  getDoneVerifyDiagnostics,
  getDoneVerifyMetricsSnapshot,
  recordDoneVerifyGuardrailOutcome,
  resetDoneVerifyMetricsForTests,
} from './done-verify-metrics';

describe('done-verify-metrics', () => {
  beforeEach(() => {
    resetDoneVerifyMetricsForTests();
  });

  it('increments steps_ok and exposes snapshot keys', () => {
    recordDoneVerifyGuardrailOutcome('steps_ok', 'req-a');
    expect(getDoneVerifyMetricsSnapshot()).toEqual({
      done_verify_steps_ok_total: 1,
      done_verify_log_fallback_total: 0,
      done_verify_missing_total: 0,
    });
  });

  it('increments log_fallback and missing independently', () => {
    recordDoneVerifyGuardrailOutcome('log_fallback');
    recordDoneVerifyGuardrailOutcome('missing', 'req-b');
    expect(getDoneVerifyMetricsSnapshot()).toEqual({
      done_verify_steps_ok_total: 0,
      done_verify_log_fallback_total: 1,
      done_verify_missing_total: 1,
    });
  });

  it('getDoneVerifyDiagnostics returns null rates when no samples', () => {
    expect(getDoneVerifyDiagnostics().rates).toEqual({
      sample_total: 0,
      steps_ok_rate: null,
      log_fallback_rate: null,
      missing_rate: null,
    });
  });

  it('getDoneVerifyDiagnostics returns shares that sum to 1', () => {
    recordDoneVerifyGuardrailOutcome('steps_ok');
    recordDoneVerifyGuardrailOutcome('steps_ok');
    recordDoneVerifyGuardrailOutcome('log_fallback');
    const d = getDoneVerifyDiagnostics();
    expect(d.rates.sample_total).toBe(3);
    expect(d.rates.steps_ok_rate).toBeCloseTo(2 / 3);
    expect(d.rates.log_fallback_rate).toBeCloseTo(1 / 3);
    expect(d.rates.missing_rate).toBeCloseTo(0);
    const sum =
      (d.rates.steps_ok_rate ?? 0) + (d.rates.log_fallback_rate ?? 0) + (d.rates.missing_rate ?? 0);
    expect(sum).toBeCloseTo(1);
  });
});
