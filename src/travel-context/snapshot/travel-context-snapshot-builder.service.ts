import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripContextSnapshotAssemblerService } from '../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import { EXPLORATION_ROUTE_VARIANT_STATUS } from '../../trips/exploration/constants/exploration-status.constants';
import type { TravelContextSnapshot } from '../domain/travel-context.types';
import { resolveCanonicalContextId } from '../domain/travel-context-identity.util';
import {
  ExplorationContextAdapter,
  type ExplorationScenarioRecord,
} from './adapters/exploration-context.adapter';
import { TripContextAdapterService } from './adapters/trip-context.adapter.service';
import { TravelContextResolverService } from './travel-context-resolver.service';
import { readExplorationArchiveFromTripMetadata } from '../../trips/exploration/utils/exploration-archive.util';
import { TravelContextSnapshotArchiveService } from './travel-context-snapshot-archive.service';
import type { ResolvedTravelContextRef } from './travel-context-resolver.service';

@Injectable()
export class TravelContextSnapshotBuilderService {
  constructor(
    private readonly resolver: TravelContextResolverService,
    private readonly tripAssembler: TripContextSnapshotAssemblerService,
    private readonly explorationAdapter: ExplorationContextAdapter,
    private readonly tripAdapter: TripContextAdapterService,
    private readonly prisma: PrismaService,
    private readonly archive: TravelContextSnapshotArchiveService,
  ) {}

  async build(contextId: string): Promise<TravelContextSnapshot> {
    const ref = await this.resolver.resolve(contextId);
    const revisionKey = await this.resolveRevisionKey(ref);
    if (revisionKey != null) {
      const cached = await this.archive.tryLoadCached(ref.contextId, revisionKey);
      if (cached) {
        return cached;
      }
    }

    const snapshot = ref.tripId
      ? await this.buildFromTrip(ref.contextId, ref.ownerUserId, ref.tripId, ref.scenarioId)
      : await this.explorationAdapter.buildFromScenario(await this.requireScenario(ref.contextId));

    await this.archive.archive(snapshot, { archiveSource: 'ASSEMBLE' });
    return snapshot;
  }

  async buildFromTripId(tripId: string, ownerUserId: string): Promise<TravelContextSnapshot> {
    const ref = await this.resolver.resolveByTripId(tripId);
    return this.buildFromTrip(ref.contextId, ownerUserId, tripId, ref.scenarioId);
  }

  private async buildFromTrip(
    contextId: string,
    ownerUserId: string,
    tripId: string,
    scenarioId?: string,
  ): Promise<TravelContextSnapshot> {
    const [tripSnapshot, explorationArchive] = await Promise.all([
      this.tripAssembler.assemble(tripId),
      this.loadExplorationArchive(scenarioId, tripId),
    ]);

    return this.tripAdapter.buildFromTripSnapshot({
      contextId,
      ownerUserId,
      tripSnapshot,
      explorationArchive,
    });
  }

  private async resolveRevisionKey(ref: ResolvedTravelContextRef): Promise<number | null> {
    if (ref.tripId) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: ref.tripId },
        select: { updatedAt: true },
      });
      return trip ? trip.updatedAt.getTime() : null;
    }

    const scenario =
      (await this.prisma.explorationScenario.findUnique({ where: { contextId: ref.contextId } })) ??
      (await this.prisma.explorationScenario.findUnique({ where: { id: ref.contextId } }));
    return scenario ? scenario.updatedAt.getTime() : null;
  }

  private async requireScenario(contextId: string): Promise<ExplorationScenarioRecord> {
    const scenario =
      (await this.prisma.explorationScenario.findUnique({ where: { contextId } })) ??
      (await this.prisma.explorationScenario.findUnique({ where: { id: contextId } }));
    if (!scenario) {
      throw new Error(`Exploration scenario ${contextId} not found`);
    }
    return {
      ...(scenario as ExplorationScenarioRecord),
      contextId: resolveCanonicalContextId(scenario),
    };
  }

  private async loadExplorationArchive(scenarioId?: string, tripId?: string) {
    if (tripId) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      const fromTrip = readExplorationArchiveFromTripMetadata(
        (trip?.metadata as Record<string, unknown>) ?? null,
      );
      if (fromTrip) return fromTrip;
    }

    if (!scenarioId) return undefined;

    const scenario = await this.prisma.explorationScenario.findUnique({
      where: { id: scenarioId },
      select: {
        researchProtocolId: true,
        materializedAt: true,
        routeVariants: {
          select: { routeId: true, status: true },
        },
      },
    });
    if (!scenario) return undefined;

    const selected = scenario.routeVariants.find(
      (v) => v.status === EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED,
    );
    const rejectedRouteIds = scenario.routeVariants
      .filter((v) => v.status === EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED)
      .map((v) => v.routeId);

    return {
      rejectedRouteIds,
      selectedRouteId: selected?.routeId ?? null,
      researchProtocolId: scenario.researchProtocolId,
      materializedAt: scenario.materializedAt?.toISOString(),
    };
  }
}
