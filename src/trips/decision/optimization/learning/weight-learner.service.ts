// src/trips/decision/optimization/learning/weight-learner.service.ts
/**
 * 权重学习服务
 * 
 * Phase 3 核心：从用户反馈学习目标函数权重
 * 
 * 学习信号：
 * - 行程满意度评分
 * - 实际疲劳数据
 * - 计划修改频率
 * - 用户偏好变化
 * 
 * 算法：
 * - 梯度下降
 * - 贝叶斯优化
 * - 在线学习（bandit）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ObjectiveFunctionWeights, DEFAULT_OBJECTIVE_WEIGHTS } from '../objective-function.interface';
import { RegretTrackerService } from '../theory/regret-tracker.service';

/**
 * 反馈类型
 */
export type FeedbackType =
  | 'SATISFACTION_RATING'    // 满意度评分 (1-5)
  | 'FATIGUE_REPORT'         // 疲劳报告
  | 'PLAN_MODIFICATION'      // 计划修改
  | 'PREFERENCE_UPDATE'      // 偏好更新
  | 'TRIP_COMPLETION'        // 行程完成
  | 'EARLY_TERMINATION';     // 提前结束

/**
 * 反馈记录
 */
export interface FeedbackRecord {
  /** 反馈 ID */
  id: string;
  
  /** 用户 ID */
  userId: string;
  
  /** 行程 ID */
  tripId: string;
  
  /** 反馈类型 */
  type: FeedbackType;
  
  /** 反馈时间 */
  timestamp: string;
  
  /** 反馈数据 */
  data: {
    // 满意度评分
    overallSatisfaction?: number;     // 1-5
    safetyPerception?: number;        // 1-5
    experienceQuality?: number;       // 1-5
    pacingComfort?: number;           // 1-5
    philosophyMatch?: number;         // 1-5
    
    // 疲劳数据
    actualFatigueLevel?: number;      // 0-2
    predictedFatigueLevel?: number;   // 0-2
    
    // 修改数据
    modificationType?: 'SPLIT_DAY' | 'INSERT_REST' | 'REMOVE_ACTIVITY' | 'REORDER' | 'OTHER';
    modificationReason?: string;
    
    // 行程完成数据
    completionRate?: number;          // 0-1
    daysCompleted?: number;
    totalDays?: number;

    /** 决策时记录的期望效用 [0,1]，与 completionRate 对照 */
    predictedUtility?: number;
    /** 单侧预测 regret 代理 max(0, clamp(pred)−clamp(actual))，[0,1] */
    predictionRegret01?: number;
  };
  
  /** 当时的权重配置 */
  weightsAtTime: ObjectiveFunctionWeights;
  
  /** 当时的效用评估 */
  utilityAtTime: number;
}

/**
 * 学习配置
 */
export interface LearningConfig {
  /** 学习率 */
  learningRate: number;
  
  /** 正则化系数（防止过拟合） */
  regularization: number;
  
  /** 最小样本数（开始学习前需要的样本） */
  minSamples: number;
  
  /** 遗忘因子（旧数据权重衰减） */
  forgettingFactor: number;
  
  /** 权重约束（最小/最大值） */
  weightConstraints: {
    min: number;
    max: number;
  };
  
  /** 是否使用贝叶斯优化 */
  useBayesianOptimization: boolean;
}

/**
 * 默认学习配置
 */
export const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  learningRate: 0.01,
  regularization: 0.001,
  minSamples: 10,
  forgettingFactor: 0.95,
  weightConstraints: { min: 0.02, max: 0.5 },
  useBayesianOptimization: false,
};

/**
 * 权重学习结果
 */
export interface WeightLearningResult {
  /** 更新后的权重 */
  updatedWeights: ObjectiveFunctionWeights;
  
  /** 权重变化 */
  weightChanges: Partial<ObjectiveFunctionWeights>;
  
  /** 学习信号强度 */
  signalStrength: number;
  
  /** 使用的样本数 */
  samplesUsed: number;
  
  /** 预测改进（预计效用提升） */
  expectedImprovement: number;
  
  /** 学习置信度 */
  confidence: number;
  
