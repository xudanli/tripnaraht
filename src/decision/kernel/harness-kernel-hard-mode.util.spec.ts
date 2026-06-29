import {
  buildHarnessKernelHardDiagnosticsSnapshot,
  parseHarnessKernelHardEnabled,
  parseHarnessKernelShadowStrictEnabled,
  parseHarnessShadowAfterPhaseEnabled,
} from './harness-kernel-hard-mode.util';

describe('harness-kernel-hard-mode.util', () => {
  it('HARNESS_KERNEL_HARD enables shadow after phase and strict', () => {
    const env = { HARNESS_KERNEL_HARD: '1' };
    expect(parseHarnessKernelHardEnabled(env)).toBe(true);
    expect(parseHarnessShadowAfterPhaseEnabled(env)).toBe(true);
    expect(parseHarnessKernelShadowStrictEnabled(env)).toBe(true);
  });

  it('sign_off_eligible when shadow metrics meet threshold', () => {
    const snap = buildHarnessKernelHardDiagnosticsSnapshot({
      env: { HARNESS_SHADOW_AFTER_PHASE: '1', HARNESS_SHADOW_CONSECUTIVE_THRESHOLD: '50' },
      shadowMetrics: {
        shadow_checks_total: 120,
        consecutive_success_count: 50,
        by_stage_status: {},
      },
    });
    expect(snap.sign_off_eligible).toBe(true);
    expect(snap.ops_readiness.ready).toBe(true);
  });

  it('blocks sign-off when consecutive below threshold', () => {
    const snap = buildHarnessKernelHardDiagnosticsSnapshot({
      env: { HARNESS_SHADOW_AFTER_PHASE: '1' },
      shadowMetrics: {
        shadow_checks_total: 10,
        consecutive_success_count: 5,
        by_stage_status: {},
      },
    });
    expect(snap.sign_off_eligible).toBe(false);
    expect(snap.ops_readiness.blockers).toContain('consecutive_5_lt_100');
  });
});
