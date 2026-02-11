// src/trips/decision/services/fitness-ab-testing.service.ts
/**
 * Fitness A/B Testing Service（体能模型 A/B 测试框架）
 * 
 * Phase 2 核心服务：
 * - 新旧模型对比验证
 * - 实验分组管理
 * - 效果评估
 * 
 * @since 2026-02 Phase 2
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 实验配置
 */
export interface ExperimentConfig {
  id: string;
  name: string;
  description: string;
  
  // 实验参数
  controlGroup: ExperimentVariant;
  treatmentGroup: ExperimentVariant;
  
  // 分流配置
  trafficPercent: number;  // 进入实验的流量百分比
  treatmentPercent: number; // 实验组占比（剩余为对照组）
  
  // 时间配置
  startDate: Date;
  endDate?: Date;
  
  // 状态
  status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  
  // 成功指标
  primaryMetric: 'COMPLETION_RATE' | 'AVG_EFFORT_RATING' | 'CALIBRATION_ACCURACY';
  minimumSampleSize: number;
}

/**
 * 实验变体
 */
export interface ExperimentVariant {
  id: string;
  name: string;
  algorithm: 'QUESTIONNAIRE_V1' | 'QUESTIONNAIRE_V2' | 'HISTORICAL_CALIBRATION' | 'ML_BASED';
  parameters: Record<string, any>;
}

/**
 * 用户实验分配
 */
export interface UserExperimentAssignment {
  userId: string;
  experimentId: string;
  variant: 'CONTROL' | 'TREATMENT';
  assignedAt: Date;
}

/**
 * 实验结果
 */
export interface ExperimentResults {
  experimentId: string;
  status: 'INSUFFICIENT_DATA' | 'IN_PROGRESS' | 'SIGNIFICANT' | 'NOT_SIGNIFICANT';
  
  control: {
    sampleSize: number;
    completionRate: number;
    avgEffortRating: number;
    avgCalibrationFactor: number;
  };
  
  treatment: {
    sampleSize: number;
    completionRate: number;
    avgEffortRating: number;
    avgCalibrationFactor: number;
  };
  
  // 统计显著性
  pValue?: number;
  confidenceLevel?: number;
  lift?: number;  // 提升百分比
  
  recommendation: string;
  recommendationZh: string;
}

@Injectable()
export class FitnessABTestingService {
  private readonly logger = new Logger(FitnessABTestingService.name);
  
  // 内存中的实验配置（生产环境应存储在数据库）
  private experiments: Map<string, ExperimentConfig> = new Map();
  private assignments: Map<string, UserExperimentAssignment> = new Map();

  constructor(private readonly prisma: PrismaService) {
    // 初始化默认实验
    this.initDefaultExperiments();
  }

  /**
   * 初始化默认实验
   */
  private initDefaultExperiments() {
    // 实验1：问卷评分权重优化
    this.experiments.set('exp_questionnaire_weights', {
      id: 'exp_questionnaire_weights',
      name: '问卷评分权重优化',
      description: '测试新的问卷评分权重分配是否能提高准确性',
      controlGroup: {
        id: 'control',
        name: '原始权重',
        algorithm: 'QUESTIONNAIRE_V1',
        parameters: {
          weeklyExerciseWeight: 0.30,
          longestHikeWeight: 0.35,
          elevationWeight: 0.35,
        },
      },
      treatmentGroup: {
        id: 'treatment',
        name: '新权重（强调实际经验）',
        algorithm: 'QUESTIONNAIRE_V2',
        parameters: {
          weeklyExerciseWeight: 0.20,
          longestHikeWeight: 0.40,
          elevationWeight: 0.40,
        },
      },
      trafficPercent: 20,
      treatmentPercent: 50,
      startDate: new Date(),
      status: 'RUNNING',
      primaryMetric: 'AVG_EFFORT_RATING',
      minimumSampleSize: 100,
    });

    // 实验2：校准算法优化
    this.experiments.set('exp_calibration_algo', {
      id: 'exp_calibration_algo',
      name: '校准算法优化',
      description: '测试新的校准算法是否能更快达到准确评估',
      controlGroup: {
        id: 'control',
        name: '标准校准',
        algorithm: 'HISTORICAL_CALIBRATION',
        parameters: {
          minFeedbacks: 3,
          maxAdjustment: 0.20,
        },
      },
      treatmentGroup: {
        id: 'treatment',
        name: '激进校准',
        algorithm: 'HISTORICAL_CALIBRATION',
        parameters: {
          minFeedbacks: 2,
          maxAdjustment: 0.25,
        },
      },
      trafficPercent: 10,
      treatmentPercent: 50,
      startDate: new Date(),
      status: 'DRAFT',
      primaryMetric: 'CALIBRATION_ACCURACY',
      minimumSampleSize: 50,
    });
  }

