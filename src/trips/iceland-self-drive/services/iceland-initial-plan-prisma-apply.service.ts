/**
 * Materialize confirmed Iceland Initial Plan into Prisma Trip / TripDay / ItineraryItem.
 * Reuses shell.tripId as Trip.id. Provenance: day-assign + Shadow VERIFY + Confirm — not OR-Tools.
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { ItemType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EffectivePlanWriter } from '../../../decision-runtime/execution/effective-plan-writer.service';
import {
  buildDayDateTime,
  resolveTripDayByIndex,
} from '../../utils/arrange-itinerary-day.util';
import type {
  AppliedInitialPlanItem,
  AppliedInitialPlanVersion,
  TripShell,
} from '../types/iceland-trip-shell-preview.types';
import type { StoredInitialPlanProposal } from '../types/iceland-trip-shell-preview.types';

export type IcelandPrismaApplyInput = {
  shell: TripShell;
  ownerId: string;
  proposal: StoredInitialPlanProposal;
  planVersionId: string;
  /** Pre-projected place-backed items (HH:mm already set) */
  projectedItems: AppliedInitialPlanItem[];
};

export type IcelandPrismaApplyResult = {
  version: AppliedInitialPlanVersion;
  prismaTripId: string;
  createdTrip: boolean;
  tripDayCount: number;
};

@Injectable()
export class IcelandInitialPlanPrismaApplyService {
  private readonly logger = new Logger(IcelandInitialPlanPrismaApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly effectivePlanWriter?: EffectivePlanWriter,
  ) {}

  async materialize(input: IcelandPrismaApplyInput): Promise<IcelandPrismaApplyResult> {
    const run = () => this.materializeAuthorized(input);
    if (this.effectivePlanWriter) {
      return this.effectivePlanWriter.runExecute(run);
    }
    return run();
  }

