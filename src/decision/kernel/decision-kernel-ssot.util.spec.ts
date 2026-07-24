import {
  buildLegacyEngineSsotBlockPayload,
  isDecisionKernelSsotEnabledFromEnv,
  isLegacyTripEngineHttpBlocked,
  resolveLegacyEngineBypass,
} from './decision-kernel-ssot.util';

describe('decision-kernel-ssot.util (PR-4)', () => {
  const prevSsot = process.env.DECISION_KERNEL_SSOT;
  const prevKernel = process.env.DECISION_KERNEL_ENABLED;

  afterEach(() => {
    if (prevSsot === undefined) delete process.env.DECISION_KERNEL_SSOT;
    else process.env.DECISION_KERNEL_SSOT = prevSsot;
    if (prevKernel === undefined) delete process.env.DECISION_KERNEL_ENABLED;
    else process.env.DECISION_KERNEL_ENABLED = prevKernel;
  });

  it('blocks legacy HTTP when SSOT enabled and no bypass header', () => {
    process.env.DECISION_KERNEL_SSOT = '1';
    expect(isLegacyTripEngineHttpBlocked({})).toBe(true);
  });

  it('allows bypass for replay header', () => {
    process.env.DECISION_KERNEL_SSOT = '1';
    expect(isLegacyTripEngineHttpBlocked({ 'x-legacy-engine-bypass': 'replay' })).toBe(false);
    expect(resolveLegacyEngineBypass({ 'x-legacy-engine-bypass': 'replay' })).toBe('replay');
  });

  it('respects DECISION_KERNEL_SSOT=0 even when kernel enabled', () => {
    process.env.DECISION_KERNEL_ENABLED = 'true';
    process.env.DECISION_KERNEL_SSOT = '0';
    expect(isDecisionKernelSsotEnabledFromEnv()).toBe(false);
    expect(isLegacyTripEngineHttpBlocked({})).toBe(false);
  });

  it('buildLegacyEngineSsotBlockPayload names authoritative path', () => {
    const p = buildLegacyEngineSsotBlockPayload();
    expect(p.code).toBe('LEGACY_ENGINE_SSOT_BLOCKED');
    expect(p.authoritativePath).toContain('route_and_run');
  });
});
