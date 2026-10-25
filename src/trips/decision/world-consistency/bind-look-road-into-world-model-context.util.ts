/**
 * Bind Look→Authority road materialization into WorldModelContext.physical for this tick.
 * Tick-scoped only — does not sync other historical stores.
 */

import type { WorldModelContext } from '../shared/world-model.types';
import type { DecisionTickRoadMaterialization } from './look-road-authority-bridge.types';
import { bindPhysicalRoadStatesForTick } from './look-road-authority-bridge';

export function bindLookRoadAuthorityIntoWorldModelContext(
  world: WorldModelContext,
  materialization: DecisionTickRoadMaterialization | null | undefined,
): WorldModelContext {
  if (!materialization || !world.physical) return world;
  return {
    ...world,
    physical: {
      ...world.physical,
      roadStates: bindPhysicalRoadStatesForTick(
        world.physical.roadStates,
        materialization,
      ),
    },
  };
}

/** CGUS/Gate helpers: treat OPEN as fact only when materialization says so */
export function cgusMayTreatRoadAsOpen(
  materialization: DecisionTickRoadMaterialization | null | undefined,
  roadId: string,
): boolean {
  if (!materialization) return true; // no binding → legacy behavior
  if (materialization.roadId.toUpperCase() !== roadId.toUpperCase()) {
    return true;
  }
  return materialization.cgusSees.treatAsOpenFact;
}
