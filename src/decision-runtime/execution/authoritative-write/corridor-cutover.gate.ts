/**
 * Cutover helpers after ACTIONS_COMMIT canary (UWC-CANARY-01).
 * Passing canary only advances ITINERARY_ADJUST to the next independent review.
 */

import type { AuthoritativeWriteCorridorId } from './authoritative-write.types';

export const UWC_CUTOVER_REVIEW_ORDER: readonly AuthoritativeWriteCorridorId[] = [
  'ACTIONS_COMMIT',
  'ITINERARY_ADJUST',
  'UNIFIED_EXECUTE',
] as const;

export type CorridorCutoverStatus =
  | 'PENDING_CANARY_REVIEW'
  | 'CANARY_IN_PROGRESS'
  | 'BLOCKED_UNTIL_PRIOR_CORRIDOR'
  | 'CANARY_APPROVED'
  | 'CUTOVER_COMPLETE'
  | 'REJECTED';

/**
 * UWC-CANARY-01: ACTIONS canary in progress; others blocked.
 * Do not auto-unlock UNIFIED when ACTIONS opens.
 */
export const UWC_CORRIDOR_CUTOVER_STATUS: Record<
  AuthoritativeWriteCorridorId,
  CorridorCutoverStatus
> = {
  ACTIONS_COMMIT: 'CANARY_IN_PROGRESS',
  ITINERARY_ADJUST: 'BLOCKED_UNTIL_PRIOR_CORRIDOR',
  UNIFIED_EXECUTE: 'BLOCKED_UNTIL_PRIOR_CORRIDOR',
};

export const UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN =
  'Do not auto-unlock ITINERARY_ADJUST or UNIFIED_EXECUTE when ACTIONS_COMMIT canary opens' as const;

export function getNextCutoverCandidate(): AuthoritativeWriteCorridorId | null {
  for (const corridor of UWC_CUTOVER_REVIEW_ORDER) {
    const s = UWC_CORRIDOR_CUTOVER_STATUS[corridor];
    if (s === 'PENDING_CANARY_REVIEW' || s === 'CANARY_IN_PROGRESS') {
      return corridor;
    }
  }
  return null;
}

/**
 * Call only after ACTIONS_COMMIT canary review passes.
 * Advances ITINERARY_ADJUST to PENDING_CANARY_REVIEW — not UNIFIED, not auto AUTHORITATIVE.
 */
export function advanceCutoverAfterActionsCanaryPass(): void {
  if (UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT === 'REJECTED') {
    throw new Error('ACTIONS_COMMIT canary rejected — cannot advance');
  }
  UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT = 'CANARY_APPROVED';
  UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST = 'PENDING_CANARY_REVIEW';
  // UNIFIED remains blocked until ITINERARY independent canary passes
  if (UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE !== 'BLOCKED_UNTIL_PRIOR_CORRIDOR') {
    UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';
  }
}

export function assertNoAutoUnlockAll(): void {
  const approved = UWC_CUTOVER_REVIEW_ORDER.filter(
    (c) =>
      UWC_CORRIDOR_CUTOVER_STATUS[c] === 'CANARY_APPROVED' ||
      UWC_CORRIDOR_CUTOVER_STATUS[c] === 'CUTOVER_COMPLETE',
  );
  if (approved.length === UWC_CUTOVER_REVIEW_ORDER.length) {
    throw new Error(UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN);
  }
  if (
    UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE === 'CANARY_APPROVED' &&
    UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST === 'BLOCKED_UNTIL_PRIOR_CORRIDOR'
  ) {
    throw new Error(UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN);
  }
}
