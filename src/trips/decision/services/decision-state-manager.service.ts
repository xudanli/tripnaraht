// src/trips/decision/services/decision-state-manager.service.ts

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DecisionState,
  DecisionStage,
  DecisionSteps,
  FeaturesDisabled,
  DecisionStateUpdateRequest,
} from '../interfaces/decision-state.interface';

/**
 * 决策状态管理服务
 * 
 * 提供决策状态管理功能：
 * - 追踪决策完成度
 * - 管理功能禁用状态
 * - 检查决策是否完成
 */
@Injectable()
export class DecisionStateManagerService {
  private readonly logger = new Logger(DecisionStateManagerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取决策状态
   */
  async getDecisionState(tripId: string): Promise<DecisionState> {
    // 检查Trip是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    // 从metadata中读取决策状态，如果没有则创建默认状态
    const metadata = (trip.metadata as Record<string, any>) || {};
    const decisionState = metadata.decisionState as Partial<DecisionState> | undefined;

    if (decisionState) {
      return this.normalizeDecisionState(decisionState, tripId);
    }

    // 创建初始决策状态
    return this.createInitialDecisionState(tripId);
  }

  /**
   * 检查决策是否完成
   */
  async checkDecisionCompleted(tripId: string): Promise<boolean> {
    const state = await this.getDecisionState(tripId);
    return state.decisionCompleted;
  }

  /**
   * 更新决策状态
   */
  async updateDecisionState(
    tripId: string,
    update: DecisionStateUpdateRequest,
  ): Promise<DecisionState> {
    const currentState = await this.getDecisionState(tripId);
    let newState: DecisionState = { ...currentState };

    // 更新步骤
    if (update.step) {
      newState.completedSteps[update.step] = true;
    }

    // 更新阶段
    if (update.stage) {
      newState.currentStage = update.stage;
    }

    // 更新完成状态
    if (update.decisionCompleted !== undefined) {
      newState.decisionCompleted = update.decisionCompleted;
      if (update.decisionCompleted) {
        newState.decisionCompletedAt = new Date();
        // 启用执行功能
        newState.featuresDisabled = {
          booking: false,
          purchase: false,
          execution: false,
        };
      }
    }

    // 计算完成度
    newState.decisionCompletionPercentage = this.calculateCompletionPercentage(
      newState.completedSteps,
    );

    // 如果所有步骤完成，自动标记决策完成
    if (
      newState.decisionCompletionPercentage === 100 &&
      !newState.decisionCompleted
    ) {
      newState.decisionCompleted = true;
      newState.decisionCompletedAt = new Date();
      newState.featuresDisabled = {
        booking: false,
        purchase: false,
        execution: false,
      };
    }

    // 更新元数据
    if (update.metadata) {
      newState.metadata = {
        ...newState.metadata,
        ...update.metadata,
      };
    }

    newState.updatedAt = new Date();

    // 保存到数据库
    await this.saveDecisionState(tripId, newState);

    this.logger.log(
      `Decision state updated for trip ${tripId}: ${newState.decisionCompletionPercentage}% complete`,
    );

    return newState;
  }

  /**
   * 更新决策完成度
   */
  async updateDecisionProgress(
    tripId: string,
    step: keyof DecisionSteps,
  ): Promise<DecisionState> {
    return this.updateDecisionState(tripId, { step });
  }

  /**
   * 禁用决策前功能
   */
  async disablePreDecisionFeatures(tripId: string): Promise<DecisionState> {
    const state = await this.getDecisionState(tripId);
    state.featuresDisabled = {
      booking: true,
      purchase: true,
      execution: true,
    };
    return this.saveDecisionState(tripId, state);
  }

  /**
   * 启用执行功能
   */
  async enableExecutionFeatures(tripId: string): Promise<DecisionState> {
    return this.updateDecisionState(tripId, {
      decisionCompleted: true,
    });
  }

  /**
   * 检查功能是否可用
   */
  async isFeatureEnabled(
    tripId: string,
    feature: 'booking' | 'purchase' | 'execution',
  ): Promise<boolean> {
    const state = await this.getDecisionState(tripId);
    return !state.featuresDisabled[feature];
  }

  /**
   * 验证是否可以执行操作
   */
  async validateFeatureAccess(
    tripId: string,
    feature: 'booking' | 'purchase' | 'execution',
  ): Promise<void> {
    const isEnabled = await this.isFeatureEnabled(tripId, feature);
    if (!isEnabled) {
      const state = await this.getDecisionState(tripId);
      throw new Error(
        `功能 ${feature} 已被禁用。决策完成度：${state.decisionCompletionPercentage}%。请先完成决策流程。`,
      );
    }
  }

  // ========== 私有方法 ==========

  /**
   * 创建初始决策状态
   */
  private createInitialDecisionState(tripId: string): DecisionState {
    const userId = this.extractUserIdFromTripId(tripId); // 简化实现，实际应从Trip获取

    return {
      tripId,
      userId: userId || 'unknown',
      decisionCompleted: false,
      decisionCompletionPercentage: 0,
      currentStage: 'INTENTION',
      completedSteps: {
        routeSelection: false,
        rhythmSelection: false,
        riskAcknowledgment: false,
        finalConfirmation: false,
      },
      featuresDisabled: {
        booking: true,
        purchase: true,
        execution: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * 规范化决策状态
   */
  private normalizeDecisionState(
    state: Partial<DecisionState>,
    tripId: string,
  ): DecisionState {
    const userId = state.userId || this.extractUserIdFromTripId(tripId) || 'unknown';

    return {
      tripId,
      userId,
      decisionCompleted: state.decisionCompleted || false,
      decisionCompletedAt: state.decisionCompletedAt,
      decisionCompletionPercentage:
        state.decisionCompletionPercentage ?? 0,
      currentStage: state.currentStage || 'INTENTION',
      completedSteps: {
        routeSelection: state.completedSteps?.routeSelection || false,
        rhythmSelection: state.completedSteps?.rhythmSelection || false,
        riskAcknowledgment: state.completedSteps?.riskAcknowledgment || false,
        finalConfirmation: state.completedSteps?.finalConfirmation || false,
      },
      featuresDisabled: {
        booking: state.featuresDisabled?.booking ?? true,
        purchase: state.featuresDisabled?.purchase ?? true,
        execution: state.featuresDisabled?.execution ?? true,
      },
      createdAt: state.createdAt || new Date(),
      updatedAt: state.updatedAt || new Date(),
      metadata: state.metadata,
    };
  }

  /**
   * 计算完成度
   */
  private calculateCompletionPercentage(steps: DecisionSteps): number {
    const completedCount = Object.values(steps).filter(Boolean).length;
    const totalSteps = Object.keys(steps).length;
    return Math.round((completedCount / totalSteps) * 100);
  }

  /**
   * 保存决策状态到数据库
   */
  private async saveDecisionState(
    tripId: string,
    state: DecisionState,
  ): Promise<DecisionState> {
    // 从Trip获取当前metadata
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const metadata = (trip.metadata as Record<string, any>) || {};
    metadata.decisionState = {
      ...state,
      // 转换Date为ISO字符串以便存储
      decisionCompletedAt: state.decisionCompletedAt?.toISOString(),
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    };

    // 更新Trip的metadata
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata },
    });

    return state;
  }

  /**
   * 从Trip ID提取User ID（简化实现）
   */
  private extractUserIdFromTripId(tripId: string): string | null {
    // 实际实现应该从Trip表查询userId
    // 这里简化处理
    return null;
  }
}
