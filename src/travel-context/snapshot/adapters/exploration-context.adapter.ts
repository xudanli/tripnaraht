import { randomUUID } from 'crypto';
import { resolveCanonicalContextId } from '../../domain/travel-context-identity.util';
import { TravelContextRevisionService } from '../travel-context-revision.service';
import {
  buildTravelContextIdentity,
  mapExplorationStatusToStage,
} from '../../domain/travel-context-identity.util';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  EXPLORATION_ROUTE_VARIANT_STATUS,
} from '../../../trips/exploration/constants/exploration-status.constants';
import type { ExplorationInput } from '../../../trips/exploration/types/exploration.types';
import { TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID } from '../../domain/travel-context.constants';
import type {
  ContextHistory,
  TravelContextSnapshot,
} from '../../domain/travel-context.types';

export interface ExplorationScenarioRecord {
  id: string;
  contextId: string;
  userId: string;
  status: string;
  researchProtocolId: string | null;
  initialInput: unknown;
  tripId: string | null;
  materializedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ExplorationContextAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisionService: TravelContextRevisionService,
  ) {}

  async buildFromScenario(
    scenario: ExplorationScenarioRecord,
  ): Promise<TravelContextSnapshot> {
    const contextId = resolveCanonicalContextId(scenario);
    const initialInput = scenario.initialInput as ExplorationInput;

    const [candidatesStatus, variants] = await Promise.all([
      this.loadCandidatesSummary(scenario.id),
      this.prisma.explorationRouteVariant.findMany({
        where: { scenarioId: scenario.id },
        select: { routeId: true, status: true, title: true },
      }),
    ]);

    const selected = variants.find((v) => v.status === EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED);
    const rejectedRouteIds = variants
      .filter((v) => v.status === EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED)
      .map((v) => v.routeId);

    const stage = mapExplorationStatusToStage({
      scenarioStatus: scenario.status,
      tripId: scenario.tripId,
      candidatesSelected: Boolean(selected),
    });

    const revision = this.revisionService.explorationRevision({
      updatedAt: scenario.updatedAt,
      generationVersion: candidatesStatus.generationVersion,
      stage,
    });

    const identity = buildTravelContextIdentity({
      contextId,
      ownerUserId: scenario.userId,
      createdAt: scenario.createdAt.toISOString(),
      stage,
      scenarioId: scenario.id,
      tripId: scenario.tripId ?? undefined,
    });

    const explorationArchive: ContextHistory['explorationArchive'] = {
      rejectedRouteIds,
      selectedRouteId: selected?.routeId ?? candidatesStatus.selectedRouteId,
      researchProtocolId: scenario.researchProtocolId,
      materializedAt: scenario.materializedAt?.toISOString(),
    };

    const destinationCode = initialInput.destinationCodes[0];

    return {
      schemaId: TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID,
      identity,
      meta: {
        snapshotId: this.revisionService.buildSnapshotId(contextId, revision),
        revision,
        generatedAt: new Date().toISOString(),
        consistency: scenario.tripId ? 'PARTIAL' : 'STRONG',
        bindings: {
          constraintsVersion: 0,
          worldStateVersion: 'exploration_pre_trip',
        },
      },
      intent: {
        destination: {
          status: destinationCode ? 'CONFIRMED' : 'UNKNOWN',
          countryCode: destinationCode,
          label: destinationCode,
          candidates: initialInput.destinationCodes,
        },
        dateRange: initialInput.dateRange
          ? {
              startDate: initialInput.dateRange.startDate,
              endDate: initialInput.dateRange.endDate,
              flexibility: 'FIXED',
            }
          : undefined,
        budget: initialInput.budget
          ? {
              currency: initialInput.budget.currency,
              min: initialInput.budget.min,
              max: initialInput.budget.max,
            }
          : undefined,
      },
      participants: {
        count: initialInput.travelers?.length ?? 0,
        publicSummary: (initialInput.travelers ?? []).map((t, i) => ({
          memberId: `traveler_${i}`,
          role: t.type,
          mobilityBand: t.age !== undefined ? `age_${t.age}` : undefined,
        })),
        preferenceCoverage: {
          mobility: initialInput.travelers?.length ? 'PARTIAL' : 'MISSING',
          privateWishes: 'MISSING',
        },
      },
      contract: {
        constraints: [],
      },
      plan: {
        effectivePlan: {
          dayCount: countDays(initialInput),
          itemCount: 0,
          hasEffectivePlan: false,
          executabilityStatus: 'UNKNOWN',
        },
        selectedRouteId: selected?.routeId ?? null,
        draftChanges: {
          hasDraft: candidatesStatus.activeCount > 0,
          changedDayCount: candidatesStatus.activeCount > 0 ? countDays(initialInput) : 0,
        },
      },
      world: {
        facts: [],
        dataCompletenessScore: 0,
      },
      decisions: {
        open: [],
        counts: { total: 0, blocking: 0, actionable: 0 },
      },
      monitoring: {
        activeCount: 0,
        items: [],
        paused: false,
      },
      history: {
        recent: scenario.materializedAt
          ? [
              {
                entryId: `explore_mat_${scenario.id}`,
                at: scenario.materializedAt.toISOString(),
                revision,
                kind: 'EXPLORATION_MILESTONE',
                headline: 'Scenario materialized to trip shell',
                actor: 'USER',
                refs: { tripId: scenario.tripId ?? '' },
              },
            ]
          : [],
        explorationArchive,
      },
    };
  }

  private async loadCandidatesSummary(scenarioId: string) {
    const [draftCount, selected, maxGen] = await Promise.all([
      this.prisma.explorationRouteVariant.count({
        where: { scenarioId, status: EXPLORATION_ROUTE_VARIANT_STATUS.DRAFT },
      }),
      this.prisma.explorationRouteVariant.findFirst({
        where: { scenarioId, status: EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED },
        select: { routeId: true, generationVersion: true },
      }),
      this.prisma.explorationRouteVariant.aggregate({
        where: { scenarioId },
        _max: { generationVersion: true },
      }),
    ]);

    return {
      activeCount: draftCount,
      selectedRouteId: selected?.routeId ?? null,
      generationVersion: maxGen._max.generationVersion,
    };
  }
}

