import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildNonTransactionalReplanResult,
  extractFullTripDependencyChain,
  type EvidenceEnvelope,
  type FlightStatusValue,
  type NonTransactionalReplanResult,
} from '../../../travel-cognition';

export interface AnalyzeTripDependencyImpactRequest {
  /** 触发证据（ROAD / WEATHER / FLIGHT_STATUS 等） */
  trigger?: EvidenceEnvelope;
  /** @deprecated 使用 trigger；保留向后兼容 */
  flightEvidence?: EvidenceEnvelope<FlightStatusValue>;
  locale?: 'zh' | 'en';
}

@Injectable()
export class TripDependencyImpactService {
  constructor(private readonly prisma: PrismaService) {}

  async analyzeForTrip(
    tripId: string,
    request: AnalyzeTripDependencyImpactRequest,
  ): Promise<NonTransactionalReplanResult> {
    const trigger = request.trigger ?? request.flightEvidence;
    if (!trigger) {
      throw new Error('trigger or flightEvidence is required');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: true },
              orderBy: { startTime: 'asc' },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const items = trip.TripDay.flatMap((day) =>
      (day.ItineraryItem ?? []).map((item) => ({
        id: item.id,
        type: item.type,
        startTime: item.startTime,
        endTime: item.endTime,
        note: item.note,
        metadata: item.Place?.metadata ?? undefined,
        dayDate: day.date?.toISOString().slice(0, 10),
        placeName: item.Place?.nameCN || item.Place?.nameEN || undefined,
        placeId: item.placeId ?? undefined,
      })),
    );

    const chain = extractFullTripDependencyChain(items);

    return buildNonTransactionalReplanResult({
      tripId,
      trigger,
      chain,
      locale: request.locale,
    });
  }
}
