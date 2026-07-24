import { BadRequestException } from '@nestjs/common';
import {
  EffectivePlanWriteBypassError,
  EffectivePlanWriteGuardService,
} from './effective-plan-write-guard.service';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  assertPlanMutationAllowedOrThrow,
  buildEffectivePlanWriteChainBadRequestBody,
  extractEffectivePlanWriteChainError,
  isEffectivePlanWriteChainBadRequest,
  mapWriteChainBlockedToErrorResponse,
} from './effective-plan-write-chain-blocked.util';
import { errorResponse } from '../../common/dto/standard-response.dto';

describe('effective-plan-write-chain-blocked.util', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
  });

  it('CAS-095: assertPlanMutationAllowedOrThrow maps bypass to BadRequest with authorizedPaths', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const guard = new EffectivePlanWriteGuardService();
    expect(() =>
      assertPlanMutationAllowedOrThrow(guard, 'test.caller'),
    ).toThrow(BadRequestException);

    try {
      assertPlanMutationAllowedOrThrow(guard, 'test.caller');
    } catch (e) {
      expect(isEffectivePlanWriteChainBadRequest(e)).toBe(true);
      const mapped = mapWriteChainBlockedToErrorResponse(e);
      expect(mapped?.success).toBe(false);
      expect(mapped?.error?.code).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
      expect(mapped?.error?.details?.authorizedPaths).toBeDefined();
      expect(mapped?.error?.details?.writeChain).toBe(true);
    }
  });

  it('CAS-096: extractEffectivePlanWriteChainError preserves caller', () => {
    const body = buildEffectivePlanWriteChainBadRequestBody('readiness.controller');
    const ex = new BadRequestException(body);
    const extracted = extractEffectivePlanWriteChainError(ex);
    expect(extracted.details.caller).toBe('readiness.controller');
  });

  it('CAS-097: non-write-chain BadRequest is not mapped', () => {
    const ex = new BadRequestException({ code: 'OTHER', message: 'nope' });
    expect(mapWriteChainBlockedToErrorResponse(ex)).toBeNull();
  });

  it('CAS-098: EffectivePlanWriteBypassError message flows into BadRequest body', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const guard = new EffectivePlanWriteGuardService();
    try {
      assertPlanMutationAllowedOrThrow(guard, 'svc.apply');
    } catch (e) {
      if (e instanceof BadRequestException) {
        const extracted = extractEffectivePlanWriteChainError(e);
        expect(extracted.message).toContain('svc.apply');
      } else if (e instanceof EffectivePlanWriteBypassError) {
        throw e;
      }
    }
  });
});
