/**
 * Flywheel Layer 2: Behavior Log Service
 *
 * 记录用户如何修改。用户行为 = 偏好信号，行为比评分更真实。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  FlywheelBehaviorLogInput,
  FlywheelBehaviorEventType,
} from './flywheel-types';

@Injectable()
export class FlywheelBehaviorLogService {
  private readonly logger = new Logger(FlywheelBehaviorLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录用户行为事件
   */
  async logBehavior(input: FlywheelBehaviorLogInput): Promise<string | null> {
    try {
      const result = await this.prisma.flywheelBehaviorLog.create({
        data: {
          userId: input.userId,
          tripId: input.tripId,
          planId: input.planId,
          eventType: input.eventType,
          beforeState: input.beforeState as object | undefined,
          afterState: input.afterState as object | undefined,
          deltaDistance: input.deltaDistance,
          deltaElevation: input.deltaElevation,
          deltaTime: input.deltaTime,
          metadata: input.metadata as object | undefined,
        },
      });
      this.logger.debug(
        `[Flywheel] Behavior logged: ${input.eventType} for trip ${input.tripId}`,
      );
      return result.id;
    } catch (error) {
      this.logger.warn(
        `[Flywheel] Behavior log failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 批量统计用户行为分布
   */
  async getBehaviorDistribution(
    userId: string,
    options?: { since?: Date },
  ): Promise<Record<FlywheelBehaviorEventType, number>> {
    const events = await this.prisma.flywheelBehaviorLog.findMany({
      where: {
        userId,
        ...(options?.since && { createdAt: { gte: options.since } }),
      },
      select: { eventType: true },
    });

    const dist: Record<string, number> = {};
    for (const e of events) {
      dist[e.eventType] = (dist[e.eventType] ?? 0) + 1;
    }
    return dist as Record<FlywheelBehaviorEventType, number>;
  }

  /**
   * 获取用于学习的用户行为序列
   */
  async getForLearning(
    userId: string,
    tripIds?: string[],
    limit = 200,
  ): Promise<
    Array<{
      id: string;
      tripId: string;
      eventType: string;
      beforeState: unknown;
      afterState: unknown;
      deltaDistance: number | null;
      deltaElevation: number | null;
      deltaTime: number | null;
      createdAt: Date;
    }>
  > {
    const logs = await this.prisma.flywheelBehaviorLog.findMany({
      where: {
        userId,
        ...(tripIds?.length && { tripId: { in: tripIds } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        tripId: true,
        eventType: true,
        beforeState: true,
        afterState: true,
        deltaDistance: true,
        deltaElevation: true,
        deltaTime: true,
        createdAt: true,
      },
    });
    return logs;
  }
}
