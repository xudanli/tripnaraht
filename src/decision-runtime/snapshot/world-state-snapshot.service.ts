/**
 * Canonical WorldStateSnapshot — bind one snapshotId per Decision Run.
 * Bridges guardian WorldStateStoreService + TripWorldState materialization.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import { Injectable } from '@nestjs/common';
import type { TripWorldState } from '../../trips/decision/world-model';
import type { TripPlan } from '../../trips/decision/plan-model';
import { WorldStateStoreService } from '../../trips/guardian-decision-core/evidence/world-state-store.service';
import type { CanonicalWorldStateSnapshot } from '../contracts/world-state-snapshot';
import type { WorldStateDataAvailability } from '../constraints/contracts/world-state-completeness';
import {
  computeDataCompletenessScore,
  tripWorldStateToCanonicalSnapshot,
} from './trip-world-to-canonical.util';

export interface CaptureSnapshotInput {
  tripId: string;
  worldState: TripWorldState;
  snapshotId?: string;
  plan?: TripPlan;
  dataAvailability?: WorldStateDataAvailability;
  /** When true, persist binding via WorldStateStoreService.ensureSnapshot */
  persist?: boolean;
}

export interface CaptureSnapshotResult {
  snapshotId: string;
  snapshot: CanonicalWorldStateSnapshot;
  dataCompletenessScore: number;
}

@Injectable()
export class WorldStateSnapshotService {
  constructor(private readonly worldStateStore: WorldStateStoreService) {}

  /**
   * Materialize canonical snapshot from live world state.
   * Optionally persists snapshot binding on trip.metadata.rfc001WorldState.
   */
  async capture(input: CaptureSnapshotInput): Promise<CaptureSnapshotResult> {
    const snapshotId =
      input.snapshotId ?? `ws_${input.tripId}_${Date.now()}`;

    let assertionIds: string[] | undefined;
    let revision = '1';

    if (input.persist !== false && input.tripId) {
      const bound = await this.worldStateStore.ensureSnapshot(
        input.tripId,
        snapshotId,
      );
      revision = bound.revision;
      assertionIds = bound.assertionIds;
    }

    const snapshot = tripWorldStateToCanonicalSnapshot({
      tripId: input.tripId,
      snapshotId,
      revision,
      worldState: input.worldState,
      plan: input.plan,
      dataAvailability: input.dataAvailability,
      assertionIds,
    });

    return {
      snapshotId,
      snapshot,
      dataCompletenessScore: computeDataCompletenessScore(snapshot.completeness),
    };
  }

  /** Load RFC-001 binding and re-materialize canonical view (assertions not expanded in v1). */
  async loadBinding(
    tripId: string,
    snapshotId: string,
    worldState: TripWorldState,
    plan?: TripPlan,
  ): Promise<CanonicalWorldStateSnapshot | null> {
    const binding = await this.worldStateStore.getSnapshot(tripId, snapshotId);
    if (!binding) return null;
    return tripWorldStateToCanonicalSnapshot({
      tripId,
      snapshotId: binding.snapshotId,
      revision: binding.revision,
      worldState,
      plan,
      assertionIds: binding.assertionIds,
    });
  }
}
