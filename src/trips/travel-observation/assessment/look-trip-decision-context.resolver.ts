/**
 * Resolve trip planVersionId + worldStateSnapshotId for Look → RFC-001 projection.
 * Mirrors TEP resolvePlanVersionId; never writes PlanVersion.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorldStateStoreService } from '../../guardian-decision-core/evidence/world-state-store.service';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import {
  resolveTripRevision,
  revisionToString,
} from '../../trip-constraint-solver/utils/trip-revision.util';

export type LookContextPlanSource = 'effective' | 'revision' | 'pending';
export type LookContextSnapshotSource = 'latest' | 'look_local';

export interface LookTripDecisionContext {
  planVersionId: string;
  worldStateSnapshotId: string;
  source: {
    planVersion: LookContextPlanSource;
    snapshot: LookContextSnapshotSource;
  };
}

@Injectable()
export class LookTripDecisionContextResolver {
  private readonly logger = new Logger(LookTripDecisionContextResolver.name);

  constructor(
    @Optional() private readonly planVersionStore?: Rfc001PlanVersionStoreService,
    @Optional() private readonly worldStateStore?: WorldStateStoreService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async resolve(
    tripId: string,
    observationId: string,
  ): Promise<LookTripDecisionContext> {
    const plan = await this.resolvePlanVersionId(tripId);
    const snap = await this.resolveWorldStateSnapshotId(tripId, observationId);
    return {
      planVersionId: plan.planVersionId,
      worldStateSnapshotId: snap.worldStateSnapshotId,
      source: {
        planVersion: plan.source,
        snapshot: snap.source,
      },
    };
  }

  private async resolvePlanVersionId(tripId: string): Promise<{
    planVersionId: string;
    source: LookContextPlanSource;
  }> {
    try {
      const effective =
        await this.planVersionStore?.getEffectivePlanVersionId(tripId);
      if (effective) {
        return { planVersionId: effective, source: 'effective' };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Look planVersion effective lookup failed trip=${tripId}: ${message}`,
      );
    }

    if (this.prisma) {
      try {
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { metadata: true, updatedAt: true },
        });
        if (trip) {
          const rev = resolveTripRevision(trip);
          return {
            planVersionId: `plan_${revisionToString(rev)}`,
            source: 'revision',
          };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Look planVersion revision lookup failed trip=${tripId}: ${message}`,
        );
      }
    }

    return {
      planVersionId: 'PLAN_VERSION_PENDING_LOOK',
      source: 'pending',
    };
  }

  private async resolveWorldStateSnapshotId(
    tripId: string,
    observationId: string,
  ): Promise<{
    worldStateSnapshotId: string;
    source: LookContextSnapshotSource;
  }> {
    try {
      const store = await this.worldStateStore?.readStore(tripId);
      const latest = store?.snapshots
        ?.slice()
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
      if (latest?.snapshotId) {
        return {
          worldStateSnapshotId: latest.snapshotId,
          source: 'latest',
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Look worldState snapshot lookup failed trip=${tripId}: ${message}`,
      );
    }

    return {
      worldStateSnapshotId: `ws_look_${observationId}`,
      source: 'look_local',
    };
  }
}
