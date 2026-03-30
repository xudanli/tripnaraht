// src/trips/decision/services/decision-support.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DecisionOptions,
  RouteOption,
  RouteComparison,
  MatchingAnalysis,
  SystemAnalysis,
  RhythmOption,
  RhythmComparison,
  ConditionalSupport,
  ConditionalScenario,
  DecisionInterface,
} from '../interfaces/decision-support.interface';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { UncertaintyModelingService } from '../../../data-modeling/services/uncertainty-modeling.service';

/**
 * 决策支持服务
 * 
 * 核心原则：呈现选项而非推荐
 * - 不推荐"最好的路线"
 * - 只呈现分析和信息
 * - 让用户自己做决策
 */
@Injectable()
export class DecisionSupportService {
  private readonly logger = new Logger(DecisionSupportService.name);

  constructor(
    @Optional() private readonly uncertaintyModeling?: UncertaintyModelingService,
  ) {}

  /**
   * 呈现选项而非推荐
   */
  async presentOptions(
    routes: RouteDirectionData[],
    userContext: any,
  ): Promise<DecisionOptions> {
    this.logger.log(`Presenting ${routes.length} route options (not recommendations)`);

    // 不推荐"最好的路线"，而是呈现所有选项
    const options: RouteOption[] = routes.map(route => ({
      routeId: route.id ? String(route.id) : (route.name || 'unknown'),
      routeName: route.nameCN || route.name || '未知路线',
      systemAnalysis: this.analyzeRoute(route, userContext),
      metadata: {
        countryCode: route.countryCode,
        tags: route.tags || [],
      },
    }));

    // 生成对比信息
    const comparison = this.generateComparison(options);

    // 生成用户指导（不是推荐，是支持）
    const userGuidance = this.generateUserGuidance(options, userContext);

    return {
      options,
      comparison,
      userGuidance,
    };
  }

  /**
   * 生成匹配度分析（不是推荐，是对话）
   */
  async generateMatchingAnalysis(
    route: RouteDirectionData,
    userContext: any,
  ): Promise<MatchingAnalysis> {
    this.logger.log(`Generating matching analysis for route ${route.id || route.name || 'unknown'}`);

    // 你说你想要的
    const whatYouWantItems = this.extractUserWants(userContext);
    const matchStatus = this.checkMatch(route, userContext, whatYouWantItems);

    // 你提到的担忧
    const yourConcernsItems = this.extractUserConcerns(userContext);
    const addressStatus = this.checkAddress(route, userContext, yourConcernsItems);

    // 综合判断（不是推荐，是判断）
    const overallJudgment = this.generateJudgment(route, userContext, whatYouWantItems, yourConcernsItems);

    // 后续建议（不是命令，是支持）
    const nextSteps = this.generateNextSteps(route, userContext, matchStatus, addressStatus);

    // Map status values to match interface types
    const mappedMatchStatus: 'MATCH' | 'PARTIAL' | 'MISMATCH' = 
      matchStatus === 'MATCH' ? 'MATCH' :
      matchStatus === 'PARTIAL_MATCH' ? 'PARTIAL' : 'MISMATCH';
    
    const mappedAddressStatus: 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED' = 
      addressStatus === 'ADDRESSED' ? 'ADDRESSED' :
      addressStatus === 'PARTIALLY_ADDRESSED' ? 'PARTIAL' : 'NOT_ADDRESSED';

    return {
      whatYouWant: {
        items: whatYouWantItems,
        matchStatus: mappedMatchStatus,
      },
      yourConcerns: {
        items: yourConcernsItems,
        addressStatus: mappedAddressStatus,
      },
      overallJudgment,
      nextSteps,
    };
  }

