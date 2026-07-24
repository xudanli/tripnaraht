/**
 * WP-TEP-11/12 — persist DecisionHook + RecoveryGraph on PlanVersion.metadata.tep
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PlanVersion } from '../../guardian-decision-core/contracts/plan-version.types';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import {
  resolveTripRevision,
  revisionToString,
} from '../../trip-constraint-solver/utils/trip-revision.util';
import type { DecisionHook, RecoveryGraph } from '../contracts/tep-self-drive.types';
import {
  buildTepPlanVersionMetadata,
  readTepPlanVersionMetadata,
  type TepPlanVersionMetadata,
} from '../contracts/tep-plan-metadata.types';

export interface SyncTepPlanMetadataInput {
  tripId: string;
  planVersionRef?: string;
  decisionHooks: DecisionHook[];
  recoveryGraph?: RecoveryGraph;
}

export interface SyncTepPlanMetadataResult {
  planVersionId: string;
  synced: boolean;
  tep: TepPlanVersionMetadata;
}

@Injectable()
export class TepPlanMetadataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
  ) {}

  async loadTepMetadata(tripId: string): Promise<{
    planVersionId?: string;
    tep?: TepPlanVersionMetadata;
  }> {
    const effectiveId = await this.planVersionStore.getEffectivePlanVersionId(tripId);
    if (!effectiveId) return {};

    const version = await this.planVersionStore.get(tripId, effectiveId);
    if (!version?.metadata) {
      return { planVersionId: effectiveId };
    }

    return {
      planVersionId: effectiveId,
      tep: readTepPlanVersionMetadata(version.metadata as Record<string, unknown>),
    };
  }

  async loadDecisionHooks(tripId: string): Promise<DecisionHook[]> {
    const loaded = await this.loadTepMetadata(tripId);
    return loaded.tep?.decisionHooks ?? [];
  }

  /** Sync TEP artifacts to effective PlanVersion (creates baseline if missing). */
  async syncTepArtifacts(input: SyncTepPlanMetadataInput): Promise<SyncTepPlanMetadataResult> {
    const tep = buildTepPlanVersionMetadata({
      decisionHooks: input.decisionHooks,
      recoveryGraph: input.recoveryGraph,
    });

    const version = await this.resolveOrCreatePlanVersion(input.tripId, input.planVersionRef);
    const metadata = {
      ...(version.metadata ?? {}),
      tep,
    };

    await this.planVersionStore.upsert(input.tripId, {
      ...version,
      metadata,
    });

    const effectiveId = await this.planVersionStore.getEffectivePlanVersionId(input.tripId);
    if (!effectiveId) {
      await this.planVersionStore.setEffective(input.tripId, version.planVersionId);
    }

    return {
      planVersionId: version.planVersionId,
      synced: true,
      tep,
    };
  }

  private async resolveOrCreatePlanVersion(
    tripId: string,
    planVersionRef?: string,
  ): Promise<PlanVersion> {
    const effectiveId = await this.planVersionStore.getEffectivePlanVersionId(tripId);
    if (effectiveId) {
      const existing = await this.planVersionStore.get(tripId, effectiveId);
      if (existing) return existing;
    }

    if (planVersionRef) {
      const byRef = await this.planVersionStore.get(tripId, planVersionRef);
      if (byRef) return byRef;
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { updatedAt: true, metadata: true },
    });
    const rev = resolveTripRevision(trip ?? { metadata: {}, updatedAt: new Date() });
    const planVersionId = planVersionRef ?? `plan_${revisionToString(rev)}`;
    const now = new Date().toISOString();

    return {
      planVersionId,
      tripId,
      createdBy: 'PLANNER',
      operations: [],
      materializedPlanSnapshotRef: `snap_${planVersionId}`,
      status: 'EFFECTIVE',
      createdAt: now,
      effectiveAt: now,
      metadata: {},
    };
  }
}
