import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ArrangeItineraryItemsService } from '../../arrange-itinerary/services/arrange-itinerary-items.service';
import { isAccommodationItem } from '../../utils/accommodation-overview.util';
import { ContextualRecommendationsService } from './contextual-recommendations.service';
import { SameDayContextBuilderService } from './same-day-context-builder.service';
import { mergeSameDayProblem } from '../utils/same-day-context-merge.util';
import {
  buildArrivalScheduleForVariant,
  type ArrivalPlanVariant,
} from '../utils/same-day-arrival-planner.util';
import {
  mapMicroPlanScheduleToCommitDrafts,
  productIdNameHints,
} from '../utils/same-day-commit-map.util';
import { evaluateAndRepairMicroPlan } from '../utils/same-day-feasibility.util';
import { mergeCompiledIntentWithDelta, compileSameDayIntent } from '../utils/same-day-intent-compiler.util';
import type { ContextualRecommendationsCommitDto } from '../dto/contextual-recommendations.dto';
import type { MicroPlanScheduleSlot } from '../types/contextual-recommendations.types';

export type ContextualCommitResult = {
  dayIndex: number;
  title: string;
  variant: ArrivalPlanVariant;
  createdItemIds: string[];
  skippedSlotTypes: string[];
  itemCount: number;
  gate: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
  feasibilityRepaired: boolean;
};

