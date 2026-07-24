/**
 * Per-corridor Cutover Gate (post UWC-1d).
 * Review ACTIONS_COMMIT Canary first — never auto-unlock all three.
 */

import type { AuthoritativeWriteCorridorId } from './authoritative-write.types';

export const UWC_CUTOVER_REVIEW_ORDER: readonly AuthoritativeWriteCorridorId[] = [
  'ACTIONS_COMMIT',
  'ITINERARY_ADJUST',
  'UNIFIED_EXECUTE',
] as const;

export type CorridorCutoverStatus =
  | 'PENDING_CANARY_REVIEW'
  | 'BLOCKED_UNTIL_PRIOR_CORRIDOR'
  | 'CANARY_APPROVED'
  | 'CUTOVER_COMPLETE'
  | 'REJECTED';

/**
 * Initial post-1d state: only ACTIONS_COMMIT is eligible for canary review.
 * Others stay blocked until prior corridor advances — no auto-unlock.
 */
export const UWC_CORRIDOR_CUTOVER_STATUS: Record<
  AuthoritativeWriteCorridorId,
  CorridorCutoverStatus
> = {
  ACTIONS_COMMIT: 'PENDING_CANARY_REVIEW',
  ITINERARY_ADJUST: 'BLOCKED_UNTIL_PRIOR_CORRIDOR',
  UNIFIED_EXECUTE: 'BLOCKED_UNTIL_PRIOR_CORRIDOR',
};

export const UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN =
  'Do not auto-unlock ITINERARY_ADJUST or UNIFIED_EXECUTE when ACTIONS_COMMIT canary opens' as const;

export function getNextCutoverCandidate(): AuthoritativeWriteCorridorId | null {
  for (const corridor of UWC_CUTOVER_REVIEW_ORDER) {
    if (UWC_CORRIDOR_CUTOVER_STATUS[corridor] === 'PENDING_CANARY_REVIEW') {
      return corridor;
    }
  }
  return null;
}

export function assertNoAutoUnlockAll(): void {
  const pendingOrBlocked = UWC_CUTOVER_REVIEW_ORDER.filter(
    (c) =>
      UWC_CORRIDOR_CUTOVER_STATUS[c] === 'PENDING_CANARY_REVIEW' ||
      UWC_CORRIDOR_CUTOVER_STATUS[c] === 'BLOCKED_UNTIL_PRIOR_CORRIDOR',
  );
  if (pendingOrBlocked.length === UWC_CUTOVER_REVIEW_ORDER.length) {
    // expected initial state — ok
    return;
  }
  const approved = UWC_CUTOVER_REVIEW_ORDER.filter(
    (c) =>
      UWC_CORRIDOR_CUTOVER_STATUS[c] === 'CANARY_APPROVED' ||
      UWC_CORRIDOR_CUTOVER_STATUS[c] === 'CUTOVER_COMPLETE',
  );
  // Guardrail for tests / future mutators: never mark all three complete in one step
  if (approved.length === UWC_CUTOVER_REVIEW_ORDER.length) {
    throw new Error(UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN);
  }
}
