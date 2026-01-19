// src/itinerary-optimization/services/enhanced-rest-time.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  RestTimeRecommendation,
  RestTimeModelConfig,
  UserFatigueState,
} from '../interfaces/executability-enhancement.interface';

/**
 * 增强的休息时间模型服务
 * 
 * 根据用户体力状态、活动强度等因素推荐休息时间
 */
@Injectable()
export class EnhancedRestTimeService {
  private readonly logger = new Logger(EnhancedRestTimeService.name);

  // 默认配置
  private readonly defaultConfig: Required<RestTimeModelConfig> = {
    baseRestTime: 15,
    shortBreakTime: 10,
    mealBreakTime: 60,
    longRestTime: 120,
    hpRecoveryRate: 0.5,        // 每分钟恢复0.5 HP
    fatigueReductionRate: 0.3,  // 每分钟减少0.3疲劳度
  };

  /**
   * 推荐休息时间
   */
  async recommendRestTime(
    fatigueState: UserFatigueState,
    config?: Partial<RestTimeModelConfig>
  ): Promise<RestTimeRecommendation> {
    // 合并配置
    const fullConfig: RestTimeModelConfig = {
      ...this.defaultConfig,
      ...config,
    };

    // 确定当前疲劳等级
    const currentFatigueLevel = this.determineFatigueLevel(fatigueState);

    // 确定休息类型
    const restType = this.determineRestType(
      fatigueState,
      currentFatigueLevel,
      fullConfig
    );

    // 计算推荐休息时间
    const { recommendedRestTime, minimumRestTime, optimalRestTime } =
      this.calculateRestTime(fatigueState, restType, fullConfig);

    // 计算体力恢复和疲劳减少
    const hpRecovery = Math.min(
      fatigueState.maxHP - fatigueState.currentHP,
      recommendedRestTime * fullConfig.hpRecoveryRate
    );
    const fatigueReduction = Math.min(
      fatigueState.accumulatedFatigue,
      recommendedRestTime * fullConfig.fatigueReductionRate
    );

    // 计算置信度
    const confidence = this.calculateConfidence(fatigueState, fullConfig);

    // 生成建议
    const recommendations = this.generateRecommendations(
      fatigueState,
      currentFatigueLevel,
      restType,
      recommendedRestTime,
      hpRecovery
    );

    return {
      recommendedRestTime,
      minimumRestTime,
      optimalRestTime,
      hpRecovery,
      fatigueReduction,
      confidence,
      factors: {
        currentFatigueLevel,
        timeSinceLastRest: fatigueState.timeSinceLastRest,
        activityIntensity: fatigueState.activityIntensity,
        userFitnessLevel: fatigueState.userProfile?.fitnessLevel,
      },
      restType,
      recommendations,
    };
  }

  /**
   * 确定疲劳等级
   */
  private determineFatigueLevel(fatigueState: UserFatigueState): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const hpPercentage = fatigueState.currentHP / fatigueState.maxHP;
    const fatiguePercentage = fatigueState.accumulatedFatigue / 100;

    // 临界状态：HP低于20%或疲劳度高于80%
    if (hpPercentage < 0.2 || fatiguePercentage > 0.8) {
      return 'CRITICAL';
    }

    // 高疲劳：HP低于40%或疲劳度高于60%
    if (hpPercentage < 0.4 || fatiguePercentage > 0.6) {
      return 'HIGH';
    }

    // 中等疲劳：HP低于60%或疲劳度高于40%
    if (hpPercentage < 0.6 || fatiguePercentage > 0.4) {
      return 'MEDIUM';
    }

