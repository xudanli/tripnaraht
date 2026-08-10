import { BadRequestException } from '@nestjs/common';
import { EffectivePlanWriteGuardService } from './effective-plan-write-guard.service';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  isEffectivePlanWriteChainBadRequest,
} from './effective-plan-write-chain-blocked.util';
import { runBootstrapPlanSeedWithAuthority } from './bootstrap-plan-seed-authority.util';

describe('runBootstrapPlanSeedWithAuthority', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
  const originalGuard = process.env.EFFECTIVE_PLAN_WRITE_GUARD;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
    if (originalGuard === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_GUARD;
    else process.env.EFFECTIVE_PLAN_WRITE_GUARD = originalGuard;
  });

  it('chain OFF: runs fn without guard', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '0';
    const result = await runBootstrapPlanSeedWithAuthority(
      undefined,
      'test.bootstrap',
      async () => 'ok',
    );
    expect(result).toBe('ok');
  });

  it('chain ON + no guard: BadRequest CHAIN_REQUIRED', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    await expect(
      runBootstrapPlanSeedWithAuthority(undefined, 'test.bootstrap', async () => 'x'),
    ).rejects.toBeInstanceOf(BadRequestException);

    try {
      await runBootstrapPlanSeedWithAuthority(undefined, 'test.bootstrap', async () => 'x');
    } catch (e) {
      expect(isEffectivePlanWriteChainBadRequest(e)).toBe(true);
      const body = (e as BadRequestException).getResponse() as {
        code?: string;
        caller?: string;
      };
      expect(body.code).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
      expect(body.caller).toBe('test.bootstrap');
    }
  });

  it('chain ON + guard: succeeds under runWithAuthority', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    process.env.EFFECTIVE_PLAN_WRITE_GUARD = 'ENFORCE';
    const guard = new EffectivePlanWriteGuardService();
    let sawAuthority = false;
    const result = await runBootstrapPlanSeedWithAuthority(
      guard,
      'test.bootstrap',
      async () => {
        sawAuthority = guard.hasWriteAuthority();
        return 42;
      },
    );
    expect(result).toBe(42);
    expect(sawAuthority).toBe(true);
  });
});
