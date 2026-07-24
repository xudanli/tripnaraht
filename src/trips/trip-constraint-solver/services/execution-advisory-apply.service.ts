import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';
import { assertExecutionAdvisoryDirectApplyAllowed } from '../utils/execution-advisory-write-chain.util';
import { EnvironmentRadarService } from '../../in-trip-execution/services/environment-radar.service';
import { InTripAccessService } from '../../in-trip-execution/services/in-trip-access.service';
import { isInTripExecutionEnabled } from '../../in-trip-execution/utils/in-trip-config.util';
import { TripStatus, normalizeTripStatus } from '../../dto/trip-status.dto';
import type {
  ApplyExecutionRecommendationRequestDto,
  ApplyExecutionRecommendationResponseDto,
  ExecutionScheduleMutationDto,
} from '../types/trip-constraint-solver.types';
import {
  applyShortenStay,
  applySkipItem,
  buildScheduleItemsForResponse,
  resolveRecommendationMutation,
} from '../utils/execution-advisory-apply.util';
import { ExecutionAdvisoryService } from './execution-advisory.service';

@Injectable()
export class ExecutionAdvisoryApplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly advisory: ExecutionAdvisoryService,
    @Optional() private readonly writeGuard?: EffectivePlanWriteGuardService,
    @Optional() private readonly environmentRadar?: EnvironmentRadarService,
  ) {}

  async applyRecommendation(
    tripId: string,
    recommendationId: string,
    userId: string,
    body: ApplyExecutionRecommendationRequestDto,
  ): Promise<ApplyExecutionRecommendationResponseDto> {
    if (!isInTripExecutionEnabled()) {
      throw new ServiceUnavailableException({
        code: 'EXECUTION_ADVISORY_DISABLED',
        message: '行中执行守护模块未启用',
      });
    }

    if (!body.confirm) {
      throw new BadRequestException({
        code: 'CONFIRMATION_REQUIRED',
        message: '应用方案需要 confirm=true',
      });
    }

    assertExecutionAdvisoryDirectApplyAllowed();

    const trip = await this.access.requireTrip(tripId);
    await this.access.assertTripMember(tripId, userId);
    const status = normalizeTripStatus(trip.status);
    if (status !== TripStatus.TRAVELING) {
      throw new BadRequestException({
        code: 'EXECUTION_ADVISORY_NOT_IN_TRIP',
        message: `行中守护要求行程处于 TRAVELING，当前为 ${status}`,
      });
    }

    const advisory = await this.advisory.getAdvisory(tripId, userId);
    const recommendation = advisory.recommendations.find((r) => r.id === recommendationId);
    if (!recommendation) {
      throw new NotFoundException({
        code: 'RECOMMENDATION_NOT_FOUND',
        message: `推荐方案 ${recommendationId} 不存在或已失效`,
      });
    }

    if (recommendation.actionType === 'keep') {
      throw new BadRequestException({
        code: 'RECOMMENDATION_NO_OP',
        message: '「保持原计划」无需应用，请继续按当前安排执行',
      });
    }

    const validUntil = advisory.verdict.validUntil;
    if (validUntil && DateTime.fromISO(validUntil) < DateTime.now()) {
      throw new BadRequestException({
        code: 'RECOMMENDATION_EXPIRED',
        message: '建议已过期，请重新获取行中守护后再应用',
      });
    }

    const dayItems = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: advisory.tripDayId },
      orderBy: { startTime: 'asc' },
    });
    const tripDayItemIds = dayItems.map((i) => i.id);

    const resolvedActiveItemId =
      advisory.currentState.activeItemId ?? this.resolveActiveItemId(dayItems);

    const mutationPlan = resolveRecommendationMutation({
      recommendation,
      activeItemId: resolvedActiveItemId,
      tripDayItemIds,
    });

    const scheduleMutations: ExecutionScheduleMutationDto[] = [];

    switch (mutationPlan.action) {
      case 'shorten': {
        if (!mutationPlan.itemId) {
          throw new BadRequestException('无法定位需要缩短的行程项');
        }
        scheduleMutations.push(
          await applyShortenStay(
            this.prisma,
            mutationPlan.itemId,
            mutationPlan.deltaMinutes ?? -30,
          ),
        );
        break;
      }
      case 'skip': {
        if (!mutationPlan.itemId) {
          throw new BadRequestException('无法定位需要跳过的行程项');
        }
        scheduleMutations.push(await applySkipItem(this.prisma, mutationPlan.itemId));
        break;
      }
      case 'replace': {
        const eventId = recommendation.id.replace(/^rec-replace-/, '');
        if (this.environmentRadar && eventId && eventId !== recommendation.id) {
          const event = await this.environmentRadar
            .getEvent(tripId, eventId, userId)
            .catch(() => null);
          const planId = event?.alternativePlans?.[0]?.planId;
          if (planId) {
            await this.environmentRadar.resolveEvent(tripId, eventId, userId, { planId });
            scheduleMutations.push({
              type: 'REPLACE_ITEM',
              itemId: advisory.currentState.activeItemId ?? tripDayItemIds[0] ?? eventId,
            });
            break;
          }
        }
        throw new BadRequestException({
          code: 'WRITE_CHAIN_BLOCKED',
          message: '替换方案需通过决策空间应用，请前往决策问题处理',
        });
      }
      default:
        throw new BadRequestException({
          code: 'RECOMMENDATION_NO_OP',
          message: '该推荐方案暂不支持直接应用',
        });
    }

    const meta = (trip.metadata ?? {}) as Record<string, unknown>;
    const delayMinutes = typeof meta.inTripDelayMinutes === 'number' ? meta.inTripDelayMinutes : 0;
    if (mutationPlan.action === 'shorten' && delayMinutes > 0) {
      const recovered = Math.min(delayMinutes, Math.abs(scheduleMutations[0]?.deltaMinutes ?? 0));
      if (recovered > 0) {
        await this.prisma.trip.update({
          where: { id: tripId },
          data: {
            metadata: {
              ...meta,
              inTripDelayMinutes: Math.max(0, delayMinutes - recovered),
            },
          },
        });
      }
    }

    const refreshedItems = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: advisory.tripDayId },
      include: { Place: true },
      orderBy: { startTime: 'asc' },
    });

    const now = DateTime.now();
    const executionAdvisory = await this.advisory.getAdvisory(tripId, userId);

    return {
      applied: true,
      executionAdvisory,
      scheduleMutations,
      updatedSchedule: {
        date: advisory.date,
        schedule: {
          items: buildScheduleItemsForResponse(refreshedItems, now),
        },
      },
    };
  }

  private resolveActiveItemId(
    items: Array<{ id: string; startTime: Date | null; endTime: Date | null }>,
  ): string | undefined {
    if (items.length === 0) return undefined;
    const now = DateTime.now();
    for (const item of items) {
      if (!item.startTime || !item.endTime) continue;
      const start = DateTime.fromJSDate(item.startTime);
      const end = DateTime.fromJSDate(item.endTime);
      if (now >= start && now <= end) return item.id;
    }
    for (const item of items) {
      if (!item.startTime) continue;
      if (now < DateTime.fromJSDate(item.startTime)) return item.id;
    }
    return items[0]?.id;
  }
}
