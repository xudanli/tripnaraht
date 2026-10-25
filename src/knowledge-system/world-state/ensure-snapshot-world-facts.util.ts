/**
 * Ensure Canonical snapshot carries worldFacts (SSOT surface for Gate).
 */

import type { CanonicalWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';
import { canonicalWorldStateToTravelWorldFacts } from '../../travel-ontology/adapters/canonical-world-state-to-ontology-facts.adapter';

export function ensureSnapshotWorldFacts(
  snapshot: CanonicalWorldStateSnapshot,
): CanonicalWorldStateSnapshot {
  if (snapshot.worldFacts && snapshot.worldFacts.length > 0) {
    return snapshot;
  }
  return {
    ...snapshot,
    worldFacts: canonicalWorldStateToTravelWorldFacts(snapshot),
  };
}