  /**
   * 获取用户的实验分配
   */
  async getUserExperimentVariant(
    userId: string,
    experimentId: string
  ): Promise<'CONTROL' | 'TREATMENT' | null> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'RUNNING') {
      return null;
    }

    // 检查是否已分配
    const assignmentKey = `${userId}:${experimentId}`;
    const existing = this.assignments.get(assignmentKey);
    if (existing) {
      return existing.variant;
    }

    // 基于用户ID哈希决定是否进入实验
    const hash = this.hashUserId(userId);
    const inExperiment = (hash % 100) < experiment.trafficPercent;
    
    if (!inExperiment) {
      return null;
    }

    // 决定分组
    const variant: 'CONTROL' | 'TREATMENT' = 
      ((hash >> 8) % 100) < experiment.treatmentPercent ? 'TREATMENT' : 'CONTROL';

    // 保存分配
    const assignment: UserExperimentAssignment = {
      userId,
      experimentId,
      variant,
      assignedAt: new Date(),
    };
    this.assignments.set(assignmentKey, assignment);

    this.logger.debug(
      `用户 ${userId} 分配到实验 ${experimentId} 的 ${variant} 组`
    );

    return variant;
  }

  /**
   * 记录实验事件
   */
  async recordExperimentEvent(
    userId: string,
    experimentId: string,
    eventType: 'QUESTIONNAIRE_COMPLETED' | 'TRIP_FEEDBACK' | 'CALIBRATION',
    eventData: Record<string, any>
  ): Promise<void> {
    const variant = await this.getUserExperimentVariant(userId, experimentId);
    if (!variant) return;

    try {
      await this.prisma.$executeRaw`
        INSERT INTO fitness_experiment_events (
          user_id, experiment_id, variant, event_type, event_data, created_at
        ) VALUES (
          ${userId}, ${experimentId}, ${variant}, ${eventType}, ${JSON.stringify(eventData)}::JSONB, NOW()
        )
      `;
    } catch (error: any) {
      // 表可能不存在，忽略错误
      this.logger.debug(`记录实验事件失败（表可能不存在）: ${error.message}`);
    }
  }

  /**
   * 获取实验结果
   */
  async getExperimentResults(experimentId: string): Promise<ExperimentResults> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验 ${experimentId} 不存在`);
    }

    try {
      // 获取对照组数据
      const controlData = await this.getVariantMetrics(experimentId, 'CONTROL');
      
      // 获取实验组数据
      const treatmentData = await this.getVariantMetrics(experimentId, 'TREATMENT');

      // 检查样本量
      const totalSample = controlData.sampleSize + treatmentData.sampleSize;
      if (totalSample < experiment.minimumSampleSize) {
        return {
          experimentId,
          status: 'INSUFFICIENT_DATA',
          control: controlData,
          treatment: treatmentData,
          recommendation: `Need ${experiment.minimumSampleSize - totalSample} more samples`,
          recommendationZh: `还需要 ${experiment.minimumSampleSize - totalSample} 个样本`,
        };
      }

      // 计算统计显著性（简化版 t-test）
      const { pValue, significant, lift } = this.calculateSignificance(
        controlData,
        treatmentData,
        experiment.primaryMetric
      );

      let recommendation: string;
      let recommendationZh: string;

      if (significant && lift > 0) {
        recommendation = `Treatment group shows ${lift.toFixed(1)}% improvement. Consider rolling out.`;
        recommendationZh = `实验组提升 ${lift.toFixed(1)}%，建议全量上线。`;
      } else if (significant && lift < 0) {
        recommendation = `Treatment group shows ${Math.abs(lift).toFixed(1)}% decline. Do not roll out.`;
        recommendationZh = `实验组下降 ${Math.abs(lift).toFixed(1)}%，不建议上线。`;
      } else {
        recommendation = 'No significant difference detected. Continue experiment or try different approach.';
        recommendationZh = '未检测到显著差异，建议继续实验或尝试其他方案。';
      }

      return {
        experimentId,
        status: significant ? 'SIGNIFICANT' : 'NOT_SIGNIFICANT',
        control: controlData,
        treatment: treatmentData,
        pValue,
        confidenceLevel: 1 - pValue,
        lift,
        recommendation,
        recommendationZh,
      };
    } catch (error: any) {
      this.logger.error(`获取实验结果失败: ${error.message}`);
      return {
        experimentId,
        status: 'INSUFFICIENT_DATA',
        control: { sampleSize: 0, completionRate: 0, avgEffortRating: 0, avgCalibrationFactor: 1 },
        treatment: { sampleSize: 0, completionRate: 0, avgEffortRating: 0, avgCalibrationFactor: 1 },
        recommendation: 'Failed to retrieve experiment data',
        recommendationZh: '获取实验数据失败',
      };
    }
  }

  /**
   * 获取所有实验
   */
  getAllExperiments(): ExperimentConfig[] {
    return Array.from(this.experiments.values());
  }

  /**
   * 更新实验状态
   */
  updateExperimentStatus(experimentId: string, status: ExperimentConfig['status']): void {
    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.status = status;
      this.experiments.set(experimentId, experiment);
      this.logger.log(`实验 ${experimentId} 状态更新为 ${status}`);
    }
  }

  // ========== 私有方法 ==========

  /**
   * 用户ID哈希（确定性分流）
   */
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * 获取变体指标
   */
  private async getVariantMetrics(
    experimentId: string,
    variant: 'CONTROL' | 'TREATMENT'
  ): Promise<{
    sampleSize: number;
    completionRate: number;
    avgEffortRating: number;
    avgCalibrationFactor: number;
  }> {
    // 从分配记录中获取该变体的用户
    const users: string[] = [];
    for (const [key, assignment] of this.assignments) {
      if (assignment.experimentId === experimentId && assignment.variant === variant) {
        users.push(assignment.userId);
      }
    }

    if (users.length === 0) {
      return { sampleSize: 0, completionRate: 0, avgEffortRating: 0, avgCalibrationFactor: 1 };
    }

    try {
      const result = await this.prisma.$queryRaw<Array<{
        sample_size: bigint;
        completion_rate: number;
        avg_rating: number;
      }>>`
        SELECT 
          COUNT(*) as sample_size,
          AVG(CASE WHEN completed_as_planned THEN 1.0 ELSE 0.0 END)::numeric as completion_rate,
          AVG(actual_effort_rating)::numeric as avg_rating
        FROM trip_fitness_feedback
        WHERE user_id = ANY(${users}::VARCHAR[])
      `;

      return {
        sampleSize: Number(result[0]?.sample_size || 0),
        completionRate: Number(result[0]?.completion_rate || 0),
        avgEffortRating: Number(result[0]?.avg_rating || 0),
        avgCalibrationFactor: 1.0, // 需要从校准历史计算
      };
    } catch {
      return { sampleSize: users.length, completionRate: 0, avgEffortRating: 0, avgCalibrationFactor: 1 };
    }
  }

  /**
   * 计算统计显著性（简化版）
   */
  private calculateSignificance(
    control: { sampleSize: number; completionRate: number; avgEffortRating: number },
    treatment: { sampleSize: number; completionRate: number; avgEffortRating: number },
    metric: ExperimentConfig['primaryMetric']
  ): { pValue: number; significant: boolean; lift: number } {
    let controlValue: number;
    let treatmentValue: number;

    switch (metric) {
      case 'COMPLETION_RATE':
        controlValue = control.completionRate;
        treatmentValue = treatment.completionRate;
        break;
      case 'AVG_EFFORT_RATING':
        // 评分越接近2（刚刚好）越好
        controlValue = 1 - Math.abs(control.avgEffortRating - 2) / 2;
        treatmentValue = 1 - Math.abs(treatment.avgEffortRating - 2) / 2;
        break;
      default:
        controlValue = 0;
        treatmentValue = 0;
    }

    // 简化的显著性计算（实际应使用 t-test 或 chi-square）
    const diff = Math.abs(treatmentValue - controlValue);
    const pooledStdErr = 0.1; // 简化假设
    const zScore = diff / pooledStdErr;
    
    // 近似 p-value
    const pValue = Math.exp(-0.5 * zScore * zScore);
    const significant = pValue < 0.05;
    const lift = controlValue > 0 ? ((treatmentValue - controlValue) / controlValue) * 100 : 0;

    return { pValue, significant, lift };
  }
}