    // 低疲劳
    return 'LOW';
  }

  /**
   * 确定休息类型
   */
  private determineRestType(
    fatigueState: UserFatigueState,
    fatigueLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    config: RestTimeModelConfig
  ): 'SHORT_BREAK' | 'MEAL_BREAK' | 'LONG_REST' | 'OVERNIGHT' {
    // 如果距离上次休息超过4小时，建议用餐休息
    if (fatigueState.timeSinceLastRest > 240) {
      return 'MEAL_BREAK';
    }

    // 如果疲劳等级为临界，建议长休息
    if (fatigueLevel === 'CRITICAL') {
      return 'LONG_REST';
    }

    // 如果疲劳等级为高，建议用餐休息或长休息
    if (fatigueLevel === 'HIGH') {
      return fatigueState.timeSinceLastRest > 180 ? 'MEAL_BREAK' : 'LONG_REST';
    }

    // 如果距离上次休息超过2小时，建议用餐休息
    if (fatigueState.timeSinceLastRest > 120) {
      return 'MEAL_BREAK';
    }

    // 其他情况：短休息
    return 'SHORT_BREAK';
  }

  /**
   * 计算休息时间
   */
  private calculateRestTime(
    fatigueState: UserFatigueState,
    restType: 'SHORT_BREAK' | 'MEAL_BREAK' | 'LONG_REST' | 'OVERNIGHT',
    config: RestTimeModelConfig
  ): {
    recommendedRestTime: number;
    minimumRestTime: number;
    optimalRestTime: number;
  } {
    let baseTime: number;
    let minimumTime: number;
    let optimalTime: number;

    switch (restType) {
      case 'SHORT_BREAK':
        baseTime = config.shortBreakTime!;
        minimumTime = Math.max(5, baseTime * 0.5);
        optimalTime = baseTime * 1.2;
        break;
      case 'MEAL_BREAK':
        baseTime = config.mealBreakTime!;
        minimumTime = Math.max(30, baseTime * 0.7);
        optimalTime = baseTime * 1.3;
        break;
      case 'LONG_REST':
        baseTime = config.longRestTime!;
        minimumTime = Math.max(60, baseTime * 0.8);
        optimalTime = baseTime * 1.5;
        break;
      case 'OVERNIGHT':
        baseTime = 480; // 8小时
        minimumTime = 360; // 6小时
        optimalTime = 600; // 10小时
        break;
    }

    // 根据用户体力状态调整
    const hpPercentage = fatigueState.currentHP / fatigueState.maxHP;
    const fatiguePercentage = fatigueState.accumulatedFatigue / 100;

    // 如果HP很低或疲劳度很高，增加休息时间
    if (hpPercentage < 0.3 || fatiguePercentage > 0.7) {
      baseTime *= 1.3;
      optimalTime *= 1.2;
    }

    // 根据用户健康水平调整
    if (fatigueState.userProfile?.fitnessLevel === 'LOW') {
      baseTime *= 1.2;
      optimalTime *= 1.1;
    } else if (fatigueState.userProfile?.fitnessLevel === 'HIGH') {
      baseTime *= 0.9;
      optimalTime *= 0.95;
    }

    // 根据活动强度调整
    if (fatigueState.activityIntensity === 'HIGH') {
      baseTime *= 1.2;
      optimalTime *= 1.1;
    } else if (fatigueState.activityIntensity === 'LOW') {
      baseTime *= 0.9;
      optimalTime *= 0.95;
    }

    return {
      recommendedRestTime: Math.round(baseTime),
      minimumRestTime: Math.round(minimumTime),
      optimalRestTime: Math.round(optimalTime),
    };
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    fatigueState: UserFatigueState,
    config: RestTimeModelConfig
  ): number {
    let confidence = 0.7; // 基础置信度

    // 如果有用户健康信息，置信度提高
    if (fatigueState.userProfile?.fitnessLevel) {
      confidence += 0.1;
    }

    // 如果有年龄信息，置信度提高
    if (fatigueState.userProfile?.age) {
      confidence += 0.1;
    }

    return Math.min(1.0, confidence);
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    fatigueState: UserFatigueState,
    fatigueLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    restType: 'SHORT_BREAK' | 'MEAL_BREAK' | 'LONG_REST' | 'OVERNIGHT',
    recommendedRestTime: number,
    hpRecovery: number
  ): string[] {
    const recommendations: string[] = [];

    if (fatigueLevel === 'CRITICAL') {
      recommendations.push('⚠️ 疲劳等级为临界，强烈建议立即休息');
    } else if (fatigueLevel === 'HIGH') {
      recommendations.push('疲劳等级较高，建议充分休息');
    }

    if (restType === 'MEAL_BREAK') {
      recommendations.push('建议用餐休息，补充能量');
    } else if (restType === 'LONG_REST') {
      recommendations.push('建议长休息，充分恢复体力');
    }

    recommendations.push(`建议休息 ${recommendedRestTime} 分钟，预计恢复 ${hpRecovery.toFixed(1)} HP`);

    if (fatigueState.timeSinceLastRest > 180) {
      recommendations.push('距离上次休息时间较长，建议适当延长休息时间');
    }

    return recommendations;
  }
}