function countDays(input: ExplorationInput): number {
  const start = Date.parse(input.dateRange.startDate);
  const end = Date.parse(input.dateRange.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

/** Pure helper for tests — map in-memory scenario without DB */
export function mapExplorationScenarioToTravelContext(input: {
  scenario: ExplorationScenarioRecord;
  candidatesStatus: {
    activeCount: number;
    selectedRouteId: string | null;
    generationVersion: number | null;
  };
  rejectedRouteIds: string[];
}): TravelContextSnapshot {
  const revisionService = new TravelContextRevisionService();
  const { scenario, candidatesStatus, rejectedRouteIds } = input;
  const initialInput = scenario.initialInput as ExplorationInput;
  const contextId = resolveCanonicalContextId(scenario);

  const selectedRouteId = candidatesStatus.selectedRouteId;
  const stage = mapExplorationStatusToStage({
    scenarioStatus: scenario.status,
    tripId: scenario.tripId,
    candidatesSelected: Boolean(selectedRouteId),
  });

  const revision = revisionService.explorationRevision({
    updatedAt: scenario.updatedAt,
    generationVersion: candidatesStatus.generationVersion,
    stage,
  });

  return {
    schemaId: TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID,
    identity: buildTravelContextIdentity({
      contextId,
      ownerUserId: scenario.userId,
      createdAt: scenario.createdAt.toISOString(),
      stage,
      scenarioId: scenario.id,
      tripId: scenario.tripId ?? undefined,
    }),
    meta: {
      snapshotId: revisionService.buildSnapshotId(contextId, revision),
      revision,
      generatedAt: new Date().toISOString(),
      consistency: 'STRONG',
      bindings: {
        constraintsVersion: 0,
        worldStateVersion: 'exploration_pre_trip',
      },
    },
    intent: {
      destination: {
        status: initialInput.destinationCodes[0] ? 'CONFIRMED' : 'UNKNOWN',
        countryCode: initialInput.destinationCodes[0],
        candidates: initialInput.destinationCodes,
      },
      dateRange: initialInput.dateRange,
    },
    participants: {
      count: initialInput.travelers?.length ?? 0,
      publicSummary: [],
      preferenceCoverage: { mobility: 'MISSING', privateWishes: 'MISSING' },
    },
    contract: { constraints: [] },
    plan: {
      effectivePlan: {
        dayCount: countDays(initialInput),
        itemCount: 0,
        hasEffectivePlan: false,
      },
      selectedRouteId,
    },
    world: { facts: [], dataCompletenessScore: 0 },
    decisions: { open: [], counts: { total: 0, blocking: 0, actionable: 0 } },
    monitoring: { activeCount: 0, items: [], paused: false },
    history: {
      recent: [],
      explorationArchive: {
        rejectedRouteIds,
        selectedRouteId,
        researchProtocolId: scenario.researchProtocolId,
      },
    },
  };
}