  /** 详细分析 */
  analysis: {
    /** 每个维度的梯度 */
    gradients: Partial<ObjectiveFunctionWeights>;
    /** 主要影响因素 */
    mainFactors: string[];
    /** 建议 */
    recommendations: string[];
  };
}

/**
 * 用户权重配置
 */
export interface UserWeightProfile {
  /** 用户 ID */
  userId: string;
  
  /** 当前权重 */
  currentWeights: ObjectiveFunctionWeights;
  
  /** 权重历史 */
  weightHistory: Array<{
    timestamp: string;
    weights: ObjectiveFunctionWeights;
    trigger: string;
  }>;
  
  /** 累计反馈数 */
  totalFeedback: number;
  
  /** 学习置信度 */
  learningConfidence: number;
  
  /** 最后更新时间 */
  lastUpdated: string;
}

@Injectable()
export class WeightLearnerService {
  private readonly logger = new Logger(WeightLearnerService.name);

  constructor(
    @Optional() private readonly regretTracker?: RegretTrackerService,
  ) {}

  // 用户权重配置缓存
  private userProfiles: Map<string, UserWeightProfile> = new Map();

  // 反馈历史（内存缓存，生产环境应使用数据库）
  private feedbackHistory: FeedbackRecord[] = [];

  /** 学习轮次（用于 Regret 追踪） */
  private learnRoundCounter = 0;

  /**
   * 从反馈学习权重
   */
  async learnFromFeedback(
    userId: string,
    feedback: FeedbackRecord[],
    config: LearningConfig = DEFAULT_LEARNING_CONFIG
  ): Promise<WeightLearningResult> {
    this.logger.log(`[WeightLearner] 开始学习，用户: ${userId}，反馈数: ${feedback.length}`);

    // 1. 获取用户当前权重
    const profile = this.getOrCreateUserProfile(userId);
    const currentWeights = profile.currentWeights;
    
    // 2. 检查是否有足够样本
    if (feedback.length < config.minSamples) {
      this.logger.debug(`[WeightLearner] 样本不足，需要 ${config.minSamples}，当前 ${feedback.length}`);
      return this.buildNoChangeResult(currentWeights, feedback.length, config.minSamples);
    }
    
    // 3. 计算梯度
    const gradients = this.computeGradients(feedback, currentWeights, config);
    
    // 4. 应用梯度下降
    const updatedWeights = this.applyGradientDescent(currentWeights, gradients, config);
    
    // 5. 计算权重变化
    const weightChanges = this.computeWeightChanges(currentWeights, updatedWeights);
    
    // 6. 更新用户配置
    this.updateUserProfile(userId, updatedWeights, 'gradient_descent');
    
    // 7. 分析结果
    const analysis = this.analyzeResult(gradients, weightChanges, feedback);

    // 专利 4.14.4：Regret 追踪集成
    if (this.regretTracker && feedback.length > 0) {
      this.learnRoundCounter += 1;
      const avgUtility =
        feedback.reduce((s, f) => s + (f.utilityAtTime ?? 0), 0) / feedback.length;
      this.regretTracker.recordUtility(this.learnRoundCounter, avgUtility);
    }

    return {
      updatedWeights,
      weightChanges,
      signalStrength: this.computeSignalStrength(feedback),
      samplesUsed: feedback.length,
      expectedImprovement: this.estimateImprovement(currentWeights, updatedWeights, feedback),
      confidence: this.computeLearningConfidence(feedback, gradients),
      analysis,
    };
  }

  /**
   * 记录反馈
   */
  recordFeedback(feedback: FeedbackRecord): void {
    this.feedbackHistory.push(feedback);
    this.logger.debug(`[WeightLearner] 记录反馈: ${feedback.type} for user ${feedback.userId}`);
  }

  /**
   * 获取用户权重
   */
  getUserWeights(userId: string): ObjectiveFunctionWeights {
    const profile = this.userProfiles.get(userId);
    return profile?.currentWeights ?? { ...DEFAULT_OBJECTIVE_WEIGHTS };
  }

