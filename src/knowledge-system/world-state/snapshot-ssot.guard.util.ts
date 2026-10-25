/**
 * Phase 2 — Decision consumers must use CanonicalWorldStateSnapshot as SSOT.
 * Legacy WorldModelContext may only feed adapters, never Gate/Evaluate directly.
 */

import type { CanonicalWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';

export type SsotConsumer =
  | 'Evaluate'
  | 'Gate'
  | 'Constraint'
  | 'CGUS'
  | 'Admin'
  | 'Other';

export class WorldStateSsotViolationError extends Error {
  constructor(
    message: string,
    public readonly consumer: SsotConsumer,
  ) {
    super(message);
    this.name = 'WorldStateSsotViolationError';
  }
}

/**
 * Assert the object is a canonical snapshot (schemaId + snapshotId).
 * Pass `legacyWorldModelContext` only to document accidental misuse — will throw.
 */
export function assertDecisionConsumerUsesSnapshot(
  consumer: SsotConsumer,
  input: {
    snapshot?: CanonicalWorldStateSnapshot | null;
    /** @deprecated Do not pass — will throw WorldStateSsotViolationError */
    worldModelContext?: unknown;
  },
): CanonicalWorldStateSnapshot {
  if (input.worldModelContext != null && input.snapshot == null) {
    throw new WorldStateSsotViolationError(
      `[${consumer}] WorldModelContext is legacy and must not be Decision SSOT. ` +
        `Adapter → CanonicalWorldStateSnapshot first, then read snapshot.worldFacts.`,
      consumer,
    );
  }
  const snap = input.snapshot;
  if (!snap || snap.schemaId !== 'tripnara.canonical_world_state_snapshot@v1' || !snap.snapshotId) {
    throw new WorldStateSsotViolationError(
      `[${consumer}] Missing CanonicalWorldStateSnapshot (schemaId + snapshotId required).`,
      consumer,
    );
  }
  return snap;
}

/** Prefer snapshot.worldFacts; never invent from WorldModelContext here. */
export function readSsotWorldFacts(snapshot: CanonicalWorldStateSnapshot) {
  return snapshot.worldFacts ?? [];
}
