import { HarnessShadowMetricsCollector } from './harness-shadow-metrics.collector';

describe('HarnessShadowMetricsCollector', () => {
  afterEach(() => {
    delete process.env.HARNESS_SHADOW_METRICS_DISABLED;
    delete process.env.HARNESS_SHADOW_CONSECUTIVE_THRESHOLD;
  });

  it('increments consecutive on PASSED and resets on BLOCKED', () => {
    const c = new HarnessShadowMetricsCollector();
    c.recordShadowCheck({
      kernel_phase: 'RESEARCH',
      harness_step: 'RESEARCH',
      status: 'PASSED',
      validation_results: [{ passed: true, severity: 'L1', code: 'OK', message: 'ok' }],
    });
    expect(c.getConsecutiveSuccessCount()).toBe(1);
    c.recordShadowCheck({
      kernel_phase: 'GATE_EVAL',
      harness_step: 'GATE_EVAL',
      status: 'BLOCKED',
      validation_results: [{ passed: false, severity: 'L3', code: 'X', message: 'block' }],
    });
    expect(c.getConsecutiveSuccessCount()).toBe(0);
    const snap = c.getSnapshot();
    expect(snap.shadow_checks_total).toBe(2);
    expect(snap.by_stage_status['RESEARCH|PASSED']).toBe(1);
    expect(snap.by_stage_status['GATE_EVAL|BLOCKED']).toBe(1);
  });

  it('resets consecutive on L3 validation failure even if status FAILED', () => {
    const c = new HarnessShadowMetricsCollector();
    c.recordShadowCheck({
      kernel_phase: 'VERIFY',
      harness_step: 'VERIFY',
      status: 'FAILED',
      validation_results: [{ passed: false, severity: 'L3', code: 'V', message: 'nope' }],
    });
    expect(c.getConsecutiveSuccessCount()).toBe(0);
  });

  it('respects HARNESS_SHADOW_METRICS_DISABLED', () => {
    process.env.HARNESS_SHADOW_METRICS_DISABLED = '1';
    const c = new HarnessShadowMetricsCollector();
    c.recordShadowCheck({
      kernel_phase: 'RESEARCH',
      harness_step: 'RESEARCH',
      status: 'PASSED',
      validation_results: [],
    });
    expect(c.getSnapshot().shadow_checks_total).toBe(0);
  });
});
