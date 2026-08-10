import {
  computeResumeHarnessEntryFromLast,
  isExistingTripRouteOrderOptimizationRequest,
  isKernelEnabled,
  isKernelEnabledForRequest,
  kernelCreateInitialOpts,
  violationTypeToCn,
} from './kernel-execution-flags.runner';
import type { KernelExecutionFlagsHost } from './kernel-execution-flags.host';
import { HarnessStepName } from '../../harness/contracts/harness-step.types';

describe('kernel-execution-flags.runner', () => {
  it('isKernelEnabled respects DECISION_KERNEL_ENABLED', () => {
    const host = {
      configService: { get: () => 'false' },
    } as unknown as KernelExecutionFlagsHost;
    expect(isKernelEnabled(host)).toBe(false);
  });

  it('isKernelEnabledForRequest respects master switch', () => {
    const host = {
      configService: { get: (k: string) => (k === 'DECISION_KERNEL_ENABLED' ? 'false' : undefined) },
    } as unknown as KernelExecutionFlagsHost;
    expect(
      isKernelEnabledForRequest(host, { request_id: 'r1', user_id: 'u1' }),
    ).toBe(false);
  });

  it('kernelCreateInitialOpts carries plan_version and userId', () => {
    const opts = kernelCreateInitialOpts(
      { request_id: 'r1', user_id: 'u1', meta: { run_id: 'run-1' } } as any,
      { plan_version: 3, metadata: {} } as any,
    );
    expect(opts.evaluationRunId).toBe('run-1');
    expect(opts.orchestratorPlanVersion).toBe(3);
    expect(opts.userId).toBe('u1');
  });

  it('computeResumeHarnessEntryFromLast advances pipeline', () => {
    expect(computeResumeHarnessEntryFromLast()).toBe(HarnessStepName.INTAKE);
    expect(computeResumeHarnessEntryFromLast(HarnessStepName.INTAKE)).toBe(
      HarnessStepName.RESEARCH,
    );
    expect(computeResumeHarnessEntryFromLast(HarnessStepName.VERIFY)).toBe(
      HarnessStepName.REPAIR,
    );
  });

  it('violationTypeToCn maps known types', () => {
    expect(violationTypeToCn('SAFETY')).toBe('安全类');
    expect(violationTypeToCn('CUSTOM')).toBe('CUSTOM');
  });

  it('detects route-order optimization intent', () => {
    expect(
      isExistingTripRouteOrderOptimizationRequest({
        trip_plan_request: { trip_id: 't1', message: '请优化路线顺序' },
        metadata: {},
      } as any),
    ).toBe(true);
    expect(
      isExistingTripRouteOrderOptimizationRequest({
        trip_plan_request: { message: '请优化路线顺序' },
        metadata: {},
      } as any),
    ).toBe(false);
  });
});
