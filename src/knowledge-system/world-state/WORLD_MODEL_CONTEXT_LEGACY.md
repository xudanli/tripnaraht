/**
 * @deprecated LEGACY — WorldModelContext must not be Decision SSOT.
 * Use: Providers → TravelWorldFact → CanonicalWorldStateSnapshot → Gate/Evaluate.
 * Adapter entry: ensureSnapshotWorldFacts / tripWorldStateToCanonicalSnapshot.
 * Guard: assertDecisionConsumerUsesSnapshot (src/knowledge-system/world-state/snapshot-ssot.guard.util.ts)
 */

export const WORLD_MODEL_CONTEXT_LEGACY_SSOT_BANNER =
  'WorldModelContext is legacy. Do not read as Gate SSOT; use CanonicalWorldStateSnapshot.worldFacts.';
