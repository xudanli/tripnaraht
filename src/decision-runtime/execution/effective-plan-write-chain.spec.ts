import {
  EffectivePlanWriteBypassError,
  EffectivePlanWriteGuardService,
} from './effective-plan-write-guard.service';
import { isEffectivePlanWriteChainEnabled } from './effective-plan-write-chain.config';

describe('EffectivePlanWriteGuardService write chain', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
  });

  it('CAS-070: blocks direct mutation when write chain enabled without authority', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const guard = new EffectivePlanWriteGuardService();
    expect(() => guard.assertAuthorizedPlanMutation('test.applyRepair')).toThrow(
      EffectivePlanWriteBypassError,
    );
  });

  it('CAS-071: allows mutation inside execute authority when write chain enabled', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const guard = new EffectivePlanWriteGuardService();
    await guard.runWithAuthority('execute', async () => {
      expect(() => guard.assertAuthorizedPlanMutation('authorized.apply')).not.toThrow();
    });
  });

  it('CAS-072: write chain off allows direct mutation assert', () => {
    delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    const guard = new EffectivePlanWriteGuardService();
    expect(() => guard.assertAuthorizedPlanMutation('test')).not.toThrow();
    expect(isEffectivePlanWriteChainEnabled()).toBe(false);
  });
});