@Injectable()
export class ContextualRecommendationsCommitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arrangeItems: ArrangeItineraryItemsService,
    private readonly recommendations: ContextualRecommendationsService,
    private readonly contextBuilder: SameDayContextBuilderService,
  ) {}

  async commit(
    tripId: string,
    userId: string,
    body: ContextualRecommendationsCommitDto,
  ): Promise<ContextualCommitResult> {
    const variant = (body.variant ?? 'PRIMARY') as ArrivalPlanVariant;
    if (!['PRIMARY', 'MOST_RELAXED', 'MORE_EXPERIENCE'].includes(variant)) {
      throw new BadRequestException(`非法 variant: ${body.variant}`);
    }

    const { title, schedule, dayIndex } = await this.resolveSchedule(tripId, body, variant);
    if (!schedule.length) {
      throw new BadRequestException('无可写入的微行程时段');
    }

    const feasibility = await this.evaluateCommitFeasibility(tripId, body, title, schedule);
    if (feasibility.gate === 'REJECT') {
      throw new BadRequestException({
        code: 'FEASIBILITY_REJECT',
        message: '方案未通过可行性校验，无法写入行程',
        violations: feasibility.violations,
      });
    }
    if (feasibility.gate === 'NEED_CONFIRM' && body.forceConfirm !== true) {
      throw new BadRequestException({
        code: 'FEASIBILITY_NEED_CONFIRM',
        message: '方案需要确认后才能写入，请传 forceConfirm=true',
        violations: feasibility.violations,
      });
    }

    const scheduleToWrite = feasibility.recommendation.schedule;
    const titleToWrite = feasibility.recommendation.title || title;

    const days = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      select: { id: true },
    });
    if (!days.length) {
      throw new BadRequestException({
        code: 'NO_TRIP_DAYS',
        message: '行程尚无日程天，无法写入',
      });
    }
    if (dayIndex < 1 || dayIndex > days.length) {
      throw new BadRequestException({
        code: 'NO_TRIP_DAYS',
        message: `dayIndex=${dayIndex} 超出行程天数`,
      });
    }

    const skipCheckIn = await this.dayAlreadyHasAccommodation(days[dayIndex - 1].id);
    const drafts = mapMicroPlanScheduleToCommitDrafts(scheduleToWrite).filter((d) => {
      if (skipCheckIn && d.slotType === 'HOTEL_CHECK_IN') return false;
      return true;
    });

    const skippedSlotTypes = scheduleToWrite
      .filter((s) => s.type === 'TRANSFER')
      .map((s) => s.type);
    if (skipCheckIn) skippedSlotTypes.push('HOTEL_CHECK_IN');

    const createdItemIds: string[] = [];
    for (const draft of drafts) {
      const placeId =
        draft.placeId ??
        (await this.resolvePlaceIdByProduct(tripId, draft.productId));

      const mutation = await this.arrangeItems.createItem({
        tripId,
        userId,
        body: {
          dayIndex,
          type: draft.type,
          startTime: draft.startTime,
          endTime: draft.endTime,
          note: draft.note,
          placeName: draft.placeName,
          placeId,
          insertMode: 'append',
          forceCreate: true,
        },
      });

      const itemId =
        mutation.itineraryItem && typeof mutation.itineraryItem === 'object'
          ? String((mutation.itineraryItem as { id?: string }).id ?? '')
          : '';
      if (itemId) createdItemIds.push(itemId);
    }

    return {
      dayIndex,
      title: titleToWrite,
      variant,
      createdItemIds,
      skippedSlotTypes: [...new Set(skippedSlotTypes)],
      itemCount: createdItemIds.length,
      gate: feasibility.gate,
      feasibilityRepaired: feasibility.repaired,
    };
  }

  private async evaluateCommitFeasibility(
    tripId: string,
    body: ContextualRecommendationsCommitDto,
    title: string,
    schedule: MicroPlanScheduleSlot[],
  ) {
    const compiled = compileSameDayIntent(body.intent ?? '');
    const contextDelta = mergeCompiledIntentWithDelta(
      compiled.contextDelta,
      body.contextDelta,
    );
    const canonical = await this.contextBuilder.buildCanonical(tripId, {
      focusDayIndex: body.dayIndex,
      nowIso: contextDelta.currentTime,
    });
    const problem = mergeSameDayProblem({
      canonical,
      intent: body.intent,
      contextDelta,
    });
    return evaluateAndRepairMicroPlan(problem, {
      title,
      reasonCodes: [],
      score: 70,
      schedule,
      impact: {
        additionalDrivingMinutes: 0,
        walkingMinutes: schedule.some((s) => s.type === 'LIGHT_ACTIVITY') ? 30 : 12,
        tomorrowPlanImpact: 'NONE',
      },
      gate: 'ALLOW',
    });
  }

  private async resolveSchedule(
    tripId: string,
    body: ContextualRecommendationsCommitDto,
    variant: ArrivalPlanVariant,
  ): Promise<{ title: string; schedule: MicroPlanScheduleSlot[]; dayIndex: number }> {
    if (body.schedule?.length) {
      return {
        title: body.title?.trim() || '情境微规划',
        schedule: body.schedule,
        dayIndex: body.dayIndex ?? 1,
      };
    }

    if (variant !== 'PRIMARY') {
      const canonical = await this.contextBuilder.buildCanonical(tripId, {
        focusDayIndex: body.dayIndex,
        nowIso: body.contextDelta?.currentTime,
      });
      const problem = mergeSameDayProblem({
        canonical,
        intent: body.intent,
        contextDelta: body.contextDelta,
      });
      const built = buildArrivalScheduleForVariant(problem, variant);
      return {
        title: built.title,
        schedule: built.schedule,
        dayIndex: body.dayIndex ?? problem.canonical.focusDayIndex,
      };
    }

    const view = await this.recommendations.recommend(tripId, {
      scenario: 'SAME_DAY_ACTIVITY',
      intent: body.intent,
      contextDelta: body.contextDelta,
    });
    return {
      title: body.title?.trim() || view.recommendation.title,
      schedule: view.recommendation.schedule,
      dayIndex: body.dayIndex ?? view.context.focusDayIndex,
    };
  }

  private async dayAlreadyHasAccommodation(tripDayId: string): Promise<boolean> {
    const items = await this.prisma.itineraryItem.findMany({
      where: { tripDayId },
      include: { Place: true },
    });
    return items.some((item) =>
      isAccommodationItem({
        type: item.type,
        placeCategory: item.Place?.category ?? null,
        placeNameCN: item.Place?.nameCN ?? null,
        placeNameEN: item.Place?.nameEN ?? null,
        note: item.note,
      }),
    );
  }

  private async resolvePlaceIdByProduct(
    tripId: string,
    productId?: string,
  ): Promise<number | undefined> {
    const hints = productIdNameHints(productId);
    if (!hints.length) return undefined;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }
    const country = String(trip.destination || 'IS').toUpperCase().slice(0, 2);

    for (const hint of hints) {
      const place = await this.prisma.place.findFirst({
        where: {
          AND: [
            {
              OR: [
                { City: { countryCode: country } },
                { metadata: { path: ['countryCode'], equals: country } },
              ],
            },
            {
              OR: [
                { nameEN: { contains: hint, mode: 'insensitive' } },
                { nameCN: { contains: hint } },
              ],
            },
          ],
        },
        select: { id: true },
      });
      if (place) return place.id;
    }
    return undefined;
  }
}
