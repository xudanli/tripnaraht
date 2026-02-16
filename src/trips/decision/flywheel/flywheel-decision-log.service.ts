/**
 * Flywheel Layer 1: Decision Log Service
 *
 * 记录系统当时如何思考，为学习提供输入。
 * 没有决策记录，就无法学习。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FlywheelDecisionLogInput } from './flywheel-types';

@Injectable()
export class FlywheelDecisionLogService {
  private readonly logger = new Logger(FlywheelDecisionLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录决策（含 contextSnapshot、utilityWeights、candidatePlans、selectedPlan）
   */
  async logDecision(input: FlywheelDecisionLogInput): Promise<string | null> {
    try {
      const result = await this.prisma.flywheelDecisionLog.create({
        data: {
          userId: input.userId,
          tripId: input.tripId,
          decisionLogId: input.decisionLogId,
          contextSnapshot: input.contextSnapshot as object,
          utilityWeights: input.utilityWeights as object,
          candidatePlans: input.candidatePlans as object[] | undefined,
          selectedPlan: input.selectedPlan as object | undefined,
        },
      });
      this.logger.debug(
        `[Flywheel] Decision logged: ${result.id} for trip ${input.tripId}`,
      );
      return result.id;
    } catch (error) {
      this.logger.warn(
        `[Flywheel] Decision log failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 按 tripId 查询决策记录（最近 N 条）
   */
  async getByTripId(
    tripId: string,
    limit = 10,
  ): Promise<Array<{ id: string; userId: string; createdAt: Date }>> {
    const logs = await this.prisma.flywheelDecisionLog.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, userId: true, createdAt: true },
    });
    return logs;
  }

  /**
   * 按 userId 查询（用于学习管道）
   */
  async getByUserId(
    userId: string,
    options?: { since?: Date; limit?: number },
  ): Promise<Array<{ id: string; tripId: string; utilityWeights: unknown; createdAt: Date }>> {
    const logs = await this.prisma.flywheelDecisionLog.findMany({
      where: {
        userId,
        ...(options?.since && { createdAt: { gte: options.since } }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 100,
      select: {
        id: true,
        tripId: true,
        utilityWeights: true,
        contextSnapshot: true,
        candidatePlans: true,
        selectedPlan: true,
        createdAt: true,
      },
    });
    return logs;
  }
}
