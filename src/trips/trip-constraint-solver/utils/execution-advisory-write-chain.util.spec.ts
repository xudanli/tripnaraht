import { BadRequestException } from '@nestjs/common';
import {
  assertExecutionAdvisoryDirectApplyAllowed,
} from '../utils/execution-advisory-write-chain.util';
import { EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';

describe('execution-advisory-write-chain.util', () => {
  const prev = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  afterEach(() => {
    if (prev === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = prev;
  });

  it('allows apply when write chain disabled', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '0';
    expect(() => assertExecutionAdvisoryDirectApplyAllowed()).not.toThrow();
  });

  it('blocks apply with EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED when write chain enabled', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    try {
      assertExecutionAdvisoryDirectApplyAllowed();
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const resp = (e as BadRequestException).getResponse() as { code?: string };
      expect(resp.code).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
    }
  });
});
