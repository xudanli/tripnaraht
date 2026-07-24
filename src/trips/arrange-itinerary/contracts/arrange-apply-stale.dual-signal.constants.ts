/**
 * CC-1 — Arrange apply stale dual-signal (facts / client contract SSOT).
 *
 * On freshness failure, facade:
 * - sets orchestration **phase** to CONTEXT_STALE
 * - marks proposal status STALE
 * - throws ConflictException with **code/errorCode** CONTEXT_VERSION_CONFLICT
 *
 * Clients must not assume HTTP body code === CONTEXT_STALE (that is the phase only).
 */

export const ARRANGE_APPLY_STALE_CONTRACT_VERSION = '1.0.0' as const;

export const ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE = 'CONTEXT_STALE' as const;

export const ARRANGE_APPLY_STALE_PROPOSAL_STATUS = 'STALE' as const;

/** Nest ConflictException payload `code` / `errorCode` (HTTP 409). */
export const ARRANGE_APPLY_STALE_HTTP_ERROR_CODE =
  'CONTEXT_VERSION_CONFLICT' as const;

export const ARRANGE_APPLY_STALE_HTTP_STATUS = 409 as const;

export const ARRANGE_APPLY_STALE_DUAL_SIGNAL =
  'phase=CONTEXT_STALE; http.code=CONTEXT_VERSION_CONFLICT' as const;

export const ARRANGE_APPLY_STALE_CLIENT_NOTE =
  'On apply freshness failure: read orchestration-state.phase for CONTEXT_STALE; treat 409 body code/errorCode as CONTEXT_VERSION_CONFLICT (not CONTEXT_STALE).' as const;
