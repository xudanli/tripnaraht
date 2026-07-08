import { Injectable, Optional } from '@nestjs/common';
import type { TripContextSnapshotView } from '../../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import type { ContextHistory, ContextHistoryEntry, TravelContextSnapshot } from '../../domain/travel-context.types';
import {
  buildTravelContextIdentity,
  mapExplorationStatusToStage,
  readTravelContextIdFromTripMetadata,
} from '../../domain/travel-context-identity.util';
import { TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID } from '../../domain/travel-context.constants';
import { TravelContextRevisionService } from '../travel-context-revision.service';
import {
  mapTripOpenDecisions,
  type TripOpenDecisionSource,
} from '../../projections/view-projections.util';
import {
  mapWorldFactsFromTripSnapshot,
  mapTripContractAndParticipants,
  mapTripIntent,
  resolveTripExecutabilityStatus,
} from './trip-context.adapter-mappers';

export interface TripContextAdapterInput {
  contextId: string;
  ownerUserId: string;
  tripSnapshot: TripContextSnapshotView;
  explorationArchive?: ContextHistory['explorationArchive'];
  openDecisionSources?: TripOpenDecisionSource[];
}

@Injectable()
export class TripContextAdapterService {
  constructor(
    private readonly revisionService: TravelContextRevisionService,
    @Optional() private readonly decisionReadModel?: UnifiedDecisionProblemReadModelService,
  ) {}

  async buildFromTripSnapshot(input: TripContextAdapterInput): Promise<TravelContextSnapshot> {
    const openSources =
      input.openDecisionSources ??
      (await this.loadOpenDecisionSources(input.tripSnapshot.tripId));

    return mapTripContextSnapshotToTravelContext({
      ...input,
      revisionService: this.revisionService,
      openDecisionSources: openSources,
    });
  }

  resolveContextIdFromTripMetadata(metadata: Record<string, unknown> | null | undefined): string | undefined {
    return readTravelContextIdFromTripMetadata(metadata);
  }

  private async loadOpenDecisionSources(tripId: string): Promise<TripOpenDecisionSource[]> {
    if (!isDecisionGatewayUnifiedEnabled() || !this.decisionReadModel) {
      return [];
    }
    const list = await this.decisionReadModel.listProblems(tripId, { queueOnly: true });
    return list.items
      .filter((item) => !['RESOLVED', 'DISMISSED'].includes(item.workflowStatus))
      .map((item) => ({
        problemId: item.problemId,
        title: item.title,
        workflowStatus: item.workflowStatus,
        enforcement: item.enforcement,
      }));
  }
}

/** Maps TripContextSnapshotView → TravelContextSnapshot (RFC-003 Phase 2). */
export function mapTripContextSnapshotToTravelContext(input: {
  contextId: string;
  ownerUserId: string;
  tripSnapshot: TripContextSnapshotView;
  explorationArchive?: ContextHistory['explorationArchive'];
  revisionService: TravelContextRevisionService;
  openDecisionSources?: TripOpenDecisionSource[];
}): TravelContextSnapshot {
  const { tripSnapshot: t, contextId, ownerUserId, explorationArchive, revisionService } = input;
  const updatedAtMs = Date.parse(t.tripUpdatedAt) || Date.now();

  const stage = mapExplorationStatusToStage({
    scenarioStatus: 'MATERIALIZED',
    tripId: t.tripId,
    tripStatus: t.goal.tripStatus,
  });

  const revision = revisionService.compute({
    updatedAtMs,
    constraintsVersion: t.bindings.constraintsVersion,
    effectivePlanVersionId: t.bindings.effectivePlanVersionId,
    worldStateVersion: revisionService.buildWorldStateVersion(t.bindings.worldSnapshotId),
    stage,
  });

  const identity = buildTravelContextIdentity({
    contextId,
    ownerUserId,
    createdAt: t.createdAt,
    stage,
    scenarioId: contextId,
    tripId: t.tripId,
  });

  const openSources =
    input.openDecisionSources ??
    t.openDecisions.problemIds.map((problemId) => ({
      problemId,
      title: problemId,
      workflowStatus: 'DETECTED',
    }));

  const openDecisions = mapTripOpenDecisions({
    counts: {
      total: t.openDecisions.count,
      blocking: t.openDecisions.blockingCount,
      actionable: t.openDecisions.actionableCount,
    },
    sources: openSources,
  });

  const decisionHistoryEntries: ContextHistoryEntry[] = t.decisionHistory.map((h, idx) => ({
    entryId: h.resolutionId || `hist_${idx}`,
    at: h.decidedAt,
    revision,
    kind: 'DECISION_RESOLVED' as const,
    headline: `Decision ${h.problemId}: ${h.status}`,
    actor: 'USER' as const,
    refs: {
      problemId: h.problemId,
      selectedActionId: h.selectedActionId,
    },
  }));

  if (explorationArchive?.materializedAt) {
    decisionHistoryEntries.unshift({
      entryId: `explore_mat_${contextId}`,
      at: explorationArchive.materializedAt,
      revision,
      kind: 'EXPLORATION_MILESTONE',
      headline: 'Exploration materialized to trip',
      actor: 'USER',
      refs: {
        selectedRouteId: explorationArchive.selectedRouteId ?? '',
      },
    });
  }

  const { participants, contract } = mapTripContractAndParticipants(t);

  return {
    schemaId: TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID,
    identity,
    meta: {
      snapshotId: revisionService.buildSnapshotId(contextId, revision),
      revision,
      generatedAt: new Date().toISOString(),
      consistency: 'STRONG',
      bindings: {
        constraintsVersion: t.bindings.constraintsVersion,
        effectivePlanVersionId: t.bindings.effectivePlanVersionId,
        worldStateVersion: revisionService.buildWorldStateVersion(t.bindings.worldSnapshotId),
      },
    },
    intent: mapTripIntent(t),
    participants,
    contract,
    plan: {
      effectivePlan: {
        versionId: t.effectivePlan.versionId,
        dayCount: t.effectivePlan.dayCount,
        itemCount: t.effectivePlan.itemCount,
        hasEffectivePlan: t.effectivePlan.hasEffectivePlan,
        executabilityStatus: resolveTripExecutabilityStatus(t),
      },
      selectedRouteId: explorationArchive?.selectedRouteId ?? null,
    },
    world: {
      facts: mapWorldFactsFromTripSnapshot(t),
      dataCompletenessScore: t.bindings.dataCompletenessScore,
      lastRefreshedAt: t.createdAt,
      ontologyConstraints: t.ontologyConstraints,
    },
    decisions: {
      open: openDecisions,
      counts: {
        total: t.openDecisions.count,
        blocking: t.openDecisions.blockingCount,
        actionable: t.openDecisions.actionableCount,
      },
    },
    monitoring: {
      activeCount: t.monitoring.activeCount,
      items: t.monitoring.items.map((item, idx) => ({
        itemId: `mon_${idx}`,
        kind: item.kind,
        status: item.status,
        headline: item.kind,
        lastCheckedAt: item.lastCheckedAt,
      })),
      paused: false,
    },
    history: {
      recent: decisionHistoryEntries.slice(0, 20),
      explorationArchive,
    },
  };
}
