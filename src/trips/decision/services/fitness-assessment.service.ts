// src/trips/decision/services/fitness-assessment.service.ts
/**
 * Fitness Assessment Service（体能评估服务）
 * 
 * Phase 1 核心服务：
 * - 标准化问卷评估
 * - 历史行程校准
 * - 置信度管理
 * 
 * @since 2026-02
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  HumanCapabilityModel,
  FitnessQuestionnaireAnswers,
  TripFitnessFeedback,
  AgeGroup,
  FitnessLevel,
  ConfidenceLevel,
  createHumanCapabilityModelFromQuestionnaire,
  calibrateModelFromFeedback,
} from '../models/human-capability.model';

/**
 * 标准化问卷问题定义
 */
export interface FitnessQuestion {
  id: string;
  question: string;
  questionZh: string;
  options: {
    value: number;
    label: string;
    labelZh: string;
    emoji?: string;
  }[];
}

/**
 * 体能画像（用于前端展示）
 */
export interface FitnessProfile {
  /** 总评分（0-100） */
  overallScore: number;
  /** 体能等级 */
  fitnessLevel: FitnessLevel;
  /** 等级描述 */
  levelDescription: string;
  /** 置信度 */
  confidence: ConfidenceLevel;
  /** 置信度描述 */
  confidenceDescription: string;
  /** 各维度评分 */
  dimensions: {
    /** 爬升能力（0-100） */
    climbingAbility: number;
    /** 耐力（0-100） */
    endurance: number;
    /** 恢复速度（0-100） */
    recoverySpeed: number;
  };
  /** 建议的单日爬升（米） */
  recommendedDailyAscentM: number;
  /** 建议的单日距离（公里） */
  recommendedDailyDistanceKm: number;
  /** 已完成行程数 */
  completedTripCount: number;
  /** 问卷最长连续徒步天数档位 0–4（徒步详情 longestHike 对齐） */
  longestHike?: 0 | 1 | 2 | 3 | 4;
  /** 年龄修正信息 */
  ageInfo?: {
    ageGroup: AgeGroup;
    modifier: number;
    description: string;
  };
}

/**
 * 标准化问卷（Phase 1: 3个核心问题）
 */
export const FITNESS_QUESTIONNAIRE: FitnessQuestion[] = [
  {
    id: 'weekly_exercise',
    question: 'What are your exercise habits?',
    questionZh: '您平时的运动习惯是？',
    options: [
      { value: 0, label: 'Rarely exercise', labelZh: '基本不运动', emoji: '🛋️' },
      { value: 1, label: 'Occasional walks/light exercise', labelZh: '偶尔散步/轻运动', emoji: '🚶' },
      { value: 2, label: 'Exercise 2-3 times/week', labelZh: '每周运动2-3次', emoji: '🏃' },
      { value: 3, label: 'Exercise 4+ times/week', labelZh: '每周运动4次以上', emoji: '💪' },
      { value: 4, label: 'Professional athlete level', labelZh: '专业运动员水平', emoji: '🏆' },
    ],
  },
  {
    id: 'longest_hike',
    question: 'What is your longest single-day hike/trek?',
    questionZh: '您完成过的最长单日徒步/登山是？',
    options: [
      { value: 0, label: 'Never hiked', labelZh: '从未徒步过', emoji: '🌱' },
      { value: 1, label: '5km or less', labelZh: '5公里以内', emoji: '🌿' },
      { value: 2, label: '5-15km', labelZh: '5-15公里', emoji: '🌲' },
      { value: 3, label: '15-25km', labelZh: '15-25公里', emoji: '🏔️' },
      { value: 4, label: '25km+', labelZh: '25公里以上', emoji: '⛰️' },
    ],
  },
  {
    id: 'elevation_experience',
    question: 'What is your highest single-day elevation gain?',
    questionZh: '您完成过的最大单日爬升是？',
    options: [
      { value: 0, label: 'Not sure / Never tracked', labelZh: '不确定/从未关注', emoji: '❓' },
      { value: 1, label: 'Under 300m (like climbing 30 floors)', labelZh: '300米以下（约30层楼）', emoji: '🏢' },
      { value: 2, label: '300-600m', labelZh: '300-600米', emoji: '🗻' },
      { value: 3, label: '600-1000m', labelZh: '600-1000米', emoji: '🏔️' },
      { value: 4, label: '1000m+', labelZh: '1000米以上', emoji: '🏔️' },
    ],
  },
];

