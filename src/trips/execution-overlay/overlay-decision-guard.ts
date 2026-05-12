/**
 * P-Next 3 — Overlay is a narrative / trace layer only; it must not double as a decision source
 * when PhysicsFieldIndex is authoritative.
 */

export interface OverlayDecisionGuardInput {
  /** Migration trap: legacy paths must not re-enable overlay-as-truth while physics-first is active. */
  executionOverlayFramesUsedForDecision?: boolean;
}

export function assertOverlayIsNonAuthoritative(input: OverlayDecisionGuardInput): void {
  if (input.executionOverlayFramesUsedForDecision) {
    throw new Error('OVERLAY_IS_NO_LONGER_A_DECISION_SOURCE');
  }
}
