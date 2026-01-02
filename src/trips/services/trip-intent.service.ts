// src/trips/services/trip-intent.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateIntentRequestDto, UpdateIntentResponseDto, IntentResponseDto } from '../dto/trip-intent.dto';
import { randomUUID } from 'crypto';

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

    // 更新预算配置
    let budgetConfig = trip.budgetConfig as any || {};
    if (dto.totalBudget !== undefined) {
      budgetConfig = {
        ...budgetConfig,
        totalBudget: dto.totalBudget,
      };
    }

    // 更新 metadata（存储偏好、约束、规划策略）
    let metadata = trip.metadata as any || {};
    if (dto.preferences || dto.constraints || dto.planningPolicy) {
      metadata = {
        ...metadata,
        preferences: dto.preferences || metadata.preferences,
        constraints: dto.constraints || metadata.constraints,
        planningPolicy: dto.planningPolicy || metadata.planningPolicy,
      };
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
      metadata: {
        preferences: metadata.preferences,
        constraints: metadata.constraints,
        planningPolicy: metadata.planningPolicy,
      },
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

    const pacingConfig = trip.pacingConfig as any || {};
    const budgetConfig = trip.budgetConfig as any || {};
    const metadata = trip.metadata as any || {};

    return {
      id: trip.id,
      pacingConfig: pacingConfig,
      budgetConfig: budgetConfig,
      metadata: {
        preferences: metadata.preferences,
        constraints: metadata.constraints,
        planningPolicy: metadata.planningPolicy,
      },
    };
  }
}

