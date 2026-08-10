import type { PlanDiff } from '../../../generated/execution-risk-contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import { assertDirectEffectivePlanWriteBlocked } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { planDiffToPlanOperations } from './execution-risk-plan-diff-to-operations.util';
import { planShiftOperationToMaterialization } from '../materialization/shift-time-materialization.service';

/**
 * Lightweight Active Plan write for recommendation apply —
 * mirrors mobile patchActivity (direct ItineraryItem update + trip.updatedAt bump).
 *
 * Agent Harness P0-1 W3：入口硬挡；正式落库走 confirm → AE。
 */
export async function materializeRecommendationPlanDiff(input: {
  prisma: PrismaService;
  tripId: string;
  planDiff: PlanDiff;
}): Promise<{
  applied: boolean;
  updatedItemIds: string[];
  contextVersion: number;
  bumpedAt: Date;
}> {
  assertDirectEffectivePlanWriteBlocked('execution-risk.materializeRecommendationPlanDiff');

  const operations = planDiffToPlanOperations(input.planDiff);
  const updatedItemIds: string[] = [];

  const tripDays = await input.prisma.tripDay.findMany({
    where: { tripId: input.tripId },
    select: { id: true, date: true },
  });
  const items = await input.prisma.itineraryItem.findMany({
    where: { TripDay: { tripId: input.tripId } },
    select: {
      id: true,
      tripDayId: true,
      order: true,
      startTime: true,
      endTime: true,
      note: true,
      bookingStatus: true,
      bookingConfirmation: true,
      bookedAt: true,
      type: true,
    },
  });

  for (const operation of operations) {
    if (operation.kind !== 'SHIFT_TIME') continue;
    const result = planShiftOperationToMaterialization({
      operation,
      dayItems: items,
      tripDays,
    });
    if (result.blocked) continue;
    for (const update of result.updates) {
      await input.prisma.itineraryItem.update({
        where: { id: update.itemId },
        data: {
          startTime: update.startTimeMs != null ? new Date(update.startTimeMs) : undefined,
          endTime: update.endTimeMs != null ? new Date(update.endTimeMs) : undefined,
        },
      });
      updatedItemIds.push(update.itemId);
      const row = items.find((i) => i.id === update.itemId);
      if (row) {
        row.startTime = update.startTimeMs != null ? new Date(update.startTimeMs) : row.startTime;
        row.endTime = update.endTimeMs != null ? new Date(update.endTimeMs) : row.endTime;
      }
    }
  }

  // Always bump trip.updatedAt so mobile contextVersion advances even when
  // planDiff had no SHIFT_TIME ops (adoption still recorded as a plan change).
  const bumpedAt = new Date();
  await input.prisma.trip.update({
    where: { id: input.tripId },
    data: { updatedAt: bumpedAt },
  });

  const contextVersion = bumpedAt.getTime();

  return {
    applied: true,
    updatedItemIds: [...new Set(updatedItemIds)],
    contextVersion,
    bumpedAt,
  };
}
