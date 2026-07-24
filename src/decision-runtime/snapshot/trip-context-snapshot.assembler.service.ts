/**
 * TripContextSnapshotAssembler — unify trip goal, contract, plan, decisions, world facts.
 */

import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { UnifiedDecisionProblemReadModelService } from '../gateway/services/unified-decision-problem-read-model.service';
import { Rfc001PlanVersionStoreService } from '../../trips/guardian-decision-core/plan-version/plan-version.store';
import { DecisionProblemResolutionStoreService } from '../gateway/persistence/decision-problem-resolution.store';
import { buildTravelDecisionContract } from '../../trips/trip-constraint-solver/utils/travel-decision-contract.builder';
import { getConstraintsVersion } from '../../trips/trip-constraint-solver/utils/constraints-metadata.util';
import { isDecisionGatewayUnifiedEnabled } from '../gateway/config/decision-gateway.config';
import { WorldStateSnapshotService } from './world-state-snapshot.service';
import { buildTripWorldStateFromPrismaTrip } from './utils/build-trip-world-state-from-prisma.util';
import type {
  AssembleTripContextSnapshotOptions,
  TripContextSnapshotView,
} from './contracts/trip-context-snapshot.types';
import { TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID } from './contracts/trip-context-snapshot.types';
import { TravelGraphStoreService } from '../../travel-compiler/services/travel-graph-store.service';
import { TripOntologyFactsLoaderService } from '../../travel-ontology/services/trip-ontology-facts-loader.service';
import { evaluateOntologyConstraints } from '../../travel-ontology/evaluators/ontology-constraint.evaluator';
import { canonicalWorldStateToTravelWorldFacts } from '../../travel-ontology/adapters/canonical-world-state-to-ontology-facts.adapter';

