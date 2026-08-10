/**
 * Authorized Effective Plan write path helpers (Authority Consistency).
 */

import { EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS } from './effective-plan-write-chain-blocked.util';

export const UWC_WRITE_APPLY_PATH = 'POST /api/uwc/v1/write/apply' as const;

export function assertAuthorizedEffectivePlanWritePath(path: string): void {
  if (
    !(EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS as readonly string[]).includes(
      path,
    )
  ) {
    throw new Error(
      `Write path not authorized: ${path}. Allowed: ${EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS.join(', ')}`,
    );
  }
}

/** Vertical-slice / CanonicalApply executeMutation must claim an authorized path. */
export function bindAuthorizedUwcApplyMutation<T>(execute: () => Promise<T> | T): () => Promise<T> {
  return async () => {
    assertAuthorizedEffectivePlanWritePath(UWC_WRITE_APPLY_PATH);
    return execute();
  };
}
