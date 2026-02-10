/**
 * 自适应世界模型服务
 * 
 * 负责自动调整世界模型参数，包括：
 * - 基于用户反馈调整路线难度、时间估算、风险评估
 * - 版本管理（A/B测试、回滚）
 * - 参数调整历史记录
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdaptiveParameters } from '../interfaces/unified-world-model.interface';
import { UserCapabilityLearningService } from './user-capability-learning.service';
import { UserFeedbackService } from './user-feedback.service';

/**
 * 参数调整原因
 */
export interface ParameterAdjustmentReason {
  type: 'USER_FEEDBACK' | 'ROUTE_DIFFICULTY_CORRECTION' | 'TIME_ESTIMATE_CORRECTION' | 'RISK_ASSESSMENT_CORRECTION';
  description: string;
  evidence: string[];
}

/**
 * 参数版本
 */
export interface ParameterVersion {
  versionId: string;
  parameters: AdaptiveParameters;
  createdAt: Date;
  isActive: boolean;
  adjustmentReasons: ParameterAdjustmentReason[];
  performanceMetrics?: {
    userSatisfaction: number; // 0-1
    predictionAccuracy: number; // 0-1
    usageCount: number;
  };
}

@Injectable()
export class AdaptiveWorldModelService {
  private readonly logger = new Logger(AdaptiveWorldModelService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private userCapabilityLearningService?: UserCapabilityLearningService,
    @Optional() private userFeedbackService?: UserFeedbackService,
  ) {}

  /**
   * 获取自适应参数（当前活跃版本）
   */
  async getAdaptiveParameters(
    routeDirectionId?: string,
    userId?: string,
  ): Promise<AdaptiveParameters> {
    this.logger.log(
      `[AdaptiveWorldModel] 获取自适应参数: routeDirectionId=${routeDirectionId}, userId=${userId}`,
    );

    try {
      // 1. 获取当前活跃版本
      const activeVersion = await this.getActiveVersion(routeDirectionId);

      if (activeVersion) {
        this.logger.debug(
          `[AdaptiveWorldModel] 使用版本 ${activeVersion.versionId} 的参数`,
        );
        return activeVersion.parameters;
      }

      // 2. 如果没有活跃版本，基于用户反馈计算参数
      const calculatedParameters = await this.calculateParametersFromFeedback(
        routeDirectionId,
        userId,
      );

      // 3. 创建新版本
      if (calculatedParameters) {
        await this.createVersion(calculatedParameters, routeDirectionId);
        return calculatedParameters;
      }

      // 4. 降级策略：返回默认参数
      return this.getDefaultParameters();
    } catch (error: any) {
      this.logger.error(
        `[AdaptiveWorldModel] 获取自适应参数失败: ${error.message}`,
        error.stack,
      );
      return this.getDefaultParameters();
    }
  }

  /**
   * 获取当前活跃版本
   */
  private async getActiveVersion(
    routeDirectionId?: string,
  ): Promise<ParameterVersion | null> {
    const query = routeDirectionId
      ? `
        SELECT * FROM adaptive_world_model_version
        WHERE route_direction_id = $1::uuid
          AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `
      : `
        SELECT * FROM adaptive_world_model_version
        WHERE route_direction_id IS NULL
          AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `;

    const results = await this.prisma.$queryRawUnsafe(
      query,
      routeDirectionId || null,
    ) as any[];

    if (results.length === 0) {
      return null;
    }

    const version = results[0];
    return {
      versionId: version.version_id,
      parameters: {
        routeDifficultyAdjustment: version.route_difficulty_adjustment || 1.0,
        timeEstimateAdjustment: version.time_estimate_adjustment || 1.0,
        riskAssessmentAdjustment: version.risk_assessment_adjustment || 1.0,
      },
      createdAt: version.created_at,
      isActive: version.is_active,
      adjustmentReasons: version.adjustment_reasons || [],
      performanceMetrics: version.performance_metrics || undefined,
    };
  }

