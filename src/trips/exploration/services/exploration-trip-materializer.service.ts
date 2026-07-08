import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripOntologyFactsIngestService } from '../../../travel-ontology/services/trip-ontology-facts-ingest.service';
import { generateDefaultTripName } from '../../utils/trip-name.util';
import type { ExplorationInput } from '../types/exploration.types';
import { countTripDays } from '../utils/exploration-input.util';
import { getConstraintsVersion } from '../../trip-constraint-solver/utils/constraints-metadata.util';
import {
  buildExplorationArchive,
  mergeTravelContextExplorationArchive,
} from '../utils/exploration-archive.util';
import { loadTravelerNationalityForExploration } from '../utils/exploration-traveler-nationality.util';

export interface ExplorationMaterializeParams {
  userId: string;
  scenarioId: string;
  initialInput: ExplorationInput;
  researchProtocolId?: string | null;
}

@Injectable()
export class ExplorationTripMaterializerService {
  private readonly logger = new Logger(ExplorationTripMaterializerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ontologyIngest: TripOntologyFactsIngestService,
  ) {}

  async materializeShell(
    params: ExplorationMaterializeParams,
  ): Promise<{ tripId: string; tripVersion: number; decisionContractVersion: number }> {
    const { startDate, endDate, dayCount } = this.resolveDates(params.initialInput);
    const destination = params.initialInput.destinationCodes[0] ?? 'UNKNOWN';

    const tripId = randomUUID();
    const tripName = generateDefaultTripName({
      destination,
      startDate: new Date(startDate),
    });

    const materializedAt = new Date().toISOString();
    const routeVariants = await this.prisma.explorationRouteVariant.findMany({
      where: { scenarioId: params.scenarioId },
      select: { routeId: true, status: true },
    });
    const explorationArchive = buildExplorationArchive({
      variants: routeVariants,
      researchProtocolId: params.researchProtocolId,
      materializedAt,
    });
    const tripMetadata = mergeTravelContextExplorationArchive(
      {
        source: 'exploration',
        explorationScenarioId: params.scenarioId,
        tripVersion: 1,
        explorationInput: params.initialInput,
        constraints: {
          vehicle_type: normalizeExplorationVehicleType(
            params.initialInput.mobilityContext?.vehicleType,
          ),
        },
      },
      { contextId: params.scenarioId, explorationArchive },
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.create({
        data: {
          id: tripId,
          name: tripName,
          destination,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: 'PLANNING',
          updatedAt: new Date(),
          metadata: tripMetadata as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.tripCollaborator.create({
        data: {
          id: randomUUID(),
          tripId,
          userId: params.userId,
          role: 'OWNER',
          updatedAt: new Date(),
        },
      });

      const start = DateTime.fromISO(startDate, { zone: 'utc' });
      for (let i = 0; i < dayCount; i++) {
        await tx.tripDay.create({
          data: {
            id: randomUUID(),
            tripId,
            date: start.plus({ days: i }).toJSDate(),
          },
        });
      }

      await tx.explorationScenario.update({
        where: { id: params.scenarioId },
        data: {
          tripId,
          status: 'MATERIALIZED',
          materializedAt: new Date(),
        },
      });
    });

    this.logger.log(`Materialized exploration trip ${tripId} for scenario ${params.scenarioId}`);

    const nationality = await loadTravelerNationalityForExploration(this.prisma, params.userId);
    await this.ontologyIngest.ingestEntryEligibilityIfNeeded({
      tripId,
      destinationCodes: params.initialInput.destinationCodes,
      nationality,
    });

    await this.ontologyIngest.ingestExplorationInsuranceDeclaration({
      tripId,
      destinationCodes: params.initialInput.destinationCodes,
      coverageTier: params.initialInput.insuranceContext?.coverageTier,
    });

    await this.ontologyIngest.ingestExplorationRentalContract({
      tripId,
      explorationInput: params.initialInput,
    });

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { metadata: true },
    });

    return {
      tripId,
      tripVersion: 1,
      decisionContractVersion: getConstraintsVersion(trip.metadata),
    };
  }

  private resolveDates(input: ExplorationInput) {
    const startDate = input.dateRange.startDate;
    const endDate = input.dateRange.endDate;
    const dayCount = countTripDays(input);
    return { startDate, endDate, dayCount };
  }
}

function normalizeExplorationVehicleType(raw?: string): '2WD' | '4WD' {
  const v = String(raw ?? '').toUpperCase();
  if (v.includes('4WD') || v.includes('AWD') || v.includes('4X4')) return '4WD';
  return '2WD';
}
