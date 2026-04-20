import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DoneVerifyDiagnosticsAdminController } from './done-verify-diagnostics-admin.controller';
import { recordDoneVerifyGuardrailOutcome, resetDoneVerifyMetricsForTests } from '../../agent/guards/done-verify-metrics';

describe('DoneVerifyDiagnosticsAdminController', () => {
  let ctrl: DoneVerifyDiagnosticsAdminController;

  beforeEach(() => {
    ctrl = new DoneVerifyDiagnosticsAdminController();
    resetDoneVerifyMetricsForTests();
  });

  afterEach(() => {
    delete process.env.ADMIN_DIAGNOSTICS_DONE_VERIFY_ENABLED;
    delete process.env.ADMIN_DIAGNOSTICS_TOKEN;
  });

  function req(headers: Record<string, string>): any {
    return { headers };
  }

  it('returns 404 when diagnostics disabled', () => {
    expect(() => ctrl.getDoneVerifySnapshot(req({}), undefined)).toThrow(NotFoundException);
  });

  it('returns 403 when enabled but token not configured', () => {
    process.env.ADMIN_DIAGNOSTICS_DONE_VERIFY_ENABLED = '1';
    expect(() => ctrl.getDoneVerifySnapshot(req({}), 'x')).toThrow(ForbiddenException);
  });

  it('returns diagnostics when token matches', () => {
    process.env.ADMIN_DIAGNOSTICS_DONE_VERIFY_ENABLED = '1';
    process.env.ADMIN_DIAGNOSTICS_TOKEN = 'secret-dv';
    recordDoneVerifyGuardrailOutcome('steps_ok');
    const body = ctrl.getDoneVerifySnapshot(req({}), 'secret-dv');
    expect(body.done_verify_steps_ok_total).toBe(1);
    expect(body.rates.sample_total).toBe(1);
    expect(body.rates.steps_ok_rate).toBe(1);
  });

  it('accepts Bearer token', () => {
    process.env.ADMIN_DIAGNOSTICS_DONE_VERIFY_ENABLED = '1';
    process.env.ADMIN_DIAGNOSTICS_TOKEN = 'tok-dv';
    const body = ctrl.getDoneVerifySnapshot(req({ authorization: 'Bearer tok-dv' }), undefined);
    expect(body.rates.sample_total).toBe(0);
  });
});
