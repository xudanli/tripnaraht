/**
 * Process-wide ALS for Effective Plan write authority.
 * Shared so assertDirectEffectivePlanWriteBlocked can honor runWithAuthority
 * even when the caller is a different Nest provider instance than the guard.
 */

import { AsyncLocalStorage } from 'async_hooks';

export type EffectivePlanWriteAuthority = 'execute' | 'rollback';

export const effectivePlanWriteAuthorityAls =
  new AsyncLocalStorage<EffectivePlanWriteAuthority>();

export function getEffectivePlanWriteAuthority(): EffectivePlanWriteAuthority | undefined {
  return effectivePlanWriteAuthorityAls.getStore();
}

export function hasEffectivePlanWriteAuthority(): boolean {
  return effectivePlanWriteAuthorityAls.getStore() != null;
}
