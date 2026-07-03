import {
  EffectivePlanWriteBypassError,
  EffectivePlanWriteGuardService,
} from './effective-plan-write-guard.service';
import {
  getRecentEffectivePlanWriteGuardShadowEvents,
  resetEffectivePlanWriteGuardShadowEventsForTests,
} from './effective-plan-write-guard-shadow.util';

describe('EffectivePlanWriteGuardService', () => {
  const original = process.env.EFFECTIVE_PLAN_WRITE_GUARD;

  afterEach(() => {
    if (original === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_GUARD;
    else process.env.EFFECTIVE_PLAN_WRITE_GUARD = original;
    resetEffectivePlanWriteGuardShadowEventsForTests();
  });

  it('blocks setEffective outside execute context when guard ENFORCE', () => {
    process.env.EFFECTIVE_PLAN_WRITE_GUARD = 'ENFORCE';
    const guard = new EffectivePlanWriteGuardService();
    expect(() => guard.assertSetEffectiveAllowed('test')).toThrow(EffectivePlanWriteBypassError);
  });

  it('allows setEffective outside execute context when guard SHADOW and records bypass', () => {
    process.env.EFFECTIVE_PLAN_WRITE_GUARD = 'SHADOW';
    const guard = new EffectivePlanWriteGuardService();
    expect(() => guard.assertSetEffectiveAllowed('test')).not.toThrow();
    const recent = getRecentEffectivePlanWriteGuardShadowEvents();
    expect(recent.total).toBe(1);
    expect(recent.events[0]?.caller).toBe('test');
    expect(recent.events[0]?.wouldBlock).toBe(true);
  });

  it('allows setEffective inside execute context', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_GUARD = 'ENFORCE';
    const guard = new EffectivePlanWriteGuardService();
    await guard.runWithAuthority('execute', async () => {
      expect(() => guard.assertSetEffectiveAllowed('execute')).not.toThrow();
    });
  });

  it('no-op when guard disabled', () => {
    delete process.env.EFFECTIVE_PLAN_WRITE_GUARD;
    const guard = new EffectivePlanWriteGuardService();
    expect(() => guard.assertSetEffectiveAllowed('test')).not.toThrow();
  });
});
