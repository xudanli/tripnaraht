// src/trips/services/trip-intent.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TravelMode, UpdateIntentRequestDto, UpdateIntentResponseDto, IntentResponseDto, ConstraintsDto } from '../dto/trip-intent.dto';
import {
  LUNCH_STRATEGY_LABELS,
  normalizeLunchStrategy,
  resolveLunchStrategyFromTrip,
} from '../../planning-policy/utils/lunch-strategy.util';
import { bumpConstraintsVersion, snapshotConstraintsMeta } from '../trip-constraint-solver/utils/constraints-metadata.util';
import {
  applyMaxSegmentDistanceConstraintPatch,
  ensureSegmentDistanceConstraints,
} from '../trip-constraint-solver/utils/segment-distance-threshold.util';

@Injectable()
export class TripIntentService {
  private readonly logger = new Logger(TripIntentService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 更新行程意图与约束
   */
  async updateIntent(tripId: string, dto: UpdateIntentRequestDto): Promise<UpdateIntentResponseDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 更新节奏配置
    let pacingConfig = trip.pacingConfig as any || {};
    if (dto.pacingConfig) {
      pacingConfig = {
        ...pacingConfig,
        ...dto.pacingConfig,
        travelMode: TravelMode.DRIVING,
      };

      // 根据节奏等级计算最大每日活动数
      if (dto.pacingConfig.level) {
        const levelMap: Record<string, number> = {
          relaxed: 3,
          standard: 5,
          tight: 7,
        };
        pacingConfig.maxDailyActivities = levelMap[dto.pacingConfig.level] || 5;
      }
    }

    pacingConfig = {
      ...pacingConfig,
      travelMode: TravelMode.DRIVING,
    };

    // 更新预算配置
    let budgetConfig = trip.budgetConfig as any || {};
    if (dto.totalBudget !== undefined) {
      budgetConfig = {
        ...budgetConfig,
        totalBudget: dto.totalBudget,
      };
    }

    // 更新 metadata（存储偏好、约束、规划策略、午餐策略）
    let metadata = trip.metadata as any || {};
    let constraintsTouched = false;
    if (dto.pacingConfig) constraintsTouched = true;
    if (dto.totalBudget !== undefined) constraintsTouched = true;
    if (dto.preferences || dto.constraints || dto.planningPolicy || dto.lunch_strategy) {
      constraintsTouched = constraintsTouched || Boolean(dto.constraints);
      const mergedConstraints = dto.constraints
        ? {
            ...((metadata.constraints as Record<string, unknown> | undefined) ?? {}),
            ...dto.constraints,
          }
        : (metadata.constraints as Record<string, unknown> | undefined);
      if (mergedConstraints && dto.constraints?.maxSegmentDistanceKm != null) {
        applyMaxSegmentDistanceConstraintPatch(mergedConstraints, {
          value: dto.constraints.maxSegmentDistanceKm,
          tolerance: dto.constraints.warnSegmentDistanceKm,
          destination: trip.destination,
        });
      }
      metadata = {
        ...metadata,
        preferences: dto.preferences || metadata.preferences,
        constraints: mergedConstraints ?? metadata.constraints,
        planningPolicy: dto.planningPolicy || metadata.planningPolicy,
      };
      if (dto.lunch_strategy) {
        const normalized = normalizeLunchStrategy(dto.lunch_strategy);
        if (normalized) {
          metadata.lunch_strategy = normalized;
          metadata.tripParams = {
            ...(metadata.tripParams ?? {}),
            lunch_strategy: normalized,
          };
        }
      }
    }

    const constraintsEnsured = ensureSegmentDistanceConstraints(trip.destination, metadata);
    if (constraintsTouched || constraintsEnsured) {
      metadata = bumpConstraintsVersion(metadata);
    }

    // 更新数据库
    const updatedTrip = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        pacingConfig: pacingConfig as any,
        budgetConfig: budgetConfig as any,
        metadata: metadata as any,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      trip: {
        id: updatedTrip.id,
        pacingConfig: pacingConfig,
        budgetConfig: budgetConfig,
      },
      metadata: this.buildIntentMetadata(metadata),
      constraints: snapshotConstraintsMeta(updatedTrip.metadata),
    };
  }

  private buildIntentMetadata(metadata: Record<string, unknown>) {
    const lunch_strategy =
      normalizeLunchStrategy(metadata.lunch_strategy as string) ??
      normalizeLunchStrategy((metadata.tripParams as Record<string, unknown> | undefined)?.lunch_strategy as string);
    return {
      preferences: metadata.preferences as string[] | undefined,
      constraints: metadata.constraints as ConstraintsDto | undefined,
      planningPolicy: metadata.planningPolicy as string | undefined,
      lunch_strategy: lunch_strategy ?? undefined,
      lunch_strategy_label: lunch_strategy ? LUNCH_STRATEGY_LABELS[lunch_strategy] : undefined,
    };
  }

  /**
   * 获取行程意图与约束
   */
  async getIntent(tripId: string): Promise<IntentResponseDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const pacingConfig = {
      ...(trip.pacingConfig as Record<string, unknown> | null) ?? {},
      travelMode: TravelMode.DRIVING,
    };
    const budgetConfig = trip.budgetConfig as any || {};
    const metadata = (trip.metadata as Record<string, unknown>) || {};
    const lunch_strategy =
      normalizeLunchStrategy(metadata.lunch_strategy as string) ?? resolveLunchStrategyFromTrip(trip);

    return {
      id: trip.id,
      pacingConfig: pacingConfig,
      budgetConfig: budgetConfig,
      metadata: {
        ...this.buildIntentMetadata(metadata),
        lunch_strategy,
        lunch_strategy_label: LUNCH_STRATEGY_LABELS[lunch_strategy],
      },
    };
  }
}

