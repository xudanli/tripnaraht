import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripOntologyFactsIngestService } from '../../../travel-ontology/services/trip-ontology-facts-ingest.service';
import { generateDefaultTripName } from '../../utils/trip-name.util';
import type { ExplorationInput } from '../types/exploration.types';
import { countTripDays } from '../utils/exploration-input.util';

@Injectable()
export class ExplorationTripConditionsSyncService {
  private readonly logger = new Logger(ExplorationTripConditionsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ontologyIngest: TripOntologyFactsIngestService,
  ) {}

  /** 物化后条件变更 — 同步 Trip shell（选路前） */
  async syncTripFromInput(tripId: string, input: ExplorationInput): Promise<void> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { metadata: true },
    });

    const destination = input.destinationCodes[0] ?? 'UNKNOWN';
    const { startDate, endDate, dayCount } = this.resolveDates(input);
    const metadata = {
      ...((trip.metadata as Record<string, unknown>) ?? {}),
      explorationInput: input,
      constraints: {
        ...(((trip.metadata as Record<string, unknown>)?.constraints as Record<string, unknown>) ??
          {}),
        vehicle_type: normalizeExplorationVehicleType(input.mobilityContext?.vehicleType),
      },
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: tripId },
        data: {
          destination,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          name: generateDefaultTripName({ destination, startDate: new Date(startDate) }),
          metadata: metadata as unknown as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });

      await this.reconcileTripDays(tx, tripId, startDate, dayCount);
    });

    this.logger.log(`Synced trip ${tripId} from exploration conditions (${dayCount} days)`);

    await this.ontologyIngest.ingestExplorationInsuranceDeclaration({
      tripId,
      destinationCodes: input.destinationCodes,
      coverageTier: input.insuranceContext?.coverageTier,
    });

    await this.ontologyIngest.ingestExplorationRentalContract({
      tripId,
      explorationInput: input,
    });
  }

  private async reconcileTripDays(
    tx: Prisma.TransactionClient,
    tripId: string,
    startDate: string,
    targetDayCount: number,
  ) {
    const existing = await tx.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      select: { id: true, date: true },
    });

    if (existing.length < targetDayCount) {
      const start = DateTime.fromISO(startDate, { zone: 'utc' });
      for (let i = existing.length; i < targetDayCount; i++) {
        await tx.tripDay.create({
          data: {
            id: randomUUID(),
            tripId,
            date: start.plus({ days: i }).toJSDate(),
          },
        });
      }
      return;
    }

    if (existing.length > targetDayCount) {
      const trailing = existing.slice(targetDayCount);
      for (const day of trailing) {
        const itemCount = await tx.itineraryItem.count({ where: { tripDayId: day.id } });
        if (itemCount > 0) {
          continue;
        }
        await tx.tripDay.delete({ where: { id: day.id } });
      }
    }
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