  private async materializeAuthorized(
    input: IcelandPrismaApplyInput,
  ): Promise<IcelandPrismaApplyResult> {
    const { shell, ownerId, proposal, planVersionId, projectedItems } = input;
    if (projectedItems.length === 0) {
      throw new BadRequestException({
        code: 'NO_APPLIABLE_ITEMS',
        message: 'No place-backed items to write to Prisma',
      });
    }

    const placeIds = [
      ...new Set(
        projectedItems
          .map((i) => i.placeId)
          .filter((id): id is number => id != null && Number.isFinite(id)),
      ),
    ];
    const existingPlaces = await this.prisma.place.findMany({
      where: { id: { in: placeIds } },
      select: { id: true },
    });
    const validPlaceIds = new Set(existingPlaces.map((p) => p.id));
    const writable = projectedItems.filter(
      (i) => i.placeId != null && validPlaceIds.has(i.placeId),
    );
    if (writable.length === 0) {
      throw new BadRequestException({
        code: 'NO_VALID_PLACE_IDS',
        message:
          'None of the proposal placeIds exist in Place catalog; cannot bind ItineraryItem',
        details: { requestedPlaceIds: placeIds },
      });
    }

    const start = DateTime.fromISO(shell.travelDates.startDate, { zone: 'utc' }).startOf(
      'day',
    );
    const end = DateTime.fromISO(shell.travelDates.endDate, { zone: 'utc' }).startOf('day');
    if (!start.isValid || !end.isValid || end < start) {
      throw new BadRequestException({
        code: 'INVALID_TRAVEL_DATES',
        message: 'Shell travelDates are invalid',
      });
    }
    const durationDays = Math.floor(end.diff(start, 'days').days) + 1;

    const appliedAt = new Date().toISOString();
    let createdTrip = false;

    const result = await this.prisma.$transaction(async (tx) => {
      let trip = await tx.trip.findUnique({ where: { id: shell.tripId } });
      if (!trip) {
        createdTrip = true;
        trip = await tx.trip.create({
          data: {
            id: shell.tripId,
            name: 'Iceland Self-Drive Initial Plan',
            destination: 'IS',
            startDate: start.toJSDate(),
            endDate: end.toJSDate(),
            status: 'PLANNING',
            metadata: {
              productLine: 'iceland_self_drive',
              initialPlan: {
                proposalId: proposal.proposalId,
                planVersionId,
                sourceEngine: 'ICELAND_COVERAGE_DAY_ASSIGN',
                verificationAuthority: 'ICELAND_SHADOW_UNIFIED_ASSESSMENT',
                contextHash: shell.contextHash,
              },
            } as any,
            updatedAt: new Date(),
          } as any,
        });
      }

      let tripDays = await tx.tripDay.findMany({
        where: { tripId: trip.id },
        orderBy: { date: 'asc' },
        select: { id: true, date: true },
      });

      if (tripDays.length === 0) {
        const created = [];
        for (let i = 0; i < durationDays; i++) {
          const dayDate = start.plus({ days: i });
          created.push(
            await tx.tripDay.create({
              data: {
                id: randomUUID(),
                date: dayDate.toJSDate(),
                tripId: trip.id,
              } as any,
            }),
          );
        }
        tripDays = created.map((d) => ({ id: d.id, date: d.date }));
      }

      const collab = await tx.tripCollaborator.findUnique({
        where: {
          tripId_userId: { tripId: trip.id, userId: ownerId },
        },
      });
      if (!collab) {
        await tx.tripCollaborator.create({
          data: {
            id: randomUUID(),
            tripId: trip.id,
            userId: ownerId,
            role: 'OWNER',
            updatedAt: new Date(),
          } as any,
        });
      }

      const written: AppliedInitialPlanItem[] = [];
      let order = 0;
      for (const item of writable) {
        const tripDay = resolveTripDayByIndex(tripDays, item.dayIndex);
        const startTime = buildDayDateTime(tripDay.date, item.startTime);
        const endTime = buildDayDateTime(tripDay.date, item.endTime);
        const itineraryItemId = randomUUID();
        await tx.itineraryItem.create({
          data: {
            id: itineraryItemId,
            tripDayId: tripDay.id,
            placeId: item.placeId!,
            type: ItemType.ACTIVITY,
            startTime,
            endTime,
            note: item.label,
            order: order++,
          } as any,
        });
        written.push({
          ...item,
          itineraryItemId,
        });
      }

      await tx.trip.update({
        where: { id: trip.id },
        data: {
          updatedAt: new Date(),
          metadata: {
            ...((trip.metadata as Record<string, unknown>) ?? {}),
            productLine: 'iceland_self_drive',
            initialPlan: {
              proposalId: proposal.proposalId,
              planVersionId,
              appliedAt,
              appliedItemCount: written.length,
              sourceEngine: 'ICELAND_COVERAGE_DAY_ASSIGN',
              verificationAuthority: 'ICELAND_SHADOW_UNIFIED_ASSESSMENT',
              contextHash: shell.contextHash,
              writesPlanVersion: true,
              persistence: 'prisma',
            },
          } as any,
        },
      });

      return {
        tripId: trip.id,
        tripDayCount: tripDays.length,
        items: written,
      };
    });

    this.logger.log(
      `Prisma Apply trip=${result.tripId} planVersion=${planVersionId} items=${result.items.length} createdTrip=${createdTrip}`,
    );

    const version: AppliedInitialPlanVersion = {
      planVersionId,
      tripId: shell.tripId,
      proposalId: proposal.proposalId,
      proposalHash: proposal.proposalHash,
      contextVersion: shell.contextVersion,
      contextHash: shell.contextHash,
      appliedAt,
      appliedBy: ownerId,
      appliedItemCount: result.items.length,
      items: result.items,
      sourceEngine: 'ICELAND_COVERAGE_DAY_ASSIGN',
      verificationAuthority: 'ICELAND_SHADOW_UNIFIED_ASSESSMENT',
      writesPlanVersion: true,
      persistence: 'prisma',
      prismaTripId: result.tripId,
    };

    return {
      version,
      prismaTripId: result.tripId,
      createdTrip,
      tripDayCount: result.tripDayCount,
    };
  }
}