  /**
   * 基于用户反馈计算参数
   */
  private async calculateParametersFromFeedback(
    routeDirectionId?: string,
    userId?: string,
  ): Promise<AdaptiveParameters | null> {
    if (!this.userFeedbackService || !this.userCapabilityLearningService) {
      return null;
    }

    try {
      const parameters: AdaptiveParameters = {
        routeDifficultyAdjustment: 1.0,
        timeEstimateAdjustment: 1.0,
        riskAssessmentAdjustment: 1.0,
      };

      // 1. 路线难度调整（基于路线难度修正）
      if (routeDirectionId) {
        const difficultyCorrection = await this.getRouteDifficultyCorrection(
          routeDirectionId,
        );
        if (difficultyCorrection) {
          parameters.routeDifficultyAdjustment = difficultyCorrection.correctionFactor;
        }
      }

      // 2. 时间估算调整（基于用户能力学习）
      if (userId) {
        const learnedCapability =
          await this.userCapabilityLearningService.getLearnedCapability(userId);
        if (learnedCapability) {
          // 如果用户实际节奏比预估快，降低时间估算
          // 如果用户实际节奏比预估慢，提高时间估算
          const paceAdjustment = this.calculatePaceAdjustment(
            learnedCapability.actualPace,
            learnedCapability.predictionAccuracy.timePrediction,
          );
          parameters.timeEstimateAdjustment = paceAdjustment;
        }
      }

      // 3. 风险评估调整（基于用户反馈）
      if (userId) {
        const feedbacks = await this.userFeedbackService.getFeedbackByUserId(userId);
        const riskAdjustment = this.calculateRiskAdjustment(feedbacks);
        parameters.riskAssessmentAdjustment = riskAdjustment;
      }

      return parameters;
    } catch (error: any) {
      this.logger.error(
        `[AdaptiveWorldModel] 计算参数失败: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * 获取路线难度修正
   */
  private async getRouteDifficultyCorrection(
    routeDirectionId: string,
  ): Promise<{ correctionFactor: number } | null> {
    const results = await this.prisma.$queryRawUnsafe(`
      SELECT * FROM route_difficulty_correction
      WHERE route_direction_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `, routeDirectionId) as any[];

    if (results.length === 0) {
      return null;
    }

    const correction = results[0];
    return {
      correctionFactor: correction.correction_factor || 1.0,
    };
  }

  /**
   * 计算节奏调整系数
   */
  private calculatePaceAdjustment(
    actualPace: 'slow' | 'moderate' | 'fast',
    timePredictionAccuracy: number,
  ): number {
    // 如果预测准确度高，不需要调整
    if (timePredictionAccuracy > 0.8) {
      return 1.0;
    }

    // 根据实际节奏调整
    const paceMultipliers = {
      slow: 1.2, // 用户节奏慢，时间估算需要增加20%
      moderate: 1.0,
      fast: 0.8, // 用户节奏快，时间估算需要减少20%
    };

    return paceMultipliers[actualPace] || 1.0;
  }

  /**
   * 计算风险评估调整系数
   */
  private calculateRiskAdjustment(feedbacks: any[]): number {
    if (feedbacks.length === 0) {
      return 1.0;
    }

    // 统计用户实际风险承受度
    const riskToleranceCounts = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
    };

    for (const feedback of feedbacks) {
      if (feedback.feedbackData?.riskTolerance) {
        riskToleranceCounts[feedback.feedbackData.riskTolerance]++;
      }
    }

    // 如果用户实际风险承受度高，降低风险评估
    // 如果用户实际风险承受度低，提高风险评估
    const total = riskToleranceCounts.LOW + riskToleranceCounts.MEDIUM + riskToleranceCounts.HIGH;
    if (total === 0) {
      return 1.0;
    }

    const highRiskRatio = riskToleranceCounts.HIGH / total;
    const lowRiskRatio = riskToleranceCounts.LOW / total;

    // 如果高风险承受度比例高，降低风险评估（系数 < 1.0）
    // 如果低风险承受度比例高，提高风险评估（系数 > 1.0）
    if (highRiskRatio > 0.5) {
      return 0.8; // 降低风险评估
    } else if (lowRiskRatio > 0.5) {
      return 1.2; // 提高风险评估
    }

    return 1.0;
  }

  /**
   * 创建新版本
   */
  async createVersion(
    parameters: AdaptiveParameters,
    routeDirectionId?: string,
    adjustmentReasons?: ParameterAdjustmentReason[],
  ): Promise<string> {
    this.logger.log(
      `[AdaptiveWorldModel] 创建新版本: routeDirectionId=${routeDirectionId}`,
    );

    try {
      // 1. 停用旧版本
      if (routeDirectionId) {
        await this.prisma.$executeRawUnsafe(`
          UPDATE adaptive_world_model_version
          SET is_active = false
          WHERE route_direction_id = $1::uuid
            AND is_active = true
        `, routeDirectionId);
      } else {
        await this.prisma.$executeRawUnsafe(`
          UPDATE adaptive_world_model_version
          SET is_active = false
          WHERE route_direction_id IS NULL
            AND is_active = true
        `);
      }

      // 2. 创建新版本
      const versionId = `v${Date.now()}`;
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO adaptive_world_model_version (
          version_id,
          route_direction_id,
          route_difficulty_adjustment,
          time_estimate_adjustment,
          risk_assessment_adjustment,
          adjustment_reasons,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          $1::varchar,
          $2::uuid,
          $3::double precision,
          $4::double precision,
          $5::double precision,
          $6::jsonb,
          true,
          NOW(),
          NOW()
        )
      `,
        versionId,
        routeDirectionId || null,
        parameters.routeDifficultyAdjustment,
        parameters.timeEstimateAdjustment,
        parameters.riskAssessmentAdjustment,
        JSON.stringify(adjustmentReasons || []),
      );

      this.logger.log(`[AdaptiveWorldModel] 新版本已创建: ${versionId}`);
      return versionId;
    } catch (error: any) {
      this.logger.error(
        `[AdaptiveWorldModel] 创建版本失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 回滚到指定版本
   */
  async rollbackToVersion(versionId: string): Promise<void> {
    this.logger.log(`[AdaptiveWorldModel] 回滚到版本: ${versionId}`);

    try {
      // 1. 获取版本信息
      const version = await this.prisma.$queryRawUnsafe(`
        SELECT * FROM adaptive_world_model_version
        WHERE version_id = $1::varchar
      `, versionId) as any[];

      if (version.length === 0) {
        throw new Error(`Version not found: ${versionId}`);
      }

      const targetVersion = version[0];

      // 2. 停用当前活跃版本
      if (targetVersion.route_direction_id) {
        await this.prisma.$executeRawUnsafe(`
          UPDATE adaptive_world_model_version
          SET is_active = false
          WHERE route_direction_id = $1::uuid
            AND is_active = true
        `, targetVersion.route_direction_id);
      } else {
        await this.prisma.$executeRawUnsafe(`
          UPDATE adaptive_world_model_version
          SET is_active = false
          WHERE route_direction_id IS NULL
            AND is_active = true
        `);
      }

      // 3. 激活目标版本
      await this.prisma.$executeRawUnsafe(`
        UPDATE adaptive_world_model_version
        SET is_active = true,
            updated_at = NOW()
        WHERE version_id = $1::varchar
      `, versionId);

      this.logger.log(`[AdaptiveWorldModel] 已回滚到版本: ${versionId}`);
    } catch (error: any) {
      this.logger.error(
        `[AdaptiveWorldModel] 回滚失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 获取默认参数
   */
  private getDefaultParameters(): AdaptiveParameters {
    return {
      routeDifficultyAdjustment: 1.0,
      timeEstimateAdjustment: 1.0,
      riskAssessmentAdjustment: 1.0,
    };
  }

  /**
   * 更新版本性能指标
   */
  async updateVersionPerformanceMetrics(
    versionId: string,
    metrics: {
      userSatisfaction?: number;
      predictionAccuracy?: number;
      usageCount?: number;
    },
  ): Promise<void> {
    this.logger.log(
      `[AdaptiveWorldModel] 更新版本性能指标: versionId=${versionId}`,
    );

    try {
      await this.prisma.$executeRawUnsafe(`
        UPDATE adaptive_world_model_version
        SET performance_metrics = $1::jsonb,
            updated_at = NOW()
        WHERE version_id = $2::varchar
      `, JSON.stringify(metrics), versionId);
    } catch (error: any) {
      this.logger.error(
        `[AdaptiveWorldModel] 更新性能指标失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