  /**
   * 获取用户反馈历史
   */
  getUserFeedbackHistory(userId: string): FeedbackRecord[] {
    return this.feedbackHistory.filter(f => f.userId === userId);
  }

  // ========== 私有方法 ==========

  /**
   * 获取或创建用户配置
   */
  private getOrCreateUserProfile(userId: string): UserWeightProfile {
    let profile = this.userProfiles.get(userId);
    
    if (!profile) {
      profile = {
        userId,
        currentWeights: { ...DEFAULT_OBJECTIVE_WEIGHTS },
        weightHistory: [],
        totalFeedback: 0,
        learningConfidence: 0.5,
        lastUpdated: new Date().toISOString(),
      };
      this.userProfiles.set(userId, profile);
    }
    
    return profile;
  }

  /**
   * 更新用户配置
   */
  private updateUserProfile(
    userId: string,
    newWeights: ObjectiveFunctionWeights,
    trigger: string
  ): void {
    const profile = this.getOrCreateUserProfile(userId);
    
    profile.weightHistory.push({
      timestamp: new Date().toISOString(),
      weights: { ...profile.currentWeights },
      trigger,
    });
    
    profile.currentWeights = newWeights;
    profile.totalFeedback += 1;
    profile.learningConfidence = Math.min(0.95, profile.learningConfidence + 0.02);
    profile.lastUpdated = new Date().toISOString();
  }

  /**
   * 计算梯度
   * 
   * 梯度 = ∂Loss/∂weight
   * Loss = (predicted_utility - actual_satisfaction)²
   */
  private computeGradients(
    feedback: FeedbackRecord[],
    currentWeights: ObjectiveFunctionWeights,
    config: LearningConfig
  ): Partial<ObjectiveFunctionWeights> {
    const gradients: Partial<ObjectiveFunctionWeights> = {
      safety: 0,
      experienceDensity: 0,
      philosophyAlignment: 0,
      timeSlack: 0,
      fatigueRisk: 0,
      weatherRisk: 0,
      budgetOverrun: 0,
      pacingVariance: 0,
    };

    for (let i = 0; i < feedback.length; i++) {
      const fb = feedback[i];
      const recencyWeight = Math.pow(config.forgettingFactor, feedback.length - 1 - i);
      
      // 从反馈数据推断梯度
      if (fb.data.overallSatisfaction !== undefined) {
        const target = fb.data.overallSatisfaction / 5; // 归一化到 0-1
        const predicted = fb.utilityAtTime;
        const _error = predicted - target;
        
        // 分解误差到各维度
        if (fb.data.safetyPerception !== undefined) {
          const safetyError = (fb.data.safetyPerception / 5) - (fb.weightsAtTime.safety * 2);
          gradients.safety! += recencyWeight * safetyError * config.learningRate;
        }
        
        if (fb.data.experienceQuality !== undefined) {
          const expError = (fb.data.experienceQuality / 5) - (fb.weightsAtTime.experienceDensity * 2);
          gradients.experienceDensity! += recencyWeight * expError * config.learningRate;
        }
        
        if (fb.data.pacingComfort !== undefined) {
          // 舒适度高 → 降低疲劳风险权重
          const pacingSignal = (fb.data.pacingComfort - 3) / 2; // -1 to 1
          gradients.fatigueRisk! -= recencyWeight * pacingSignal * config.learningRate * 0.5;
        }
        
        if (fb.data.philosophyMatch !== undefined) {
          const philError = (fb.data.philosophyMatch / 5) - (fb.weightsAtTime.philosophyAlignment * 2);
          gradients.philosophyAlignment! += recencyWeight * philError * config.learningRate;
        }
      }
      
      // 疲劳报告的特殊处理
      if (fb.type === 'FATIGUE_REPORT' && fb.data.actualFatigueLevel !== undefined) {
        const fatigueMismatch = fb.data.actualFatigueLevel - (fb.data.predictedFatigueLevel ?? 1);
        // 如果实际疲劳高于预测，增加疲劳风险权重
        gradients.fatigueRisk! += recencyWeight * fatigueMismatch * config.learningRate * 0.8;
      }
      
      // 计划修改的处理
      if (fb.type === 'PLAN_MODIFICATION') {
        switch (fb.data.modificationType) {
          case 'SPLIT_DAY':
          case 'INSERT_REST':
            // 用户需要降低强度 → 提高疲劳风险权重
            gradients.fatigueRisk! += recencyWeight * config.learningRate * 0.3;
            gradients.timeSlack! += recencyWeight * config.learningRate * 0.2;
            break;
          case 'REMOVE_ACTIVITY':
            // 用户减少活动 → 可能体验过载
            gradients.experienceDensity! -= recencyWeight * config.learningRate * 0.2;
            break;
        }
      }
      
      // 提前结束的处理
      if (fb.type === 'EARLY_TERMINATION') {
        // 严重信号：大幅调整
        gradients.safety! += recencyWeight * config.learningRate * 0.5;
        gradients.fatigueRisk! += recencyWeight * config.learningRate * 0.5;
      }
    }

    // 应用正则化
    for (const key of Object.keys(gradients) as (keyof ObjectiveFunctionWeights)[]) {
      gradients[key]! -= config.regularization * (currentWeights[key] - DEFAULT_OBJECTIVE_WEIGHTS[key]);
    }

    return gradients;
  }

