import { buildHarnessAdminDiagnosticsSnapshot } from '../utils/harness-admin-diagnostics.util';

describe('harness-admin-diagnostics.util', () => {
  it('merges harness metrics with shadow grader snapshot', () => {
    const snap = buildHarnessAdminDiagnosticsSnapshot({
      harness: {
        shadow_checks_total: 3,
        consecutive_success_count: 2,
        by_stage_status: { 'RESEARCH|PASSED': 3 },
      },
      shadowGrader: {
        enabled: true,
        active_shadow_version: 'shadow-task-a',
        in_flight_count: 0,
        trajectory_capture_enabled: true,
        ops_readiness: {
          ready: true,
          blockers: [],
          grader_enabled: true,
          trajectory_capture_enabled: true,
        },
        registrations: [
          {
            shadow_version: 'shadow-task-a',
            task_id: 'task-a',
            lifecycle: 'ACTIVE',
            registered_at: '2026-01-01T00:00:00.000Z',
            lora_loaded: true,
          },
        ],
        aggregate: {
          sampleCount: 10,
          shadowWinRate: 0.6,
          promotionReady: false,
          promotionBlockers: ['samples_10_lt_1000'],
          productionSafetyPassRate: 1,
          shadowSafetyPassRate: 0.9,
        },
      },
      costGovernance: {
        token_quota_enabled: true,
        user_daily_limit: 200000,
        org_daily_limit: 2000000,
        global_daily_limit: 0,
        session_token_cap: 8000,
      },
    });
    expect(snap.shadow_checks_total).toBe(3);
    expect(snap.cost_governance?.session_token_cap).toBe(8000);
    expect(snap.cost_history).toBeNull();
    expect(snap.shadow_grader?.active_shadow_version).toBe('shadow-task-a');
    expect(snap.shadow_grader?.aggregate?.sampleCount).toBe(10);
    expect(snap.kernel_hard.consecutive_success_count).toBe(2);
    expect(snap.kernel_hard.enabled).toBe(false);
    expect(snap.quality_loop).toBeNull();
    expect(snap.shadow_harness).toBeNull();
    expect(snap.llm_routing).toBeNull();
  });
});
