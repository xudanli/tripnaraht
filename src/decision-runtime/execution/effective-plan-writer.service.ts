/**
 * P0 frozen formal write facade.
 *
 * Only combination allowed for effective-plan / itinerary mutations:
 *   EffectivePlanWriteGuard + EffectivePlanWriter + EffectivePlanVersionStore
 *
 * Callers must obtain execute/rollback authority via this writer — do not call
 * setEffective or applyPlanOperations outside runExecute / runRollback.
 */

import { Injectable } from '@nestjs/common';
import {
  EffectivePlanWriteGuardService,
  type EffectivePlanWriteAuthority,
} from './effective-plan-write-guard.service';

@Injectable()
export class EffectivePlanWriter {
  constructor(private readonly guard: EffectivePlanWriteGuardService) {}

  /** Formal execute authority for itinerary / PlanVersion promotion. */
  runExecute<T>(fn: () => Promise<T>): Promise<T> {
    return this.guard.runWithAuthority('execute', fn);
  }

  /** Formal rollback authority. */
  runRollback<T>(fn: () => Promise<T>): Promise<T> {
    return this.guard.runWithAuthority('rollback', fn);
  }

  runWithAuthority<T>(
    authority: EffectivePlanWriteAuthority,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.guard.runWithAuthority(authority, fn);
  }

  hasWriteAuthority(): boolean {
    return this.guard.hasWriteAuthority();
  }

  assertAuthorizedPlanMutation(caller: string): void {
    this.guard.assertAuthorizedPlanMutation(caller);
  }
}
