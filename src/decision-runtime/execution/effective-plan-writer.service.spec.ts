import { EffectivePlanWriter } from './effective-plan-writer.service';
import { EffectivePlanWriteGuardService } from './effective-plan-write-guard.service';

describe('EffectivePlanWriter', () => {
  const prev = process.env.EFFECTIVE_PLAN_WRITE_GUARD;
  const prevChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  afterEach(() => {
    if (prev === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_GUARD;
    else process.env.EFFECTIVE_PLAN_WRITE_GUARD = prev;
    if (prevChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = prevChain;
  });

  it('runExecute sets write authority for assertAuthorizedPlanMutation', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_GUARD = 'ENFORCE';
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const guard = new EffectivePlanWriteGuardService();
    const writer = new EffectivePlanWriter(guard);

    await writer.runExecute(async () => {
      expect(writer.hasWriteAuthority()).toBe(true);
      expect(() =>
        writer.assertAuthorizedPlanMutation('test.EffectivePlanWriter'),
      ).not.toThrow();
      return true;
    });

    expect(writer.hasWriteAuthority()).toBe(false);
  });
});
