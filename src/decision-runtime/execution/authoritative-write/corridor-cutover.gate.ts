/**
 * Cutover helpers for UWC-CANARY-01/02/03.
 * Never auto-unlock all corridors or global AUTHORITATIVE / compensation.
 */

import type { AuthoritativeWriteCorridorId } from './authoritative-write.types';

export const UWC_CUTOVER_REVIEW_ORDER: readonly AuthoritativeWriteCorridorId[] = [
  'ACTIONS_COMMIT',
  'ITINERARY_ADJUST',
  'UNIFIED_EXECUTE',
] as const;

export type CorridorCutoverStatus =
  | 'PENDING_CANARY_REVIEW'
  | 'APPROVED_FOR_CANARY'
  | 'CANARY_IN_PROGRESS'
  | 'BLOCKED_UNTIL_PRIOR_CORRIDOR'
  | 'CANARY_APPROVED'
  | 'CUTOVER_COMPLETE'
  | 'REJECTED';

/**
 * Persisted formal cutover after all three canaries ops-passed (2026-07-24).
 * Global AUTHORITATIVE / compensation remain LOCKED — open UWC-CUTOVER-01 next.
 */
export const UWC_CORRIDOR_CUTOVER_STATUS: Record<
  AuthoritativeWriteCorridorId,
  CorridorCutoverStatus
> = {
  ACTIONS_COMMIT: 'CANARY_APPROVED',
  ITINERARY_ADJUST: 'CANARY_APPROVED',
  UNIFIED_EXECUTE: 'CANARY_APPROVED',
};

export const UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN =
  'Do not auto-unlock later corridors; advance one canary review at a time' as const;

export function getNextCutoverCandidate(): AuthoritativeWriteCorridorId | null {
  for (const corridor of UWC_CUTOVER_REVIEW_ORDER) {
    const s = UWC_CORRIDOR_CUTOVER_STATUS[corridor];
    if (
      s === 'PENDING_CANARY_REVIEW' ||
      s === 'APPROVED_FOR_CANARY' ||
      s === 'CANARY_IN_PROGRESS'
    ) {
      return corridor;
    }
  }
  return null;
}

/** Actual UNIFIED canary traffic only when status is APPROVED_FOR_CANARY or IN_PROGRESS. */
export function isUnifiedExecuteCanaryTrafficApproved(): boolean {
  const s = UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE;
  return s === 'APPROVED_FOR_CANARY' || s === 'CANARY_IN_PROGRESS';
}

/** After ACTIONS canary passes — ITINERARY → PENDING_CANARY_REVIEW only. */
export function advanceCutoverAfterActionsCanaryPass(): void {
  if (UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT === 'REJECTED') {
    throw new Error('ACTIONS_COMMIT canary rejected — cannot advance');
  }
  UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT = 'CANARY_APPROVED';
  UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST = 'PENDING_CANARY_REVIEW';
  UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';
}

/** Start UWC-CANARY-02 after ITINERARY is PENDING. */
export function beginItineraryAdjustCanary(): void {
  if (UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT !== 'CANARY_APPROVED') {
    throw new Error('ACTIONS_COMMIT must be CANARY_APPROVED before ITINERARY canary');
  }
  if (UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST !== 'PENDING_CANARY_REVIEW') {
    throw new Error('ITINERARY_ADJUST must be PENDING_CANARY_REVIEW to begin');
  }
  UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST = 'CANARY_IN_PROGRESS';
  UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';
}

/**
 * After ITINERARY canary passes — UNIFIED → PENDING_CANARY_REVIEW only.
 * Does not approve UNIFIED canary traffic yet.
 */
export function advanceCutoverAfterItineraryCanaryPass(): void {
  if (UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST === 'REJECTED') {
    throw new Error('ITINERARY_ADJUST canary rejected — cannot advance');
  }
  if (UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST !== 'CANARY_IN_PROGRESS') {
    throw new Error('ITINERARY_ADJUST must be CANARY_IN_PROGRESS to pass');
  }
  UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST = 'CANARY_APPROVED';
  UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'PENDING_CANARY_REVIEW';
}

/**
 * Independent review approval — required before UNIFIED canary traffic.
 * Does not auto-start percent routing; pair with env AUTHORIZED + begin.
 */
export function approveUnifiedExecuteForCanary(): void {
  if (UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT !== 'CANARY_APPROVED') {
    throw new Error('ACTIONS_COMMIT must be CANARY_APPROVED');
  }
  if (UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST !== 'CANARY_APPROVED') {
    throw new Error('ITINERARY_ADJUST must be CANARY_APPROVED');
  }
  if (UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE !== 'PENDING_CANARY_REVIEW') {
    throw new Error('UNIFIED_EXECUTE must be PENDING_CANARY_REVIEW to approve');
  }
  UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'APPROVED_FOR_CANARY';
}

/** Start UWC-CANARY-03 traffic eligibility after APPROVED_FOR_CANARY. */
export function beginUnifiedExecuteCanary(): void {
  if (UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE !== 'APPROVED_FOR_CANARY') {
    throw new Error(
      'UNIFIED_EXECUTE must be APPROVED_FOR_CANARY before canary traffic',
    );
  }
  UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'CANARY_IN_PROGRESS';
}

/**
 * After UNIFIED canary passes — mark CANARY_APPROVED only.
 * Does not unlock global AUTHORITATIVE or compensation exec.
 */
export function advanceCutoverAfterUnifiedCanaryPass(): void {
  if (UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE === 'REJECTED') {
    throw new Error('UNIFIED_EXECUTE canary rejected — cannot advance');
  }
  if (UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE !== 'CANARY_IN_PROGRESS') {
    throw new Error('UNIFIED_EXECUTE must be CANARY_IN_PROGRESS to pass');
  }
  UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'CANARY_APPROVED';
}

export function assertNoAutoUnlockAll(): void {
  // Forbid skipping prior corridors — sequential canary pass of all three is allowed.
  if (
    UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE === 'CANARY_APPROVED' &&
    UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST === 'BLOCKED_UNTIL_PRIOR_CORRIDOR'
  ) {
    throw new Error(UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN);
  }
  if (
    isUnifiedExecuteCanaryTrafficApproved() &&
    (UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT !== 'CANARY_APPROVED' ||
      UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST !== 'CANARY_APPROVED')
  ) {
    throw new Error(UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN);
  }
  if (
    (UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE === 'PENDING_CANARY_REVIEW' ||
      UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE === 'APPROVED_FOR_CANARY' ||
      UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE === 'CANARY_IN_PROGRESS' ||
      UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE === 'CANARY_APPROVED') &&
    UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST !== 'CANARY_APPROVED' &&
    UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST !== 'CANARY_IN_PROGRESS'
  ) {
    // ITINERARY must have progressed before UNIFIED leaves BLOCKED
    if (UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST === 'BLOCKED_UNTIL_PRIOR_CORRIDOR') {
      throw new Error(UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN);
    }
  }
}