/**
 * 年龄段问题
 */
export const AGE_GROUP_QUESTION: FitnessQuestion = {
  id: 'age_group',
  question: 'What is your age group?',
  questionZh: '您的年龄是？',
  options: [
    { value: 0, label: '18-29', labelZh: '18-29岁', emoji: '👤' },
    { value: 1, label: '30-39', labelZh: '30-39岁', emoji: '👤' },
    { value: 2, label: '40-49', labelZh: '40-49岁', emoji: '👤' },
    { value: 3, label: '50-59', labelZh: '50-59岁', emoji: '👤' },
    { value: 4, label: '60+', labelZh: '60岁以上', emoji: '👤' },
  ],
};

@Injectable()
export class FitnessAssessmentService {
  private readonly logger = new Logger(FitnessAssessmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取标准化问卷问题
   */
  getQuestionnaire(_locale: 'en' | 'zh' = 'zh'): {
    questions: FitnessQuestion[];
    ageQuestion: FitnessQuestion;
  } {
    return {
      questions: FITNESS_QUESTIONNAIRE,
      ageQuestion: AGE_GROUP_QUESTION,
    };
  }

  /**
   * 从问卷答案创建人体能力模型
   */
  async createModelFromQuestionnaire(
    userId: string,
    answers: {
      weeklyExercise: 0 | 1 | 2 | 3 | 4;
      longestHike: 0 | 1 | 2 | 3 | 4;
      elevationExperience: 0 | 1 | 2 | 3 | 4;
      ageGroupIndex: 0 | 1 | 2 | 3 | 4;
    },
    options?: {
      riskTolerance?: 'low' | 'medium' | 'high';
      highAltitudeExperience?: 'none' | 'basic' | 'advanced';
      pace?: 'slow' | 'relaxed' | 'normal' | 'fast' | 'intense';
    }
  ): Promise<HumanCapabilityModel> {
    // 转换年龄段索引为 AgeGroup
    const ageGroups: AgeGroup[] = ['18-29', '30-39', '40-49', '50-59', '60+'];
    const ageGroup = ageGroups[answers.ageGroupIndex];

    // 构建问卷答案
    const questionnaireAnswers: FitnessQuestionnaireAnswers = {
      weeklyExercise: answers.weeklyExercise,
      longestHike: answers.longestHike,
      elevationExperience: answers.elevationExperience,
      ageGroup,
    };

    // 获取用户已完成的行程数量
    const completedTripCount = await this.getCompletedTripCount(userId);

    // 创建模型
    const model = createHumanCapabilityModelFromQuestionnaire(
      userId,
      questionnaireAnswers,
      {
        ...options,
        completedTripCount,
      }
    );

    // 保存问卷答案和模型参数到数据库（同步等待，确保保存成功）
    await this.saveQuestionnaireAnswersWithModel(userId, questionnaireAnswers, model);

    this.logger.log(
      `[体能评估] 用户 ${userId} 完成问卷评估: ` +
      `fitnessScore=${model.fitnessScore}, fitnessLevel=${model.fitnessLevel}, ` +
      `ageModifier=${model.ageModifier}, confidence=${model.confidenceLevel}`
    );

    return model;
  }

  /**
   * 基于历史反馈校准用户模型
   */
  async calibrateModel(
    userId: string,
    currentModel: HumanCapabilityModel
  ): Promise<HumanCapabilityModel> {
    // 获取最近的未处理反馈
    const feedbacks = await this.getUnprocessedFeedbacks(userId);

    if (feedbacks.length === 0) {
      this.logger.debug(`[体能校准] 用户 ${userId} 无未处理反馈，跳过校准`);
      return currentModel;
    }

    // 执行校准
    const calibratedModel = calibrateModelFromFeedback(currentModel, feedbacks);

    // 标记反馈为已处理
    await this.markFeedbacksAsProcessed(feedbacks.map((f) => f.tripId));

    this.logger.log(
      `[体能校准] 用户 ${userId} 校准完成: ` +
      `feedbackCount=${feedbacks.length}, ` +
      `oldAscent=${currentModel.maxDailyAscentM}m → newAscent=${calibratedModel.maxDailyAscentM}m`
    );

    return calibratedModel;
  }

  /**
   * 获取用户体能画像（用于前端展示）
   */
  async getFitnessProfile(
    userId: string,
    model: HumanCapabilityModel
  ): Promise<FitnessProfile> {
    const completedTripCount = model.completedTripCount || 0;

    // 计算各维度评分
    const climbingAbility = Math.min(100, Math.round((model.maxDailyAscentM / 1200) * 100));
    const endurance = Math.min(100, Math.round((model.rollingAscent3DaysM / 3000) * 100));
    const recoverySpeed = model.bufferDayBias === 'LOW' ? 80 :
                          model.bufferDayBias === 'MEDIUM' ? 60 : 40;

    // 建议的单日距离（基于体能等级）
    const recommendedDailyDistanceKm = this.getRecommendedDailyDistance(model.fitnessLevel || 'MEDIUM');

    // 等级描述
    const levelDescriptions: Record<FitnessLevel, string> = {
      'LOW': '入门徒步者，适合轻松的短途路线',
      'MEDIUM_LOW': '有一定基础，适合中等难度的日间徒步',
      'MEDIUM': '经验丰富的徒步者，可以挑战大多数路线',
      'MEDIUM_HIGH': '资深户外爱好者，具备较强的体能储备',
      'HIGH': '专业级别，可以挑战高难度长线路线',
    };

    // 置信度描述
    const confidenceDescriptions: Record<ConfidenceLevel, string> = {
      'LOW': '初步评估，完成更多行程后会更准确',
      'MEDIUM': '评估基本可靠，已有一定数据支撑',
      'HIGH': '评估很准确，基于充分的历史数据',
    };

    // 年龄修正描述
    let ageInfo: FitnessProfile['ageInfo'] | undefined;
    if (model.ageGroup && model.ageModifier) {
      const ageDescriptions: Record<AgeGroup, string> = {
        '18-29': '年轻力壮，处于体能巅峰期',
        '30-39': '体能良好，略有下降',
        '40-49': '体能稳定，注意合理安排',
        '50-59': '经验丰富，建议适当降低强度',
        '60+': '享受旅途，以舒适为主',
      };
      ageInfo = {
        ageGroup: model.ageGroup,
        modifier: model.ageModifier,
        description: ageDescriptions[model.ageGroup],
      };
    }

    return {
      overallScore: model.fitnessScore || 50,
      fitnessLevel: model.fitnessLevel || 'MEDIUM',
      levelDescription: levelDescriptions[model.fitnessLevel || 'MEDIUM'],
      confidence: model.confidenceLevel || 'LOW',
      confidenceDescription: confidenceDescriptions[model.confidenceLevel || 'LOW'],
      dimensions: {
        climbingAbility,
        endurance,
        recoverySpeed,
      },
      recommendedDailyAscentM: model.maxDailyAscentM,
      recommendedDailyDistanceKm,
      completedTripCount,
      longestHike: model.questionnaireLongestHike,
      ageInfo,
    };
  }

  /**
   * 收集行程后体能反馈
   */
  async collectTripFeedback(
    feedback: Omit<TripFitnessFeedback, 'feedbackAt'>
  ): Promise<void> {
    const fullFeedback: TripFitnessFeedback = {
      ...feedback,
      feedbackAt: new Date(),
    };

    try {
      await this.prisma.$executeRaw`
        INSERT INTO trip_fitness_feedback (
          trip_id, user_id, planned_fatigue_index, actual_effort_rating,
          completed_as_planned, adjustments_made, feedback_at, processed, created_at
        ) VALUES (
          ${fullFeedback.tripId}::VARCHAR,
          ${fullFeedback.userId}::VARCHAR,
          ${fullFeedback.plannedFatigueIndex}::DECIMAL,
          ${fullFeedback.actualEffortRating}::INTEGER,
          ${fullFeedback.completedAsPlanned}::BOOLEAN,
          ${JSON.stringify(fullFeedback.adjustmentsMade || [])}::JSONB,
          ${fullFeedback.feedbackAt}::TIMESTAMPTZ,
          false,
          NOW()
        )
        ON CONFLICT (trip_id, user_id) DO UPDATE SET
          actual_effort_rating = EXCLUDED.actual_effort_rating,
          completed_as_planned = EXCLUDED.completed_as_planned,
          adjustments_made = EXCLUDED.adjustments_made,
          feedback_at = EXCLUDED.feedback_at,
          processed = false
      `;

      this.logger.log(
        `[体能反馈] 收集成功: tripId=${feedback.tripId}, userId=${feedback.userId}, ` +
        `rating=${feedback.actualEffortRating}, completed=${feedback.completedAsPlanned}`
      );
    } catch (error: any) {
      this.logger.error(`[体能反馈] 收集失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取用户反馈统计
   */
  async getUserFeedbackStats(userId: string): Promise<{
    totalFeedbacks: number;
    avgEffortRating: number;
    completionRate: number;
    recentTrend: 'improving' | 'stable' | 'declining';
  }> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        total: bigint;
        avg_rating: number;
        completion_rate: number;
      }>>`
        SELECT 
          COUNT(*)::bigint as total,
          AVG(actual_effort_rating)::numeric as avg_rating,
          AVG(CASE WHEN completed_as_planned THEN 1.0 ELSE 0.0 END)::numeric as completion_rate
        FROM trip_fitness_feedback
        WHERE user_id = ${userId}
      `;

      const stats = result[0];
      const totalFeedbacks = Number(stats?.total || 0);
      const avgEffortRating = Number(stats?.avg_rating || 2);
      const completionRate = Number(stats?.completion_rate || 0);

      // 计算趋势（基于最近3次 vs 之前3次的对比）
      let recentTrend: 'improving' | 'stable' | 'declining' = 'stable';
      if (totalFeedbacks >= 6) {
        const trendResult = await this.prisma.$queryRaw<Array<{
          recent_avg: number;
          old_avg: number;
        }>>`
          WITH ranked AS (
            SELECT actual_effort_rating,
                   ROW_NUMBER() OVER (ORDER BY feedback_at DESC) as rn
            FROM trip_fitness_feedback
            WHERE user_id = ${userId}
          )
          SELECT 
            AVG(CASE WHEN rn <= 3 THEN actual_effort_rating END)::numeric as recent_avg,
            AVG(CASE WHEN rn > 3 AND rn <= 6 THEN actual_effort_rating END)::numeric as old_avg
          FROM ranked
        `;

        const trend = trendResult[0];
        if (trend) {
          const diff = trend.recent_avg - trend.old_avg;
          if (diff > 0.3) recentTrend = 'improving';
          else if (diff < -0.3) recentTrend = 'declining';
        }
      }

      return {
        totalFeedbacks,
        avgEffortRating,
        completionRate,
        recentTrend,
      };
    } catch (error: any) {
      this.logger.warn(`获取用户反馈统计失败: ${error.message}`);
      return {
        totalFeedbacks: 0,
        avgEffortRating: 2,
        completionRate: 0,
        recentTrend: 'stable',
      };
    }
  }

  // ========== 私有方法 ==========

  private async getCompletedTripCount(userId: string): Promise<number> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count
        FROM trip_fitness_feedback
        WHERE user_id = ${userId}
      `;
      return Number(result[0]?.count || 0);
    } catch {
      return 0;
    }
  }

  /**
   * 保存问卷答案和模型参数到数据库
   * 这是新的保存方法，会同时保存问卷答案和计算出的体能参数
   */
  private async saveQuestionnaireAnswersWithModel(
    userId: string,
    answers: FitnessQuestionnaireAnswers,
    model: HumanCapabilityModel
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO fitness_questionnaire_answers (
          user_id, weekly_exercise, longest_hike, elevation_experience,
          age_group, fitness_score, fitness_level, age_modifier, created_at
        ) VALUES (
          ${userId}::VARCHAR,
          ${answers.weeklyExercise}::INTEGER,
          ${answers.longestHike}::INTEGER,
          ${answers.elevationExperience}::INTEGER,
          ${answers.ageGroup}::VARCHAR,
          ${model.fitnessScore || 50}::INTEGER,
          ${model.fitnessLevel || 'MEDIUM'}::VARCHAR,
          ${model.ageModifier || 1.0}::DECIMAL,
          NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          weekly_exercise = EXCLUDED.weekly_exercise,
          longest_hike = EXCLUDED.longest_hike,
          elevation_experience = EXCLUDED.elevation_experience,
          age_group = EXCLUDED.age_group,
          fitness_score = EXCLUDED.fitness_score,
          fitness_level = EXCLUDED.fitness_level,
          age_modifier = EXCLUDED.age_modifier,
          created_at = NOW()
      `;
      this.logger.log(`[问卷保存] 用户 ${userId} 问卷答案已保存`);
    } catch (error: any) {
      this.logger.error(`保存问卷答案失败: ${error.message}`, error.stack);
      throw new Error(`保存体能评估数据失败: ${error.message}`);
    }
  }

  /**
   * 从数据库加载用户已保存的体能模型
   */
  async loadUserModel(userId: string): Promise<HumanCapabilityModel | null> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        user_id: string;
        weekly_exercise: number;
        longest_hike: number;
        elevation_experience: number;
        age_group: string;
        fitness_score: number | null;
        fitness_level: string | null;
        age_modifier: number | null;
        created_at: Date;
      }>>`
        SELECT user_id, weekly_exercise, longest_hike, elevation_experience,
               age_group, fitness_score, fitness_level, age_modifier, created_at
        FROM fitness_questionnaire_answers
        WHERE user_id = ${userId}
      `;

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      const completedTripCount = await this.getCompletedTripCount(userId);

      // 重建问卷答案
      const questionnaireAnswers: FitnessQuestionnaireAnswers = {
        weeklyExercise: row.weekly_exercise as 0 | 1 | 2 | 3 | 4,
        longestHike: row.longest_hike as 0 | 1 | 2 | 3 | 4,
        elevationExperience: row.elevation_experience as 0 | 1 | 2 | 3 | 4,
        ageGroup: row.age_group as AgeGroup,
      };

      // 从问卷重建模型
      const model = createHumanCapabilityModelFromQuestionnaire(
        userId,
        questionnaireAnswers,
        { completedTripCount }
      );

      this.logger.debug(`[模型加载] 用户 ${userId} 体能模型已加载: fitnessLevel=${model.fitnessLevel}`);
      return model;
    } catch (error: any) {
      this.logger.warn(`加载用户模型失败: ${error.message}`);
      return null;
    }
  }

  private async saveQuestionnaireAnswers(
    userId: string,
    answers: FitnessQuestionnaireAnswers
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO fitness_questionnaire_answers (
          user_id, weekly_exercise, longest_hike, elevation_experience,
          age_group, created_at
        ) VALUES (
          ${userId}::VARCHAR,
          ${answers.weeklyExercise}::INTEGER,
          ${answers.longestHike}::INTEGER,
          ${answers.elevationExperience}::INTEGER,
          ${answers.ageGroup}::VARCHAR,
          NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          weekly_exercise = EXCLUDED.weekly_exercise,
          longest_hike = EXCLUDED.longest_hike,
          elevation_experience = EXCLUDED.elevation_experience,
          age_group = EXCLUDED.age_group,
          created_at = NOW()
      `;
    } catch (error: any) {
      this.logger.warn(`保存问卷答案失败: ${error.message}`);
    }
  }

  private async getUnprocessedFeedbacks(userId: string): Promise<TripFitnessFeedback[]> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        trip_id: string;
        user_id: string;
        planned_fatigue_index: number;
        actual_effort_rating: number;
        completed_as_planned: boolean;
        adjustments_made: string[];
        feedback_at: Date;
      }>>`
        SELECT trip_id, user_id, planned_fatigue_index, actual_effort_rating,
               completed_as_planned, adjustments_made, feedback_at
        FROM trip_fitness_feedback
        WHERE user_id = ${userId} AND processed = false
        ORDER BY feedback_at DESC
        LIMIT 10
      `;

      return result.map((row) => ({
        tripId: row.trip_id,
        userId: row.user_id,
        plannedFatigueIndex: Number(row.planned_fatigue_index),
        actualEffortRating: row.actual_effort_rating as 1 | 2 | 3,
        completedAsPlanned: row.completed_as_planned,
        adjustmentsMade: row.adjustments_made,
        feedbackAt: row.feedback_at,
      }));
    } catch {
      return [];
    }
  }

  private async markFeedbacksAsProcessed(tripIds: string[]): Promise<void> {
    if (tripIds.length === 0) return;

    try {
      await this.prisma.$executeRaw`
        UPDATE trip_fitness_feedback
        SET processed = true
        WHERE trip_id = ANY(${tripIds}::VARCHAR[])
      `;
    } catch (error: any) {
      this.logger.warn(`标记反馈为已处理失败: ${error.message}`);
    }
  }

  private getRecommendedDailyDistance(fitnessLevel: FitnessLevel): number {
    const mapping: Record<FitnessLevel, number> = {
      'LOW': 12,
      'MEDIUM_LOW': 16,
      'MEDIUM': 20,
      'MEDIUM_HIGH': 24,
      'HIGH': 28,
    };
    return mapping[fitnessLevel];
  }
}
