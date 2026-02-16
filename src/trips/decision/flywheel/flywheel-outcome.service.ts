/**
 * Flywheel Layer 3: Outcome Capture Service
 *
 * 旅行结束后的真实数据：主观反馈、客观执行、失败信号。
 * 失败比成功更有价值。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FlywheelOutcomeInput } from './flywheel-types';

@Injectable()
export class FlywheelOutcomeService {
  private readonly logger = new Logger(FlywheelOutcomeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建或更新行程结果
   */
  async upsertOutcome(input: FlywheelOutcomeInput): Promise<string | null> {
    try {
      const result = await this.prisma.flywheelOutcome.upsert({
        where: { tripId: input.tripId },
        create: {
          tripId: input.tripId,
          userId: input.userId,
          subjectiveFeedback: input.subjectiveFeedback as object | undefined,
          objectiveExecution: input.objectiveExecution as object | undefined,
          failureSignals: input.failureSignals as object | undefined,
        },
        update: {
          subjectiveFeedback: input.subjectiveFeedback as object | undefined,
          objectiveExecution: input.objectiveExecution as object | undefined,
          failureSignals: input.failureSignals as object | undefined,
        },
      });
      this.logger.debug(
        `[Flywheel] Outcome captured for trip ${input.tripId}`,
      );
      return result.id;
    } catch (error) {
      this.logger.warn(
        `[Flywheel] Outcome capture failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 获取行程结果
   */
  async getByTripId(tripId: string) {
    return this.prisma.flywheelOutcome.findUnique({
      where: { tripId },
    });
  }

  /**
   * 获取用户所有结果（用于学习）
   */
  async getByUserId(
    userId: string,
    options?: { since?: Date; limit?: number },
  ) {
    return this.prisma.flywheelOutcome.findMany({
      where: {
        userId,
        ...(options?.since && { createdAt: { gte: options.since } }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 100,
    });
  }
}
