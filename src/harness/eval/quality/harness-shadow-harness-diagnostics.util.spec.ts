import { buildHarnessShadowHarnessAdminSnapshot } from './harness-shadow-harness-diagnostics.util';

describe('harness-shadow-harness-diagnostics.util', () => {
  it('computes non-pass rate from by_stage_status', () => {
    const snap = buildHarnessShadowHarnessAdminSnapshot({
      env: { HARNESS_SHADOW_AFTER_PHASE: '1' },
      metrics: {
        shadow_checks_total: 10,
        consecutive_success_count: 8,
        by_stage_status: {
          'RESEARCH|PASSED': 8,
          'VERIFY|FAILED': 2,
        },
      },
    });
    expect(snap.non_pass_checks_total).toBe(2);
    expect(snap.non_pass_rate).toBe(0.2);
    expect(snap.enabled).toBe(true);
  });
});
