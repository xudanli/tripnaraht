/**
 * Latent Shadow must never enter the authoritative write chain.
 */

import { BadRequestException } from '@nestjs/common';
import { EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS } from '../decision-runtime/execution/effective-plan-write-chain-blocked.util';

export const LATENT_SHADOW_WRITE_FORBIDDEN_CODE = 'LATENT_SHADOW_WRITE_FORBIDDEN' as const;

export function assertLatentShadowMustNotWritePlan(caller: string): never {
  throw new BadRequestException({
    code: LATENT_SHADOW_WRITE_FORBIDDEN_CODE,
    error: LATENT_SHADOW_WRITE_FORBIDDEN_CODE,
    message:
      `Latent implicit-parse Shadow cannot write plan (${caller}). ` +
      `SHADOW_ONLY — escalate only via Decision Problem → Gateway → Preview → Confirm → Apply.`,
    caller,
    authorizedPaths: EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS,
  });
}

/** Guard for any accidental adopt/apply entry from latent consumers. */
export function refuseLatentShadowPlanMutation(input: {
  caller: string;
  attemptsPlanWrite: boolean;
}): void {
  if (!input.attemptsPlanWrite) return;
  assertLatentShadowMustNotWritePlan(input.caller);
}
