/**
 * Overlay POI authority into CanonicalWorldStateSnapshot.poiStates (tick-scoped).
 */

import type {
  CanonicalWorldStateSnapshot,
  PoiOperationalState,
} from '../../../decision-runtime/contracts/world-state-snapshot';
import type { DecisionTickPoiMaterialization } from './poi-authority-bridge.types';
import { bindCanonicalPoiStatesForTick } from './poi-authority-bridge';

export function bindPoiAuthorityIntoCanonicalSnapshot(
  snapshot: CanonicalWorldStateSnapshot,
  materialization: DecisionTickPoiMaterialization | null | undefined,
): CanonicalWorldStateSnapshot {
  if (!materialization) return snapshot;
  return {
    ...snapshot,
    poiStates: bindCanonicalPoiStatesForTick(
      snapshot.poiStates,
      materialization,
    ) as PoiOperationalState[],
  };
}

export function bindAllPoiAuthorityIntoCanonicalSnapshot(
  snapshot: CanonicalWorldStateSnapshot,
  materializations: DecisionTickPoiMaterialization[],
): CanonicalWorldStateSnapshot {
  let next = snapshot;
  for (const m of materializations) {
    next = bindPoiAuthorityIntoCanonicalSnapshot(next, m);
  }
  return next;
}