@Injectable()
export class TripContextSnapshotAssemblerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worldStateSnapshot: WorldStateSnapshotService,
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
    private readonly resolutionStore: DecisionProblemResolutionStoreService,
    @Optional() private readonly decisionReadModel?: UnifiedDecisionProblemReadModelService,
    @Optional() private readonly travelGraphStore?: TravelGraphStoreService,
    @Optional() private readonly tripOntologyFactsLoader?: TripOntologyFactsLoaderService,
  ) {}

  /**
   * Lightweight snapshot ref for BFF aggregation (no world-state capture).
   */
  async resolveSnapshotRef(tripId: string): Promise<{
    snapshotId: string;
    revision: string;
    constraintsVersion: number;
    effectivePlanVersionId?: string;
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const constraintsVersion = getConstraintsVersion(trip.metadata);
    const effectivePlanVersionId = await this.planVersionStore.getEffectivePlanVersionId(tripId);
    const travelGraph = this.travelGraphStore?.readGraphFromMetadata(trip.metadata);
    const travelCompilationSummary = this.travelGraphStore?.readCompilationSummary(trip.metadata);
    const revision = computeTripContextRevision({
      constraintsVersion,
      effectivePlanVersionId,
      tripUpdatedAt: trip.updatedAt.toISOString(),
      travelGraphCompileId: travelCompilationSummary?.compileId,
    });

    return {
      snapshotId: `tcs_${tripId}_${revision}`,
      revision,
      constraintsVersion,
      effectivePlanVersionId,
    };
  }

  /**
   * Assemble the full Trip Context Snapshot for a trip.
   * All planning / validate / repair entry points should declare which snapshotId they read.
   */
  async assemble(
    tripId: string,
    options?: AssembleTripContextSnapshotOptions,
  ): Promise<TripContextSnapshotView> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        destination: true,
        startDate: true,
        endDate: true,
        status: true,
        updatedAt: true,
        metadata: true,
        budgetConfig: true,
        pacingConfig: true,
        TripDay: {
          select: {
            id: true,
            ItineraryItem: { select: { id: true } },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const metadata = (trip.metadata ?? {}) as Record<string, unknown>;
    const pacing = (trip.pacingConfig ?? {}) as Record<string, unknown>;
    const budgetConfig = (trip.budgetConfig ?? {}) as Record<string, unknown>;
    const constraintsVersion = getConstraintsVersion(metadata);

    const contractFull = buildTravelDecisionContract({
      tripId,
      constraintsVersion,
      metadata,
      pacing,
      items: [],
      conflicts: [],
      conflictConstraintIds: new Set(),
    });

    const [effectivePlanVersionId, openDecisionData, resolutions] = await Promise.all([
      this.planVersionStore.getEffectivePlanVersionId(tripId),
      this.loadOpenDecisions(tripId),
      this.resolutionStore.listForTrip(tripId),
    ]);

    const durationDays = Math.max(
      1,
      Math.floor(
        DateTime.fromJSDate(trip.endDate)
          .diff(DateTime.fromJSDate(trip.startDate), 'days')
          .days,
      ) + 1,
    );

    const itemCount = trip.TripDay.reduce(
      (sum, day) => sum + day.ItineraryItem.length,
      0,
    );

    const revision = computeTripContextRevision({
      constraintsVersion,
      effectivePlanVersionId,
      tripUpdatedAt: trip.updatedAt.toISOString(),
      travelGraphCompileId: this.travelGraphStore?.readCompilationSummary(metadata)?.compileId,
    });
    const snapshotId = `tcs_${tripId}_${revision}`;

    const canonicalTravelGraph = this.travelGraphStore?.readGraphFromMetadata(metadata);
    const travelCompilationSummary = this.travelGraphStore?.readCompilationSummary(metadata);
    const projectedItinerary = this.travelGraphStore?.readProjectedItinerary(metadata);

    const worldState = buildTripWorldStateFromPrismaTrip(trip);
    const [worldCapture, tripOntologyFacts] = await Promise.all([
      this.worldStateSnapshot.capture({
        tripId,
        worldState,
        snapshotId,
        persist: options?.persistWorldBinding === true,
      }),
      this.tripOntologyFactsLoader?.loadForTrip(tripId) ?? Promise.resolve([]),
    ]);

    const ontologyFactsForEval = [
      ...canonicalWorldStateToTravelWorldFacts(worldCapture.snapshot),
      ...tripOntologyFacts,
    ];
    const ontologyEvaluation =
      ontologyFactsForEval.length > 0
        ? evaluateOntologyConstraints(ontologyFactsForEval)
        : undefined;
    const ontologyConstraints = ontologyEvaluation
      ? {
          blockerCount: ontologyEvaluation.results.filter((r) => r.severity === 'BLOCK').length,
          warningCount: ontologyEvaluation.results.filter((r) => r.severity === 'WARNING').length,
          missingEvidenceCount: ontologyEvaluation.results.filter(
            (r) => r.severity === 'MISSING_EVIDENCE',
          ).length,
          codes: ontologyEvaluation.results.map((r) => r.code),
        }
      : undefined;

    const nlDraft = (metadata.nlDraft ?? {}) as Record<string, unknown>;
    const rawUserIntent =
      typeof nlDraft.rawUserIntent === 'string' ? nlDraft.rawUserIntent : undefined;

    const travelers = Array.isArray(budgetConfig.travelers)
      ? budgetConfig.travelers
      : Array.isArray(metadata.travelers)
        ? metadata.travelers
        : [];

    const decisionHistory = Object.values(resolutions)
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
      .slice(0, 20)
      .map((r) => ({
        resolutionId: r.resolutionId,
        problemId: r.problemId,
        selectedActionId: r.selectedActionId,
        status: r.status,
        decidedAt: r.decidedAt,
      }));

    return {
      schemaId: TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID,
      snapshotId,
      revision,
      tripId,
      createdAt: new Date().toISOString(),
      tripUpdatedAt: trip.updatedAt.toISOString(),
      bindings: {
        constraintsVersion,
        effectivePlanVersionId,
        worldSnapshotId: worldCapture.snapshotId,
        dataCompletenessScore: worldCapture.dataCompletenessScore,
      },
      goal: {
        rankedPrinciples: contractFull.objectives.rankedPrinciples,
        rawUserIntent,
        destination: trip.destination,
        startDate: trip.startDate.toISOString().slice(0, 10),
        endDate: trip.endDate.toISOString().slice(0, 10),
        durationDays,
        tripStatus: trip.status,
      },
      members: {
        count: travelers.length,
        travelers,
      },
      preferences: {
        tripScoped: {
          pacingConfig: pacing,
          rankedPrinciples: contractFull.objectives.rankedPrinciples,
          changeStrategyArchetype: contractFull.changeStrategy.archetype,
        },
        userScopedAvailable: false,
      },
      contract: {
        objectives: contractFull.objectives,
        changeStrategy: contractFull.changeStrategy,
        automation: contractFull.automation,
        teamGovernance: contractFull.teamGovernance,
        conflicts: contractFull.conflicts,
      },
      effectivePlan: {
        versionId: effectivePlanVersionId,
        dayCount: trip.TripDay.length,
        itemCount,
        hasEffectivePlan: Boolean(effectivePlanVersionId),
        graphProjectedItemCount: projectedItinerary
          ? projectedItinerary.days.reduce((sum, d) => sum + d.items.length, 0)
          : undefined,
      },
      budget: budgetConfig.total
        ? {
            currency: budgetConfig.currency ? String(budgetConfig.currency) : undefined,
            total: Number(budgetConfig.total),
            style: budgetConfig.style ? String(budgetConfig.style) : undefined,
          }
        : undefined,
      worldFacts: worldCapture.snapshot,
      tripOntologyFacts: tripOntologyFacts.length > 0 ? tripOntologyFacts : undefined,
      ontologyConstraints,
      openDecisions: {
        count: openDecisionData.count,
        blockingCount: openDecisionData.blockingCount,
        actionableCount: openDecisionData.actionableCount,
        problemIds: openDecisionData.problemIds,
      },
      uncertainties: openDecisionData.uncertainties,
      monitoring: {
        activeCount: 0,
        items: [],
      },
      decisionHistory,
      canonicalTravelGraph,
      travelCompilation: travelCompilationSummary
        ? {
            compileId: travelCompilationSummary.compileId,
            status: travelCompilationSummary.status,
            score: travelCompilationSummary.score,
            finishedAt: travelCompilationSummary.finishedAt,
            poiResolved: canonicalTravelGraph?.stats.poiResolved,
            poiUnresolved: canonicalTravelGraph?.stats.poiUnresolved,
          }
        : undefined,
    };
  }

  private async loadOpenDecisions(tripId: string): Promise<
    TripContextSnapshotView['openDecisions'] & {
      uncertainties: TripContextSnapshotView['uncertainties'];
    }
  > {
    if (!isDecisionGatewayUnifiedEnabled() || !this.decisionReadModel) {
      return {
        count: 0,
        blockingCount: 0,
        actionableCount: 0,
        problemIds: [],
        uncertainties: [],
      };
    }

    const [counts, list] = await Promise.all([
      this.decisionReadModel.countQueueEligibleOpenProblems(tripId),
      this.decisionReadModel.listProblems(tripId, { queueOnly: true }),
    ]);

    const openItems = list.items.filter(
      (item) => !['RESOLVED', 'DISMISSED'].includes(item.workflowStatus),
    );

    const uncertainties = openItems
      .filter((item) => item.enforcement === 'WARN' || item.enforcement === 'INFORM')
      .map((item) => ({
        problemId: item.problemId,
        headline: item.title,
        affectedDayNumbers: item.scope.dayIds,
      }));

    return {
      count: counts.openCount,
      blockingCount: counts.blockingCount,
      actionableCount: counts.actionableCount,
      problemIds: openItems.map((item) => item.problemId),
      uncertainties,
    };
  }
}

export function computeTripContextRevision(input: {
  constraintsVersion: number;
  effectivePlanVersionId?: string;
  tripUpdatedAt: string;
  travelGraphCompileId?: string;
}): string {
  const planPart = input.effectivePlanVersionId ?? 'no_effective_plan';
  const compilePart = input.travelGraphCompileId ?? 'no_travel_graph';
  const updatedMs = Date.parse(input.tripUpdatedAt) || 0;
  return `cv${input.constraintsVersion}_${planPart}_${compilePart}_${updatedMs}`;
}