  /**
   * 应用梯度下降
   */
  private applyGradientDescent(
    currentWeights: ObjectiveFunctionWeights,
    gradients: Partial<ObjectiveFunctionWeights>,
    config: LearningConfig
  ): ObjectiveFunctionWeights {
    const newWeights = { ...currentWeights };
    
    for (const key of Object.keys(gradients) as (keyof ObjectiveFunctionWeights)[]) {
      const gradient = gradients[key] ?? 0;
      newWeights[key] = currentWeights[key] + gradient;
      
      // 应用约束
      newWeights[key] = Math.max(config.weightConstraints.min, newWeights[key]);
      newWeights[key] = Math.min(config.weightConstraints.max, newWeights[key]);
    }
    
    // 归一化
    const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(newWeights) as (keyof ObjectiveFunctionWeights)[]) {
      newWeights[key] /= sum;
    }
    
    return newWeights;
  }

  /**
   * 计算权重变化
   */
  private computeWeightChanges(
    before: ObjectiveFunctionWeights,
    after: ObjectiveFunctionWeights
  ): Partial<ObjectiveFunctionWeights> {
    const changes: Partial<ObjectiveFunctionWeights> = {};
    
    for (const key of Object.keys(before) as (keyof ObjectiveFunctionWeights)[]) {
      const diff = after[key] - before[key];
      if (Math.abs(diff) > 0.001) {
        changes[key] = diff;
      }
    }
    
    return changes;
  }

  /**
   * 构建无变化结果
   */
  private buildNoChangeResult(
    currentWeights: ObjectiveFunctionWeights,
    sampleCount: number,
    minRequired: number
  ): WeightLearningResult {
    return {
      updatedWeights: currentWeights,
      weightChanges: {},
      signalStrength: 0,
      samplesUsed: sampleCount,
      expectedImprovement: 0,
      confidence: 0.3,
      analysis: {
        gradients: {},
        mainFactors: [],
        recommendations: [`需要至少 ${minRequired} 个反馈样本才能开始学习`],
      },
    };
  }

  /**
   * 计算信号强度
   */
  private computeSignalStrength(feedback: FeedbackRecord[]): number {
    if (feedback.length === 0) return 0;
    
    let strength = 0;
    
    for (const fb of feedback) {
      // 满意度评分是最强信号
      if (fb.data.overallSatisfaction !== undefined) {
        strength += 0.3;
      }
      // 疲劳报告是中等信号
      if (fb.type === 'FATIGUE_REPORT') {
        strength += 0.2;
      }
      // 计划修改是明确的行为信号
      if (fb.type === 'PLAN_MODIFICATION') {
        strength += 0.25;
      }
      // 提前结束是强烈信号
      if (fb.type === 'EARLY_TERMINATION') {
        strength += 0.5;
      }
    }
    
    return Math.min(1, strength / feedback.length);
  }

  /**
   * 估算改进
   */
  private estimateImprovement(
    before: ObjectiveFunctionWeights,
    after: ObjectiveFunctionWeights,
    _feedback: FeedbackRecord[]
  ): number {
    // 简化：基于权重变化幅度估算
    let totalChange = 0;
    for (const key of Object.keys(before) as (keyof ObjectiveFunctionWeights)[]) {
      totalChange += Math.abs(after[key] - before[key]);
    }
    
    // 假设变化越大，改进潜力越大（有上限）
    return Math.min(0.2, totalChange * 0.5);
  }

  /**
   * 计算学习置信度
   */
  private computeLearningConfidence(
    feedback: FeedbackRecord[],
    gradients: Partial<ObjectiveFunctionWeights>
  ): number {
    // 样本数影响
    const sampleFactor = Math.min(1, feedback.length / 50);
    
    // 梯度一致性影响
    const gradientValues = Object.values(gradients).filter(g => g !== undefined) as number[];
    const gradientMean = gradientValues.reduce((a, b) => a + b, 0) / gradientValues.length;
    const gradientVariance = gradientValues.reduce((sum, g) => sum + Math.pow(g - gradientMean, 2), 0) / gradientValues.length;
    const consistencyFactor = 1 / (1 + Math.sqrt(gradientVariance) * 10);
    
    return 0.3 + sampleFactor * 0.4 + consistencyFactor * 0.3;
  }

  /**
   * 分析结果
   */
  private analyzeResult(
    gradients: Partial<ObjectiveFunctionWeights>,
    weightChanges: Partial<ObjectiveFunctionWeights>,
    _feedback: FeedbackRecord[]
  ): WeightLearningResult['analysis'] {
    const mainFactors: string[] = [];
    const recommendations: string[] = [];
    
    // 识别主要因素
    const sortedChanges = Object.entries(weightChanges)
      .filter(([_, v]) => v !== undefined)
      .sort(([_, a], [__, b]) => Math.abs(b as number) - Math.abs(a as number));
    
    for (const [key, change] of sortedChanges.slice(0, 3)) {
      const direction = (change as number) > 0 ? '增加' : '减少';
      const dimensionName = {
        safety: '安全性',
        experienceDensity: '体验密度',
        philosophyAlignment: '哲学匹配',
        timeSlack: '时间余量',
        fatigueRisk: '疲劳风险',
        weatherRisk: '天气风险',
        budgetOverrun: '预算超支',
        pacingVariance: '节奏方差',
      }[key] || key;
      
      mainFactors.push(`${dimensionName}权重${direction} ${(Math.abs(change as number) * 100).toFixed(1)}%`);
    }
    
    // 生成建议
    if (weightChanges.fatigueRisk && weightChanges.fatigueRisk > 0.02) {
      recommendations.push('用户可能需要更轻松的行程节奏');
    }
    if (weightChanges.experienceDensity && weightChanges.experienceDensity < -0.02) {
      recommendations.push('用户可能偏好更简洁的行程');
    }
    if (weightChanges.safety && weightChanges.safety > 0.02) {
      recommendations.push('用户更重视安全性');
    }
    
    return {
      gradients,
      mainFactors,
      recommendations,
    };
  }

  /**
   * 导出用户配置（用于持久化）
   */
  exportUserProfile(userId: string): UserWeightProfile | null {
    return this.userProfiles.get(userId) ?? null;
  }

  /**
   * 导入用户配置（从持久化恢复）
   */
  importUserProfile(profile: UserWeightProfile): void {
    this.userProfiles.set(profile.userId, profile);
  }

  /**
   * 获取学习统计
   */
  getLearningStats(): {
    totalUsers: number;
    totalFeedback: number;
    avgConfidence: number;
    topFactors: string[];
  } {
    const profiles = Array.from(this.userProfiles.values());
    
    return {
      totalUsers: profiles.length,
      totalFeedback: this.feedbackHistory.length,
      avgConfidence: profiles.length > 0
        ? profiles.reduce((sum, p) => sum + p.learningConfidence, 0) / profiles.length
        : 0,
      topFactors: ['疲劳风险', '安全性', '体验密度'], // 简化
    };
  }
}
