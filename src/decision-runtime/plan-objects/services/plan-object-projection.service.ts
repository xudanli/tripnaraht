import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PlanObjectProjectionView } from '../contracts/plan-object.types';
import { isPlanObjectGatewayEvaluationEnabled, isPlanObjectProjectionEnabled } from '../plan-object.config';
import {
  projectTripPlanObjects,
  type TripDayRow,
} from '../projectors/itinerary-to-plan-object.projector';

@Injectable()
export class PlanObjectProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return isPlanObjectProjectionEnabled() || isPlanObjectGatewayEvaluationEnabled();
  }

  async buildProjection(tripId: string): Promise<PlanObjectProjectionView> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'PlanObject projection is disabled. Set PLAN_OBJECT_PROJECTION_ENABLED=1 or PLAN_OBJECT_GATEWAY_EVALUATION=1.',
      );
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        metadata: true,
        pacingConfig: true,
        destination: true,
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              include: { Place: true },
              orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const days: TripDayRow[] = trip.TripDay.map((day, index) => ({
      id: day.id,
      date: day.date,
      dayNumber: index + 1,
      items: day.ItineraryItem.map((item) => ({
        id: item.id,
        type: String(item.type),
        tripDayId: item.tripDayId,
        startTime: item.startTime,
        endTime: item.endTime,
        note: item.note,
        placeId: item.placeId,
        costCategory: item.costCategory,
        bookingStatus: item.bookingStatus,
        travelFromPreviousDuration: item.travelFromPreviousDuration,
        travelFromPreviousDistance: item.travelFromPreviousDistance,
        travelMode: item.travelMode,
        Place: item.Place
          ? {
              nameCN: item.Place.nameCN,
              nameEN: item.Place.nameEN,
              category: String(item.Place.category),
              address: item.Place.address,
              physicalMetadata: item.Place.physicalMetadata,
            }
          : null,
      })),
    }));

    return projectTripPlanObjects({
      tripId,
      trip: {
        metadata: trip.metadata,
        pacingConfig: trip.pacingConfig,
        destination: trip.destination,
      },
      days,
    });
  }
}
