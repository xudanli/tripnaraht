import { Injectable, Logger } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripOntologyFactsIngestService } from '../../../travel-ontology/services/trip-ontology-facts-ingest.service';
import type { ExplorationInput } from '../types/exploration.types';
import { bumpTripVersion } from '../utils/exploration-input.util';

const REMOTE_HIGHLANDS_STRATEGY = 'remote-highlands-south';
const F208_DRIVE_ITEM_KEY = 'exploration_f208_drive_item_id';

export interface SeedRouteItineraryInput {
  tripId: string;
  strategyId: string;
  routeId: string;
  initialInput: ExplorationInput;
}

@Injectable()
export class ExplorationItinerarySeederService {
  private readonly logger = new Logger(ExplorationItinerarySeederService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ontologyIngest: TripOntologyFactsIngestService,
  ) {}

  /**
   * Promote selected route variant into trip shell: vehicle context + optional F208 segment
   * for Iceland remote-highlands research path (2WD → road access BLOCK).
   */
  async seedForSelectedRoute(input: SeedRouteItineraryInput): Promise<{ itemCount: number }> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: input.tripId },
      include: { TripDay: { orderBy: { date: 'asc' } } },
    });

    const vehicleType = normalizeVehicleType(input.initialInput.mobilityContext?.vehicleType);
    let itemCount = 0;

    await this.prisma.$transaction(async (tx) => {
      const metadata = bumpTripVersion({
        ...((trip.metadata as Record<string, unknown>) ?? {}),
        explorationActiveRouteId: input.routeId,
        explorationActiveStrategyId: input.strategyId,
        constraints: {
          ...(((trip.metadata as Record<string, unknown>)?.constraints as object) ?? {}),
          vehicle_type: vehicleType,
        },
        explorationInput: input.initialInput,
      });

      if (input.strategyId === REMOTE_HIGHLANDS_STRATEGY) {
        const dayIndex = Math.min(2, Math.max(0, trip.TripDay.length - 1));
        const tripDay = trip.TripDay[dayIndex];
        if (tripDay) {
          const existingItemId = (metadata as Record<string, unknown>)[F208_DRIVE_ITEM_KEY];
          if (typeof existingItemId === 'string') {
            await tx.itineraryItem.deleteMany({ where: { id: existingItemId } });
          }

          const itemId = randomUUID();
          const dayDate = DateTime.fromJSDate(tripDay.date, { zone: 'utc' });
          await tx.itineraryItem.create({
            data: {
              id: itemId,
              tripDayId: tripDay.id,
              type: ItemType.TRANSIT,
              startTime: dayDate.set({ hour: 9, minute: 0 }).toJSDate(),
              endTime: dayDate.set({ hour: 12, minute: 0 }).toJSDate(),
              note: 'F208 highlands crossing (Landmannalaugar spur)',
              travelMode: 'drive',
              travelFromPreviousDistance: 85000,
              travelFromPreviousDuration: 150,
            },
          });
          itemCount = 1;

          (metadata as Record<string, unknown>)[F208_DRIVE_ITEM_KEY] = itemId;
          (metadata as Record<string, unknown>).rfc001IcelandRoadBindings = {
            byItemId: { [itemId]: ['F208'] },
          };
        }
      }

      await tx.trip.update({
        where: { id: input.tripId },
        data: { metadata: metadata as object },
      });
    });

    this.logger.log(
      `Seeded route ${input.routeId} (${input.strategyId}) on trip ${input.tripId}, items=${itemCount}`,
    );

    await this.ontologyIngest.ingestExplorationRouteSelection({
      tripId: input.tripId,
      vehicleType,
      strategyId: input.strategyId,
      routeId: input.routeId,
    });

    return { itemCount };
  }
}

function normalizeVehicleType(raw?: string): '2WD' | '4WD' {
  const v = String(raw ?? '').toUpperCase();
  if (v.includes('4WD') || v.includes('AWD') || v.includes('4X4')) return '4WD';
  return '2WD';
}
