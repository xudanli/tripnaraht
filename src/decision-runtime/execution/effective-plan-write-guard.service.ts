/**
 * Runtime guard: Effective Plan pointer changes only inside authorized execute/rollback.
 * @see ADR-006-Unified-Decision-Runtime.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { recordEffectivePlanWriteGuardShadowBypass } from './effective-plan-write-guard-shadow.util';
import {
  isEffectivePlanWriteGuardEnabled,
  isEffectivePlanWriteGuardShadow,
} from './effective-plan-write-guard.config';
import { isEffectivePlanWriteChainEnabled } from './effective-plan-write-chain.config';
import {
  effectivePlanWriteAuthorityAls,
  type EffectivePlanWriteAuthority,
  hasEffectivePlanWriteAuthority,
} from './effective-plan-write-authority.als';

export type { EffectivePlanWriteAuthority };

export class EffectivePlanWriteBypassError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EffectivePlanWriteBypassError';
  }
}

@Injectable()
export class EffectivePlanWriteGuardService {
  private readonly logger = new Logger(EffectivePlanWriteGuardService.name);

  async runWithAuthority<T>(
    authority: EffectivePlanWriteAuthority,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!isEffectivePlanWriteGuardEnabled() && !isEffectivePlanWriteChainEnabled()) {
      return fn();
    }
    return effectivePlanWriteAuthorityAls.run(authority, fn);
  }

  assertSetEffectiveAllowed(caller?: string): void {
    if (!isEffectivePlanWriteGuardEnabled()) {
      return;
    }
    const authority = effectivePlanWriteAuthorityAls.getStore();
    if (!authority) {
      if (isEffectivePlanWriteGuardShadow()) {
        const label = caller ?? 'unknown';
        recordEffectivePlanWriteGuardShadowBypass(label);
        this.logger.warn(
          `[EffectivePlanWriteGuard:SHADOW] setEffective bypass would block caller=${label}`,
        );
        return;
      }
      throw new EffectivePlanWriteBypassError(
        `setEffective blocked: must run inside EffectivePlanExecutor (${caller ?? 'unknown caller'})`,
      );
    }
  }

  hasWriteAuthority(): boolean {
    return hasEffectivePlanWriteAuthority();
  }

  assertAuthorizedPlanMutation(caller: string): void {
    if (!isEffectivePlanWriteChainEnabled()) return;
    if (!this.hasWriteAuthority()) {
      throw new EffectivePlanWriteBypassError(
        `Plan mutation blocked (${caller}): use DecisionCore → authorize → execute, or POST .../decision-problems/:problemId/apply`,
      );
    }
  }
}
