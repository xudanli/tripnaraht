import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HarnessDiagnosticsAdminController } from './harness-diagnostics-admin.controller';
import { HarnessShadowMetricsCollector } from '../../decision/kernel/harness-shadow-metrics.collector';
import type { HarnessShadowGraderService } from '../../agent/training/services/harness-shadow-grader.service';
import type { ShadowDeploymentWorkflowService } from '../../agent/training/services/shadow-deployment-workflow.service';

describe('HarnessDiagnosticsAdminController', () => {
  let collector: HarnessShadowMetricsCollector;
  let ctrl: HarnessDiagnosticsAdminController;
  let shadowGrader: Pick<HarnessShadowGraderService, 'buildAdminDiagnosticsSnapshot'>;
  let shadowDeployment: Pick<ShadowDeploymentWorkflowService, 'registerShadowAdapter'>;

  beforeEach(() => {
    collector = new HarnessShadowMetricsCollector();
    shadowGrader = {
      buildAdminDiagnosticsSnapshot: () => ({
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
        registrations: [],
        aggregate: {
          sampleCount: 5,
          shadowWinRate: 0.5,
          promotionReady: false,
          promotionBlockers: ['samples_5_lt_1000'],
          productionSafetyPassRate: 1,
          shadowSafetyPassRate: 0.8,
        },
      }),
    };
    shadowDeployment = {
      registerShadowAdapter: jest.fn().mockResolvedValue({
        shadowVersion: 'shadow-task-a',
        loraLoaded: true,
      }),
    };
    ctrl = new HarnessDiagnosticsAdminController(
      collector,
      shadowGrader as HarnessShadowGraderService,
      shadowDeployment as ShadowDeploymentWorkflowService,
    );
  });

  afterEach(() => {
    delete process.env.ADMIN_DIAGNOSTICS_HARNESS_ENABLED;
    delete process.env.ADMIN_DIAGNOSTICS_TOKEN;
    delete process.env.HARNESS_SHADOW_AFTER_PHASE;
    delete process.env.HARNESS_SHADOW_METRICS_DISABLED;
  });

  function req(headers: Record<string, string>): any {
    return { headers };
  }

  it('returns 404 when diagnostics disabled', async () => {
    await expect(ctrl.getHarnessSnapshot(req({}), undefined)).rejects.toThrow(NotFoundException);
  });

  it('returns 403 when enabled but token not configured', async () => {
    process.env.ADMIN_DIAGNOSTICS_HARNESS_ENABLED = '1';
    await expect(ctrl.getHarnessSnapshot(req({}), 'x')).rejects.toThrow(ForbiddenException);
  });

  it('returns snapshot when token matches header', async () => {
    process.env.ADMIN_DIAGNOSTICS_HARNESS_ENABLED = '1';
    process.env.ADMIN_DIAGNOSTICS_TOKEN = 'secret-test';
    process.env.HARNESS_SHADOW_AFTER_PHASE = '1';
    delete process.env.HARNESS_SHADOW_METRICS_DISABLED;
    collector.recordShadowCheck({
      kernel_phase: 'RESEARCH',
      harness_step: 'RESEARCH',
      status: 'PASSED',
      validation_results: [{ passed: true, severity: 'L1', code: 'OK', message: 'ok' }],
    });
    const snap = await ctrl.getHarnessSnapshot(req({}), 'secret-test');
    expect(snap.shadow_checks_total).toBe(1);
    expect(snap.consecutive_success_count).toBe(1);
    expect(snap.shadow_grader?.active_shadow_version).toBe('shadow-task-a');
    expect(snap.shadow_harness?.shadow_checks_total).toBe(1);
    expect(snap.shadow_harness?.ops_readiness.ready).toBe(true);
    expect(snap.llm_routing).toBeNull();
  });

  it('accepts Bearer token', async () => {
    process.env.ADMIN_DIAGNOSTICS_HARNESS_ENABLED = '1';
    process.env.ADMIN_DIAGNOSTICS_TOKEN = 'tok2';
    const snap = await ctrl.getHarnessSnapshot(
      req({ authorization: 'Bearer tok2' }),
      undefined,
    );
    expect(snap).toBeDefined();
  });

  it('registers shadow adapter when token matches', async () => {
    process.env.ADMIN_DIAGNOSTICS_HARNESS_ENABLED = '1';
    process.env.ADMIN_DIAGNOSTICS_TOKEN = 'secret-test';
    const result = await ctrl.registerShadowGraderAdapter(
      req({}),
      'secret-test',
      { task_id: 'task-a', adapter_path: '/app/outputs/task-a' },
    );
    expect(result.shadow_version).toBe('shadow-task-a');
    expect(shadowDeployment.registerShadowAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-a', adapterPath: '/app/outputs/task-a' }),
    );
  });
});
