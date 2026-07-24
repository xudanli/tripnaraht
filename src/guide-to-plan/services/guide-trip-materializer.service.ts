import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { ItemType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateDefaultTripName } from '../../trips/utils/trip-name.util';
import type { GuideItineraryDraft } from './guide-plan-builder.service';
import type { GuideTravelContext } from '../types/guide-to-plan.types';

export interface GuideMaterializeParams {
  userId: string;
  sessionId: string;
  itineraryDraft: GuideItineraryDraft;
  travelContext: GuideTravelContext;
  countryCode: string;
  destination?: string | null;
  planCandidateId: string;
}

@Injectable()
export class GuideTripMaterializerService {
  private readonly logger = new Logger(GuideTripMaterializerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async materialize(params: GuideMaterializeParams): Promise<{ tripId: string; itemCount: number }> {
    const { tripId } = await this.materializeShell(params);
    const itemCount = await this.materializeItineraryIntoTrip({
      tripId,
      itineraryDraft: params.itineraryDraft,
      travelContext: params.travelContext,
    });
    return { tripId, itemCount };
  }

  /** Trip + collaborator + empty trip days (no itinerary items). */
  async materializeShell(
    params: GuideMaterializeParams,
  ): Promise<{ tripId: string; startDate: string }> {
    const { startDate, endDate } = this.resolveDates(
      params.travelContext,
      params.itineraryDraft.totalDays,
    );

    const tripId = randomUUID();
    const tripName = generateDefaultTripName({
      destination: params.countryCode,
      startDate: new Date(startDate),
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.create({
        data: {
          id: tripId,
          name: tripName,
          destination: params.countryCode,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: 'PLANNING',
          updatedAt: new Date(),
          metadata: {
            source: 'guide_to_plan',
            guideToPlanSessionId: params.sessionId,
            guidePlanCandidateId: params.planCandidateId,
            draftStatus: 'accepted_from_guide',
            destinationLabel: params.destination ?? undefined,
          },
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
      for (let i = 0; i < params.itineraryDraft.days.length; i++) {
        const dayDate = start.plus({ days: i }).toJSDate();
        await tx.tripDay.create({
          data: {
            id: randomUUID(),
            tripId,
            date: dayDate,
          },
        });
      }

      await tx.guideToPlanSession.update({
        where: { id: params.sessionId },
        data: { tripId },
      });
    });

    this.logger.log(`Materialized trip shell ${tripId} for guide session ${params.sessionId}`);
    return { tripId, startDate };
  }

  /** Add itinerary items to an existing trip (days must already exist). */
  async materializeItineraryIntoTrip(input: {
    tripId: string;
    itineraryDraft: GuideItineraryDraft;
    travelContext: GuideTravelContext;
  }): Promise<number> {
    const { startDate } = this.resolveDates(
      input.travelContext,
      input.itineraryDraft.totalDays,
    );

    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId: input.tripId },
      orderBy: { date: 'asc' },
    });
    if (tripDays.length < input.itineraryDraft.days.length) {
      throw new BadRequestException(
        `Trip ${input.tripId} has ${tripDays.length} days; draft requires ${input.itineraryDraft.days.length}`,
      );
    }

    const start = DateTime.fromISO(startDate, { zone: 'utc' });
    let itemCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < input.itineraryDraft.days.length; i++) {
        const tripDay = tripDays[i];
        const draftDay = input.itineraryDraft.days[i];
        const dayDate = start.plus({ days: i });

        for (const item of draftDay.items) {
          const timePart = item.startTime.includes('T')
            ? item.startTime.split('T')[1]
            : '09:00:00.000Z';
          const endPart = item.endTime.includes('T')
            ? item.endTime.split('T')[1]
            : '11:00:00.000Z';
          const [sh, sm] = timePart.split(':').map(Number);
          const [eh, em] = endPart.split(':').map(Number);

          const startTime = dayDate.set({ hour: sh || 9, minute: sm || 0 }).toJSDate();
          const endTime = dayDate.set({ hour: eh || 11, minute: em || 0 }).toJSDate();

          await tx.itineraryItem.create({
            data: {
              id: randomUUID(),
              tripDayId: tripDay.id,
              placeId: item.placeId ?? null,
              type: this.mapItemType(item.type),
              startTime,
              endTime,
              note: item.source === 'adjusted' ? `[攻略调整] ${item.name}` : item.name,
            },
          });
          itemCount++;
        }
      }
    });

    this.logger.log(`Materialized ${itemCount} itinerary items into trip ${input.tripId}`);
    return itemCount;
  }

  private resolveDates(ctx: GuideTravelContext, draftDays: number): { startDate: string; endDate: string } {
    if (!ctx.startDate) {
      throw new BadRequestException('接受草案前需确认出行开始日期 (travelContext.startDate)');
    }
    const start = DateTime.fromISO(ctx.startDate, { zone: 'utc' });
    if (!start.isValid) {
      throw new BadRequestException('无效的 startDate');
    }
    const end = ctx.endDate
      ? DateTime.fromISO(ctx.endDate, { zone: 'utc' })
      : start.plus({ days: Math.max(draftDays, 1) - 1 });
    return {
      startDate: start.toISODate()!,
      endDate: end.toISODate()!,
    };
  }

  private mapItemType(type: string): ItemType {
    switch (type) {
      case 'restaurant':
        return ItemType.MEAL_ANCHOR;
      case 'hotel':
        return ItemType.REST;
      default:
        return ItemType.ACTIVITY;
    }
  }
}
