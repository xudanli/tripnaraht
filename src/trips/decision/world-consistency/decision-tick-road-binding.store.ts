/**
 * Tick-scoped store for Look→Authority road materialization + ConstraintStore slice.
 * Not a global World SSOT — latest binding per trip for Decision Tick consumers.
 */

import { Injectable } from '@nestjs/common';
import { WorldConstraintStore } from '../../../world/world-constraint.store';
import { applyRoadFactMutation } from '../../../world/world-mutation.gateway';
import {
  snapshotWorldConstraintStore,
  type WorldConstraintStoreSnapshot,
} from '../../../world/world-snapshot';
import type { CanonicalRoadWorldState } from '../../../world/road-canonical.types';
import type { DecisionTickRoadMaterialization } from './look-road-authority-bridge.types';
import { applyRoadTickFreshness } from './decision-tick-freshness.util';

function toCanonicalRoadState(
  m: DecisionTickRoadMaterialization,
): CanonicalRoadWorldState {
  if (m.roadStatus === 'CLOSED') return 'CLOSED';
  if (m.roadStatus === 'OPEN') return 'OPEN';
  if (m.roadStatus === 'RESTRICTED') return 'RESTRICTED';
  // UNVERIFIED / UNKNOWN — do not forge OPEN/CLOSED
  return 'DEGRADED';
}

export interface DecisionTickRoadBinding {
  materialization: DecisionTickRoadMaterialization;
  constraintSnapshot: WorldConstraintStoreSnapshot;
}

function bindingFromMaterialization(
  materialization: DecisionTickRoadMaterialization,
): DecisionTickRoadBinding {
  const store = new WorldConstraintStore();
  applyRoadFactMutation(store, {
    channel: 'GRAPH_SSOT_DIFF',
    diff: {
      roadId: materialization.roadId,
      state: toCanonicalRoadState(materialization),
      severity: materialization.constraintField.severity,
      impactedEntities: {
        poiIds: [],
        blockedRoadIds:
          materialization.roadStatus === 'CLOSED'
            ? [materialization.roadId]
            : [],
      },
      requiresReplan: materialization.roadStatus === 'CLOSED',
    },
  });

  return {
    materialization,
    constraintSnapshot: snapshotWorldConstraintStore(store),
  };
}

@Injectable()
export class DecisionTickRoadBindingStore {
  private readonly byTrip = new Map<string, DecisionTickRoadBinding>();

  put(materialization: DecisionTickRoadMaterialization): DecisionTickRoadBinding {
    const binding = bindingFromMaterialization(materialization);
    this.byTrip.set(materialization.tripId, binding);
    return binding;
  }

  getLatest(tripId: string): DecisionTickRoadMaterialization | undefined {
    return this.getLatestBinding(tripId)?.materialization;
  }

  getLatestBinding(tripId: string): DecisionTickRoadBinding | undefined {
    const raw = this.byTrip.get(tripId);
    if (!raw) return undefined;
    const fresh = applyRoadTickFreshness(raw.materialization);
    if (fresh === raw.materialization) return raw;
    // Stale: rebuild constraint snapshot so CGUS/Gate see same degraded world
    return bindingFromMaterialization(fresh);
  }

  getConstraintSnapshot(
    tripId: string,
  ): WorldConstraintStoreSnapshot | undefined {
    return this.getLatestBinding(tripId)?.constraintSnapshot;
  }

  clear(tripId: string): void {
    this.byTrip.delete(tripId);
  }
}
