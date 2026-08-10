import {
  assertEffectivePlanWriteChainOnStartup,
  EffectivePlanWriteChainStartupError,
  isWriteChainOffEscapeAllowed,
} from './assert-effective-plan-write-chain-on-startup';
import { isEffectivePlanWriteChainEnabled } from './effective-plan-write-chain.config';
import { resolveEffectivePlanWriteGuardMode } from './canonical-mutation-commit-guard.config';

describe('assertEffectivePlanWriteChainOnStartup (P0-1 W0)', () => {
  const prevChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
  const prevGuard = process.env.EFFECTIVE_PLAN_WRITE_GUARD;
  const prevEscape = process.env.ALLOW_WRITE_CHAIN_OFF;

  afterEach(() => {
    if (prevChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = prevChain;
    if (prevGuard === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_GUARD;
    else process.env.EFFECTIVE_PLAN_WRITE_GUARD = prevGuard;
    if (prevEscape === undefined) delete process.env.ALLOW_WRITE_CHAIN_OFF;
    else process.env.ALLOW_WRITE_CHAIN_OFF = prevEscape;
  });

  it('defaults: unset CHAIN → enabled; unset GUARD → ENFORCE', () => {
    delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    delete process.env.EFFECTIVE_PLAN_WRITE_GUARD;
    expect(isEffectivePlanWriteChainEnabled()).toBe(true);
    expect(resolveEffectivePlanWriteGuardMode()).toBe('ENFORCE');
    expect(() => assertEffectivePlanWriteChainOnStartup()).not.toThrow();
  });

  it('throws when CHAIN explicitly off without escape', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '0';
    delete process.env.ALLOW_WRITE_CHAIN_OFF;
    expect(() => assertEffectivePlanWriteChainOnStartup()).toThrow(
      EffectivePlanWriteChainStartupError,
    );
  });

  it('throws when GUARD=OFF without escape', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    process.env.EFFECTIVE_PLAN_WRITE_GUARD = 'OFF';
    delete process.env.ALLOW_WRITE_CHAIN_OFF;
    expect(() => assertEffectivePlanWriteChainOnStartup()).toThrow(
      EffectivePlanWriteChainStartupError,
    );
  });

  it('allows bypass when ALLOW_WRITE_CHAIN_OFF=1', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '0';
    process.env.EFFECTIVE_PLAN_WRITE_GUARD = 'OFF';
    process.env.ALLOW_WRITE_CHAIN_OFF = '1';
    expect(isWriteChainOffEscapeAllowed()).toBe(true);
    expect(() => assertEffectivePlanWriteChainOnStartup()).not.toThrow();
  });
});
