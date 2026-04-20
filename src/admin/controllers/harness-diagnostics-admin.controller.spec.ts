import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HarnessDiagnosticsAdminController } from './harness-diagnostics-admin.controller';
import { HarnessShadowMetricsCollector } from '../../decision/kernel/harness-shadow-metrics.collector';

describe('HarnessDiagnosticsAdminController', () => {
  let collector: HarnessShadowMetricsCollector;
  let ctrl: HarnessDiagnosticsAdminController;

  beforeEach(() => {
    collector = new HarnessShadowMetricsCollector();
    ctrl = new HarnessDiagnosticsAdminController(collector);
  });

  afterEach(() => {
    delete process.env.ADMIN_DIAGNOSTICS_HARNESS_ENABLED;
    delete process.env.ADMIN_DIAGNOSTICS_TOKEN;
  });

  function req(headers: Record<string, string>): any {
    return { headers };
  }

  it('returns 404 when diagnostics disabled', () => {
    expect(() => ctrl.getHarnessSnapshot(req({}), undefined)).toThrow(NotFoundException);
  });

  it('returns 403 when enabled but token not configured', () => {
    process.env.ADMIN_DIAGNOSTICS_HARNESS_ENABLED = '1';
    expect(() => ctrl.getHarnessSnapshot(req({}), 'x')).toThrow(ForbiddenException);
  });

  it('returns snapshot when token matches header', () => {
    process.env.ADMIN_DIAGNOSTICS_HARNESS_ENABLED = '1';
    process.env.ADMIN_DIAGNOSTICS_TOKEN = 'secret-test';
    collector.recordShadowCheck({
      kernel_phase: 'RESEARCH',
      harness_step: 'RESEARCH',
      status: 'PASSED',
      validation_results: [{ passed: true, severity: 'L1', code: 'OK', message: 'ok' }],
    });
    const snap = ctrl.getHarnessSnapshot(req({}), 'secret-test');
    expect(snap.shadow_checks_total).toBe(1);
    expect(snap.consecutive_success_count).toBe(1);
  });

  it('accepts Bearer token', () => {
    process.env.ADMIN_DIAGNOSTICS_HARNESS_ENABLED = '1';
    process.env.ADMIN_DIAGNOSTICS_TOKEN = 'tok2';
    const snap = ctrl.getHarnessSnapshot(
      req({ authorization: 'Bearer tok2' }),
      undefined,
    );
    expect(snap).toBeDefined();
  });
});