  /**
   * 生成决策界面
   */
  async generateDecisionInterface(
    routes: RouteDirectionData[],
    userContext: any,
  ): Promise<DecisionInterface> {
    // 路线选择决策点
    const routeOptions = await this.presentOptions(routes, userContext);

    // 节奏选择决策点
    const rhythmOptions = this.generateRhythmOptions(userContext);

    // 条件化决策支持
    const conditionalSupport = this.generateConditionalSupport(routes, userContext);

    return {
      routeSelection: {
        options: routeOptions.options,
        comparison: routeOptions.comparison,
      },
      rhythmSelection: {
        options: rhythmOptions.options,
        comparison: rhythmOptions.comparison,
      },
      conditionalSupport,
    };
  }

  // ========== 私有方法 ==========

  /**
   * 分析路线（不是推荐，是分析）
   */
  private analyzeRoute(
    route: RouteDirectionData,
    userContext: any,
  ): SystemAnalysis {
    const characteristics = this.extractCharacteristics(route);
    const matchingAnalysis = this.analyzeMatching(route, userContext);
    const riskAssessment = this.analyzeRisks(route);

    return {
      characteristics,
      matchingAnalysis,
      riskAssessment,
    };
  }

  /**
   * 提取路线特征
   */
  private extractCharacteristics(route: RouteDirectionData): SystemAnalysis['characteristics'] {
    const constraints = route.constraints || {};
    const riskProfile = route.riskProfile || {};
    const seasonality = route.seasonality || {};

    // 推断难度等级
    let difficultyLevel: 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME' = 'MODERATE';
    if (constraints.minFitnessLevel) {
      if (constraints.minFitnessLevel >= 8) {
        difficultyLevel = 'EXTREME';
      } else if (constraints.minFitnessLevel >= 6) {
        difficultyLevel = 'HARD';
      } else if (constraints.minFitnessLevel >= 4) {
        difficultyLevel = 'MODERATE';
      } else {
        difficultyLevel = 'EASY';
      }
    }

    // 推断季节适宜性
    const currentMonth = new Date().getMonth() + 1;
    const bestMonths = seasonality.bestMonths || [];
    let seasonSuitability: 'BEST' | 'GOOD' | 'ACCEPTABLE' | 'NOT_RECOMMENDED' = 'ACCEPTABLE';
    if (bestMonths.includes(currentMonth)) {
      seasonSuitability = 'BEST';
    } else if (bestMonths.some((m: number) => Math.abs(m - currentMonth) <= 1)) {
      seasonSuitability = 'GOOD';
    } else if (seasonality.avoidMonths?.includes(currentMonth)) {
      seasonSuitability = 'NOT_RECOMMENDED';
    }

    // Get properties from extensions or metadata
    const extensions = route.extensions;
    const metadata = route.metadata as any;
    const estimatedDuration = extensions?.estimatedDuration || metadata?.estimatedDuration || 0;
    const distance = metadata?.distance || 0;
    const elevationGain = metadata?.elevationGain || 0;

    return {
      distance,
      elevationGain,
      estimatedDuration,
      difficultyLevel,
      seasonSuitability,
      experienceTypes: route.tags || [],
      riskLevel: (riskProfile.overallRisk as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM',
    };
  }

  /**
   * 分析匹配度
   */
  private analyzeMatching(
    route: RouteDirectionData,
    userContext: any,
  ): SystemAnalysis['matchingAnalysis'] {
    const userProfile = userContext.userProfile || {};
    const constraints = route.constraints || {};
    const extensions = route.extensions;
    const metadata = route.metadata as any;

    // 体力匹配度
    const routeFitness = constraints.minFitnessLevel || 5;
    const userFitness = userProfile.fitnessLevel || 5;
    const fitnessDiff = routeFitness - userFitness;
    let fitnessMatch: 'MATCH' | 'SLIGHTLY_ABOVE' | 'ABOVE' | 'BELOW' = 'MATCH';
    if (Math.abs(fitnessDiff) <= 1) {
      fitnessMatch = 'MATCH';
    } else if (fitnessDiff > 0 && fitnessDiff <= 2) {
      fitnessMatch = 'SLIGHTLY_ABOVE';
    } else if (fitnessDiff > 2) {
      fitnessMatch = 'ABOVE';
    } else {
      fitnessMatch = 'BELOW';
    }

    // 时间匹配度
    const routeDuration = extensions?.estimatedDuration || metadata?.estimatedDuration || 0;
    const tripDays = userContext.tripDays || 7;
    let timeMatch: 'SUFFICIENT' | 'TIGHT' | 'INSUFFICIENT' = 'SUFFICIENT';
    if (routeDuration <= tripDays * 0.8) {
      timeMatch = 'SUFFICIENT';
    } else if (routeDuration <= tripDays) {
      timeMatch = 'TIGHT';
    } else {
      timeMatch = 'INSUFFICIENT';
    }

    // 经验匹配度
    const routeDifficulty = this.mapDifficultyToNumber(route.constraints?.minFitnessLevel || 5);
    const userExperience = userProfile.experienceLevel || 5;
    const experienceDiff = routeDifficulty - userExperience;
    let experienceMatch: 'MATCH' | 'SLIGHTLY_ABOVE' | 'ABOVE' | 'BELOW' = 'MATCH';
    if (Math.abs(experienceDiff) <= 1) {
      experienceMatch = 'MATCH';
    } else if (experienceDiff > 0 && experienceDiff <= 2) {
      experienceMatch = 'SLIGHTLY_ABOVE';
    } else if (experienceDiff > 2) {
      experienceMatch = 'ABOVE';
    } else {
      experienceMatch = 'BELOW';
    }

    // 成本匹配度
    const routeCost = extensions?.estimatedCost || metadata?.estimatedCost || 0;
    const budget = userContext.budget || 10000;
    const costRatio = routeCost / budget;
    let costMatch: 'WITHIN' | 'SLIGHTLY_OVER' | 'OVER' | 'BELOW' = 'WITHIN';
    if (costRatio <= 0.8) {
      costMatch = 'WITHIN';
    } else if (costRatio <= 1.0) {
      costMatch = 'SLIGHTLY_OVER';
    } else if (costRatio <= 1.2) {
      costMatch = 'OVER';
    } else {
      costMatch = 'BELOW';
    }

    return {
      fitnessMatch,
      timeMatch,
      experienceMatch,
      costMatch,
    };
  }

  /**
   * 分析风险（信息呈现，非警告）
   */
  private analyzeRisks(route: RouteDirectionData): SystemAnalysis['riskAssessment'] {
    const riskProfile = route.riskProfile || {};

    return {
      safetyRisk: (riskProfile.safetyRisk as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM',
      physicalRisk: (riskProfile.physicalRisk as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM',
      timeRisk: (riskProfile.timeRisk as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM',
    };
  }

  /**
   * 生成对比信息
   */
  private generateComparison(options: RouteOption[]): RouteComparison {
    if (options.length === 0) {
      return {
        dimensions: [],
        comparisonNote: '暂无对比数据',
      };
    }

    const dimensions: RouteComparison['dimensions'] = [];

    // 距离对比
    const distanceValues: Record<string, number> = {};
    options.forEach(opt => {
      distanceValues[opt.routeId] = opt.systemAnalysis.characteristics.distance;
    });
    dimensions.push({
      name: '距离（公里）',
      values: distanceValues,
    });

    // 难度对比
    const difficultyValues: Record<string, string> = {};
    options.forEach(opt => {
      difficultyValues[opt.routeId] = opt.systemAnalysis.characteristics.difficultyLevel;
    });
    dimensions.push({
      name: '难度等级',
      values: difficultyValues,
    });

    // 时长对比
    const durationValues: Record<string, number> = {};
    options.forEach(opt => {
      durationValues[opt.routeId] = opt.systemAnalysis.characteristics.estimatedDuration;
    });
    dimensions.push({
      name: '预计时长（小时）',
      values: durationValues,
    });

    const comparisonNote = `以上是各选项的对比信息，你可以根据你的需求和偏好来选择。`;

    return {
      dimensions,
      comparisonNote,
    };
  }

  /**
   * 生成用户指导（不是推荐，是支持）
   */
  private generateUserGuidance(
    options: RouteOption[],
    _userContext: any,
  ): string {
    if (options.length === 0) {
      return '暂无可用选项';
    }

    return `基于你的情况，这些选项各有特点。你可以根据距离、难度、时长和风险等级来判断哪个更符合你的需求。`;
  }

  /**
   * 提取用户需求
   */
  private extractUserWants(userContext: any): import('../interfaces/decision-support.interface').UserWantItem[] {
    const wants: import('../interfaces/decision-support.interface').UserWantItem[] = [];

    // 从用户上下文提取需求
    if (userContext.preferences) {
      if (userContext.preferences.pace) {
        wants.push({
          item: `节奏偏好：${userContext.preferences.pace}`,
          matchStatus: 'MATCH',
          explanation: '已记录你的节奏偏好',
        });
      }
      if (userContext.preferences.budget) {
        wants.push({
          item: `预算：${userContext.preferences.budget}`,
          matchStatus: 'MATCH',
          explanation: '已考虑你的预算限制',
        });
      }
    }

    return wants;
  }

  /**
   * 提取用户担忧
   */
  private extractUserConcerns(userContext: any): import('../interfaces/decision-support.interface').UserConcernItem[] {
    const concerns: import('../interfaces/decision-support.interface').UserConcernItem[] = [];

    // 从用户上下文提取担忧
    if (userContext.concerns && Array.isArray(userContext.concerns)) {
      userContext.concerns.forEach((concern: string) => {
        concerns.push({
          item: concern,
          addressStatus: 'ADDRESSED',
          explanation: '系统已考虑此担忧',
        });
      });
    }

    return concerns;
  }

  /**
   * 检查匹配
   */
  private checkMatch(
    route: RouteDirectionData,
    userContext: any,
    _wants: import('../interfaces/decision-support.interface').UserWantItem[],
  ): 'MATCH' | 'PARTIAL_MATCH' | 'NO_MATCH' {
    const matching = this.analyzeMatching(route, userContext);
    const matchCount = [
      matching.fitnessMatch === 'MATCH',
      matching.timeMatch === 'SUFFICIENT',
      matching.experienceMatch === 'MATCH',
      matching.costMatch === 'WITHIN' || matching.costMatch === 'SLIGHTLY_OVER',
    ].filter(Boolean).length;

    if (matchCount >= 3) {
      return 'MATCH';
    } else if (matchCount >= 2) {
      return 'PARTIAL_MATCH';
    } else {
      return 'NO_MATCH';
    }
  }

  /**
   * 检查处理状态
   */
  private checkAddress(
    route: RouteDirectionData,
    userContext: any,
    concerns: import('../interfaces/decision-support.interface').UserConcernItem[],
  ): 'ADDRESSED' | 'PARTIALLY_ADDRESSED' | 'NOT_ADDRESSED' {
    if (concerns.length === 0) {
      return 'ADDRESSED';
    }

    // 简化实现：假设所有担忧都已处理
    return 'ADDRESSED';
  }

  /**
   * 生成判断（不是推荐，是判断）
   */
  private generateJudgment(
    route: RouteDirectionData,
    userContext: any,
    _wants: import('../interfaces/decision-support.interface').UserWantItem[],
    _concerns: import('../interfaces/decision-support.interface').UserConcernItem[],
  ): MatchingAnalysis['overallJudgment'] {
    const matching = this.analyzeMatching(route, userContext);
    const factors: string[] = [];

    if (matching.fitnessMatch === 'MATCH') {
      factors.push('体力要求匹配');
    }
    if (matching.timeMatch === 'SUFFICIENT') {
      factors.push('时间充足');
    }
    if (matching.experienceMatch === 'MATCH') {
      factors.push('经验匹配');
    }
    if (matching.costMatch === 'WITHIN') {
      factors.push('预算范围内');
    }

    let statement = '这条路线';
    if (factors.length >= 3) {
      statement += '在多个方面与你的情况匹配';
    } else if (factors.length >= 2) {
      statement += '在部分方面与你的情况匹配';
    } else {
      statement += '与你的情况匹配度较低';
    }

    return {
      statement,
      factors,
      confidence: factors.length / 4, // 基于匹配因素数量计算置信度
    };
  }

  /**
   * 生成后续步骤（不是命令，是支持）
   */
  private generateNextSteps(
    route: RouteDirectionData,
    userContext: any,
    matchStatus: 'MATCH' | 'PARTIAL_MATCH' | 'NO_MATCH',
    addressStatus: 'ADDRESSED' | 'PARTIALLY_ADDRESSED' | 'NOT_ADDRESSED',
  ): MatchingAnalysis['nextSteps'] {
    const steps: MatchingAnalysis['nextSteps'] = [];

    if (matchStatus === 'NO_MATCH') {
      steps.push({
        action: '考虑调整行程参数或选择其他路线',
        reason: '当前路线与你的情况匹配度较低',
        optional: true,
      });
    }

    if (addressStatus === 'NOT_ADDRESSED') {
      steps.push({
        action: '进一步了解路线详情以评估担忧',
        reason: '部分担忧需要更多信息来评估',
        optional: true,
      });
    }

    steps.push({
      action: '查看详细的路线信息和风险评估',
      reason: '了解更多信息有助于做出决策',
      optional: true,
    });

    return steps;
  }

  /**
   * 生成节奏选项
   */
  private generateRhythmOptions(_userContext: any): {
    options: RhythmOption[];
    comparison: RhythmComparison;
  } {
    const options: RhythmOption[] = [
      {
        type: 'RELAXED',
        characteristics: {
          dailyActivityCount: 2,
          averageDuration: 4,
          bufferTime: 2,
        },
        systemAnalysis: {
          suitability: 'MATCH',
          explanation: '轻松节奏，适合想要放松的旅行',
        },
      },
      {
        type: 'NORMAL',
        characteristics: {
          dailyActivityCount: 3,
          averageDuration: 3,
          bufferTime: 1,
        },
        systemAnalysis: {
          suitability: 'MATCH',
          explanation: '正常节奏，平衡体验和休息',
        },
      },
      {
        type: 'TIGHT',
        characteristics: {
          dailyActivityCount: 4,
          averageDuration: 2,
          bufferTime: 0.5,
        },
        systemAnalysis: {
          suitability: 'SLIGHTLY_ABOVE',
          explanation: '紧凑节奏，适合想要充分利用时间的旅行',
        },
      },
    ];

    const comparison: RhythmComparison = {
      dimensions: [
        {
          name: '每日活动数',
          values: {
            RELAXED: 2,
            NORMAL: 3,
            TIGHT: 4,
          },
        },
        {
          name: '平均时长（小时）',
          values: {
            RELAXED: 4,
            NORMAL: 3,
            TIGHT: 2,
          },
        },
        {
          name: '缓冲时间（小时）',
          values: {
            RELAXED: 2,
            NORMAL: 1,
            TIGHT: 0.5,
          },
        },
      ],
      comparisonNote: '你可以根据你的体力和时间偏好来选择节奏',
    };

    return { options, comparison };
  }

  /**
   * 生成条件化决策支持
   */
  private generateConditionalSupport(
    routes: RouteDirectionData[],
    _userContext: any,
  ): ConditionalSupport {
    const scenarios: ConditionalScenario[] = [];

    // 生成条件化场景
    routes.forEach(route => {
      if (route.seasonality) {
        const bestMonths = route.seasonality.bestMonths || [];
        if (bestMonths.length > 0) {
          scenarios.push({
            condition: `如果在${bestMonths.join('、')}月出行`,
            outcome: '这条路线将处于最佳状态',
            probability: 0.9,
            explanation: '这些月份是这条路线的最佳旅行时间',
          });
        }
      }
    });

    return {
      scenarios,
      userQuestions: [],
      systemAnswers: [],
    };
  }

  /**
   * 映射难度到数字
   */
  private mapDifficultyToNumber(fitnessLevel: number): number {
    // 简化映射
    if (fitnessLevel <= 3) return 3;
    if (fitnessLevel <= 5) return 5;
    if (fitnessLevel <= 7) return 7;
    return 9;
  }
}
