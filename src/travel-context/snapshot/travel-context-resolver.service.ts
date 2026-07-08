import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { readTravelContextIdFromTripMetadata } from '../domain/travel-context-identity.util';

export interface ResolvedTravelContextRef {
  contextId: string;
  ownerUserId: string;
  scenarioId?: string;
  tripId?: string;
  source: 'exploration_scenario' | 'trip_metadata' | 'trip_id_fallback';
}

@Injectable()
export class TravelContextResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(contextId: string): Promise<ResolvedTravelContextRef> {
    const scenario = await this.findScenarioByContextId(contextId);

    if (scenario) {
      return {
        contextId: scenario.contextId,
        ownerUserId: scenario.userId,
        scenarioId: scenario.id,
        tripId: scenario.tripId ?? undefined,
        source: 'exploration_scenario',
      };
    }

    const tripByScenarioLink = await this.prisma.trip.findFirst({
      where: {
        metadata: {
          path: ['explorationScenarioId'],
          equals: contextId,
        },
      },
      select: { id: true, metadata: true, TripCollaborator: { select: { userId: true, role: true } } },
    });

    if (tripByScenarioLink) {
      const owner =
        tripByScenarioLink.TripCollaborator.find((c) => c.role === 'OWNER')?.userId ??
        tripByScenarioLink.TripCollaborator[0]?.userId;
      if (!owner) {
        throw new NotFoundException(`Travel context ${contextId} has no owner`);
      }
      const linkedContextId =
        readTravelContextIdFromTripMetadata(tripByScenarioLink.metadata as Record<string, unknown>) ??
        contextId;
      return {
        contextId: linkedContextId,
        ownerUserId: owner,
        scenarioId: contextId,
        tripId: tripByScenarioLink.id,
        source: 'trip_metadata',
      };
    }

    const tripByContextMetadata = await this.prisma.trip.findFirst({
      where: {
        OR: [
          { metadata: { path: ['travelContextId'], equals: contextId } },
          { metadata: { path: ['travelContext', 'contextId'], equals: contextId } },
        ],
      },
      select: { id: true, metadata: true, TripCollaborator: { select: { userId: true, role: true } } },
    });

    if (tripByContextMetadata) {
      const owner =
        tripByContextMetadata.TripCollaborator.find((c) => c.role === 'OWNER')?.userId ??
        tripByContextMetadata.TripCollaborator[0]?.userId;
      if (!owner) {
        throw new NotFoundException(`Travel context ${contextId} has no owner`);
      }
      return {
        contextId,
        ownerUserId: owner,
        scenarioId: readTravelContextIdFromTripMetadata(
          tripByContextMetadata.metadata as Record<string, unknown>,
        ),
        tripId: tripByContextMetadata.id,
        source: 'trip_metadata',
      };
    }

    const tripById = await this.prisma.trip.findUnique({
      where: { id: contextId },
      select: { id: true, metadata: true, TripCollaborator: { select: { userId: true, role: true } } },
    });

    if (tripById) {
      const linkedContextId = readTravelContextIdFromTripMetadata(
        tripById.metadata as Record<string, unknown>,
      );
      const owner =
        tripById.TripCollaborator.find((c) => c.role === 'OWNER')?.userId ??
        tripById.TripCollaborator[0]?.userId;
      if (!owner) {
        throw new NotFoundException(`Travel context ${contextId} has no owner`);
      }
      return {
        contextId: linkedContextId ?? contextId,
        ownerUserId: owner,
        scenarioId: linkedContextId,
        tripId: tripById.id,
        source: 'trip_id_fallback',
      };
    }

    throw new NotFoundException(`Travel context ${contextId} not found`);
  }

  /** Resolve Travel Context from trip id (Phase 2 — trip read entry). */
  async resolveByTripId(tripId: string): Promise<ResolvedTravelContextRef> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        metadata: true,
        TripCollaborator: { select: { userId: true, role: true } },
      },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const metadata = trip.metadata as Record<string, unknown>;
    const contextId =
      readTravelContextIdFromTripMetadata(metadata) ??
      (typeof metadata.explorationScenarioId === 'string'
        ? metadata.explorationScenarioId
        : tripId);

    const owner =
      trip.TripCollaborator.find((c) => c.role === 'OWNER')?.userId ??
      trip.TripCollaborator[0]?.userId;
    if (!owner) {
      throw new NotFoundException(`Trip ${tripId} has no owner`);
    }

    const scenario = await this.findScenarioByContextId(contextId);

    return {
      contextId: scenario?.contextId ?? contextId,
      ownerUserId: owner,
      scenarioId: scenario?.id ?? contextId,
      tripId: trip.id,
      source: scenario ? 'exploration_scenario' : 'trip_metadata',
    };
  }

  private async findScenarioByContextId(contextId: string) {
    const byContextId = await this.prisma.explorationScenario.findUnique({
      where: { contextId },
      select: {
        id: true,
        contextId: true,
        userId: true,
        tripId: true,
      },
    });
    if (byContextId) return byContextId;

    return this.prisma.explorationScenario.findUnique({
      where: { id: contextId },
      select: {
        id: true,
        contextId: true,
        userId: true,
        tripId: true,
      },
    });
  }
}
