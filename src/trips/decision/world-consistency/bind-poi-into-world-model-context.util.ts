/**
 * Bind POI authority materialization into WorldModelContext.physical for this tick.
 */

import type { WorldModelContext } from '../shared/world-model.types';
import type { DecisionTickPoiMaterialization } from './poi-authority-bridge.types';
import { bindPhysicalPoiStatesForTick } from './poi-authority-bridge';

export function bindPoiAuthorityIntoWorldModelContext(
  world: WorldModelContext,
  materialization: DecisionTickPoiMaterialization | null | undefined,
): WorldModelContext {
  if (!materialization || !world.physical) return world;
  return {
    ...world,
    physical: {
      ...world.physical,
      poiOperationalStates: bindPhysicalPoiStatesForTick(
        world.physical.poiOperationalStates,
        materialization,
      ),
    },
  };
}

export function bindAllPoiAuthorityIntoWorldModelContext(
  world: WorldModelContext,
  materializations: DecisionTickPoiMaterialization[],
): WorldModelContext {
  let next = world;
  for (const m of materializations) {
    next = bindPoiAuthorityIntoWorldModelContext(next, m);
  }
  return next;
}
