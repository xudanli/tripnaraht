/**
 * Agent Harness P0-1 W0 — fail-fast when write-chain / guard are not enforced.
 *
 * Escape hatch (tests / explicit local override only):
 *   ALLOW_WRITE_CHAIN_OFF=1
 */

import { isEffectivePlanWriteChainEnabled } from './effective-plan-write-chain.config';
import {
  isEffectivePlanWriteGuardEnforce,
  resolveEffectivePlanWriteGuardMode,
} from './canonical-mutation-commit-guard.config';

export class EffectivePlanWriteChainStartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EffectivePlanWriteChainStartupError';
  }
}

export function isWriteChainOffEscapeAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = env.ALLOW_WRITE_CHAIN_OFF?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Assert CHAIN enabled + GUARD ENFORCE unless ALLOW_WRITE_CHAIN_OFF is set.
 */
export function assertEffectivePlanWriteChainOnStartup(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isWriteChainOffEscapeAllowed(env)) {
    return;
  }

  const chainOn = isEffectivePlanWriteChainEnabled();
  const guardMode = resolveEffectivePlanWriteGuardMode();
  const guardEnforce = isEffectivePlanWriteGuardEnforce();

  if (chainOn && guardEnforce) {
    return;
  }

  const parts: string[] = [];
  if (!chainOn) {
    parts.push(
      'EFFECTIVE_PLAN_WRITE_CHAIN is off (set to 1/true, or unset for default ON)',
    );
  }
  if (!guardEnforce) {
    parts.push(
      `EFFECTIVE_PLAN_WRITE_GUARD=${guardMode} (require ENFORCE; unset defaults to ENFORCE)`,
    );
  }
  parts.push(
    'To bypass (tests only): ALLOW_WRITE_CHAIN_OFF=1. Agent Harness P0-1 W0.',
  );

  throw new EffectivePlanWriteChainStartupError(parts.join('. '));
}
