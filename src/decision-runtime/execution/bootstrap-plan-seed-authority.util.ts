/**
 * Agent Harness P1 — authorize bootstrap ItineraryItem seeding under write chain.
 *
 * Uses ALS runWithAuthority('execute') + assertPlanMutationAllowedOrThrow.
 * Never use assertDirect here — that ignores ALS and would break create-trip UX.
 */

import { BadRequestException } from '@nestjs/common';
import type { EffectivePlanWriteGuardService } from './effective-plan-write-guard.service';
import {
  assertPlanMutationAllowedOrThrow,
  buildEffectivePlanWriteChainBadRequestBody,
} from './effective-plan-write-chain-blocked.util';
import { isEffectivePlanWriteChainEnabled } from './effective-plan-write-chain.config';

export async function runBootstrapPlanSeedWithAuthority<T>(
  guard: EffectivePlanWriteGuardService | undefined,
  caller: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isEffectivePlanWriteChainEnabled()) {
    return fn();
  }
  if (!guard) {
    throw new BadRequestException(
      buildEffectivePlanWriteChainBadRequestBody(
        caller,
        `Plan mutation blocked (${caller}): EffectivePlanWriteGuard not injected for bootstrap seed`,
      ),
    );
  }
  return guard.runWithAuthority('execute', async () => {
    assertPlanMutationAllowedOrThrow(guard, caller);
    return fn();
  });
}
