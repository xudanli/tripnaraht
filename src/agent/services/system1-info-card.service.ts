// src/agent/services/system1-info-card.service.ts

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import {
  System1InfoCard,
  CurrentConditions,
  YourMatch,
  RiskOverview,
  ReliabilityLevel,
  MatchLevel,
  RiskLevel,
  DifficultyLevel,
  CrowdLevel,
  SeasonStatus,
} from '../interfaces/system1-info-card.interface';
import { AgentState } from '../interfaces/agent-state.interface';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
import { PlacesService } from '../../places/places.service';
import { UncertaintyModelingService } from '../../data-modeling/services/uncertainty-modeling.service';

/**
 * System 1 信息卡片服务
 * 
 * 生成结构化信息卡片，只呈现信息，不做推荐
 */
@Injectable()
export class System1InfoCardService {
  private readonly logger = new Logger(System1InfoCardService.name);

  constructor(
    @Optional() private readonly routeDirectionsService?: RouteDirectionsService,
    @Optional() private readonly placesService?: PlacesService,
    @Optional() private readonly uncertaintyModeling?: UncertaintyModelingService,
  ) {}

  /**
   * 生成信息卡片
   */
  async generateInfoCard(
    routeId: string,
    state: AgentState,
  ): Promise<System1InfoCard> {
    this.logger.log(`Generating info card for route ${routeId}`);

    // 获取路线数据
    const routeData = await this.getRouteData(routeId);

    // 获取当前条件
    const currentConditions = await this.getCurrentConditions(routeData, state);

    // 计算用户匹配度（信息，非推荐）
    const yourMatch = await this.calculateYourMatch(routeData, state);

    // 计算风险概览
    const riskOverview = await this.calculateRiskOverview(routeData);

    // 构建信息卡片
    const infoCard: System1InfoCard = {
      routeName: routeData.name || routeData.nameCN || '未知路线',
      distance: routeData.distance || 0,
      elevationGain: routeData.elevationGain || 0,
      estimatedDuration: routeData.estimatedDuration || 0,
      difficultyLevel: this.mapDifficultyLevel(routeData.difficultyLevel),
      currentConditions,
      yourMatch,
      riskOverview,
      summary: '基本信息已呈现，你可以判断是否感兴趣',
      routeId,
      metadata: {
        generatedAt: new Date().toISOString(),
        source: 'system1',
      },
    };

    return infoCard;
  }

  // ========== 私有方法 ==========

  /**
   * 获取路线数据
   */
  private async getRouteData(routeId: string): Promise<any> {
    if (this.routeDirectionsService) {
      try {
        // Try to find by ID (number) or UUID (string)
        const idNum = parseInt(routeId, 10);
        if (!isNaN(idNum)) {
          return await this.routeDirectionsService.findRouteDirectionById(idNum);
        } else {
          return await this.routeDirectionsService.findRouteDirectionByUuid(routeId);
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch route data for ${routeId}:`, error);
      }
    }

    // 返回默认数据
    return {
      name: '未知路线',
      distance: 0,
      elevationGain: 0,
      estimatedDuration: 0,
      difficultyLevel: 'MODERATE',
    };
  }

  /**
   * 获取当前条件
   */
  private async getCurrentConditions(
    routeData: any,
    state: AgentState,
  ): Promise<CurrentConditions> {
    // 获取天气条件（简化实现）
    const weather = await this.getWeatherConditions(routeData);

    // 获取人流情况（简化实现）
    const crowd = await this.getCrowdConditions(routeData);

    // 获取季节状态
    const season = this.getSeasonStatus(routeData);

    // 获取交通情况
    const transportation = await this.getTransportationConditions(routeData);

    return {
      weather,
      crowd,
      season,
      transportation,
    };
  }

  /**
   * 获取天气条件
   */
  private async getWeatherConditions(routeData: any): Promise<CurrentConditions['weather']> {
    // 简化实现：返回默认值
    // 实际应该调用天气API
    return {
      condition: '晴朗',
      temperature: '12-18°C',
      reliability: 'MEDIUM' as ReliabilityLevel,
    };
  }

  /**
   * 获取人流情况
   */
  private async getCrowdConditions(routeData: any): Promise<CurrentConditions['crowd']> {
    // 简化实现：返回默认值
    // 实际应该调用人流数据API
    return {
      level: 'NORMAL' as CrowdLevel,
      reliability: 'MEDIUM' as ReliabilityLevel,
    };
  }

  /**
   * 获取季节状态
   */
  private getSeasonStatus(routeData: any): CurrentConditions['season'] {
    const seasonality = routeData.seasonality || {};
    const bestMonths = seasonality.bestMonths || [];
    const currentMonth = new Date().getMonth() + 1;

    let status: SeasonStatus = 'ACCEPTABLE';
    if (bestMonths.includes(currentMonth)) {
      status = 'BEST';
    } else if (bestMonths.some((m: number) => Math.abs(m - currentMonth) <= 1)) {
      status = 'GOOD';
    } else if (seasonality.avoidMonths?.includes(currentMonth)) {
      status = 'NOT_RECOMMENDED';
    }

    return {
      status,
      reliability: 'HIGH' as ReliabilityLevel,
    };
  }

  /**
   * 获取交通情况
   */
  private async getTransportationConditions(
    routeData: any,
  ): Promise<CurrentConditions['transportation']> {
    // 简化实现：返回默认值
    // 实际应该调用交通API
    return {
      available: true,
      methods: ['自驾', '公共交通'],
      reliability: 'HIGH' as ReliabilityLevel,
    };
  }

  /**
   * 计算用户匹配度（信息，非推荐）
   */
  private async calculateYourMatch(
    routeData: any,
    state: AgentState,
  ): Promise<YourMatch> {
    const userProfile = state.memory?.user_profile || {};

    // 体力要求匹配度
    const fitnessRequirement = this.calculateFitnessMatch(routeData, userProfile);

    // 时间要求匹配度
    const timeRequirement = this.calculateTimeMatch(routeData, state);

    // 难度要求匹配度
    const difficultyRequirement = this.calculateDifficultyMatch(routeData, userProfile);

    // 成本要求匹配度
    const costRequirement = this.calculateCostMatch(routeData, state);

    return {
      fitnessRequirement,
      timeRequirement,
      difficultyRequirement,
      costRequirement,
    };
  }

  /**
   * 计算体力匹配度
   */
  private calculateFitnessMatch(routeData: any, userProfile: any): YourMatch['fitnessRequirement'] {
    const routeFitness = routeData.fitnessRequirement || 5; // 默认中等
    const userFitness = userProfile.fitnessLevel || 5;

    const diff = routeFitness - userFitness;
    let vsYourFitness: MatchLevel;
    let explanation: string;

    if (Math.abs(diff) <= 1) {
      vsYourFitness = 'MATCH';
      explanation = '路线体力要求与你的水平匹配';
    } else if (diff > 0 && diff <= 2) {
      vsYourFitness = 'SLIGHTLY_ABOVE';
      explanation = '路线体力要求略高于你的水平';
    } else if (diff > 2) {
      vsYourFitness = 'ABOVE';
      explanation = '路线体力要求明显高于你的水平';
    } else {
      vsYourFitness = 'BELOW';
      explanation = '路线体力要求低于你的水平';
    }

    return { vsYourFitness, explanation };
  }

  /**
   * 计算时间匹配度
   */
  private calculateTimeMatch(routeData: any, state: AgentState): YourMatch['timeRequirement'] {
    const routeDuration = routeData.estimatedDuration || 0;
    const tripDays = state.trip?.days || 0;
    const availableDays = tripDays || 7; // 默认7天

    let vsYourTime: MatchLevel;
    let explanation: string;

    if (routeDuration <= availableDays * 0.8) {
      vsYourTime = 'SUFFICIENT';
      explanation = `你有足够的时间完成这条路线（需要${routeDuration}天，你有${availableDays}天）`;
    } else if (routeDuration <= availableDays) {
      vsYourTime = 'TIGHT';
      explanation = `时间较紧（需要${routeDuration}天，你有${availableDays}天）`;
    } else {
      vsYourTime = 'INSUFFICIENT';
      explanation = `时间不足（需要${routeDuration}天，你只有${availableDays}天）`;
    }

    return { vsYourTime, explanation };
  }

  /**
   * 计算难度匹配度
   */
  private calculateDifficultyMatch(routeData: any, userProfile: any): YourMatch['difficultyRequirement'] {
    const routeDifficulty = this.mapDifficultyToNumber(routeData.difficultyLevel);
    const userExperience = userProfile.experienceLevel || 5;

    const diff = routeDifficulty - userExperience;
    let vsYourExperience: MatchLevel;
    let explanation: string;

    if (Math.abs(diff) <= 1) {
      vsYourExperience = 'MATCH';
      explanation = '路线难度与你的经验匹配';
    } else if (diff > 0 && diff <= 2) {
      vsYourExperience = 'SLIGHTLY_ABOVE';
      explanation = '路线难度略高于你的经验';
    } else if (diff > 2) {
      vsYourExperience = 'ABOVE';
      explanation = '路线难度明显高于你的经验';
    } else {
      vsYourExperience = 'BELOW';
      explanation = '路线难度低于你的经验';
    }

    return { vsYourExperience, explanation };
  }

  /**
   * 计算成本匹配度
   */
  private calculateCostMatch(routeData: any, state: AgentState): YourMatch['costRequirement'] {
    const routeCost = routeData.estimatedCost || 0;
    // AgentState doesn't have budgetConfig, use default
    const budgetAmount = 10000; // 默认10000

    const ratio = routeCost / budgetAmount;
    let vsYourBudget: MatchLevel;
    let explanation: string;

    if (ratio <= 0.8) {
      vsYourBudget = 'WITHIN';
      explanation = `路线成本在你的预算范围内（预计${routeCost}元，预算${budgetAmount}元）`;
    } else if (ratio <= 1.0) {
      vsYourBudget = 'SLIGHTLY_OVER';
      explanation = `路线成本略超预算（预计${routeCost}元，预算${budgetAmount}元）`;
    } else if (ratio <= 1.2) {
      vsYourBudget = 'OVER';
      explanation = `路线成本超过预算（预计${routeCost}元，预算${budgetAmount}元）`;
    } else {
      vsYourBudget = 'BELOW';
      explanation = `路线成本远低于预算（预计${routeCost}元，预算${budgetAmount}元）`;
    }

    return { vsYourBudget, explanation };
  }

  /**
   * 计算风险概览
   */
  private async calculateRiskOverview(routeData: any): Promise<RiskOverview> {
    const riskProfile = routeData.riskProfile || {};

    return {
      safetyRisk: this.mapRiskLevel(riskProfile.safetyRisk),
      physicalRisk: this.mapRiskLevel(riskProfile.physicalRisk),
      timeRisk: this.mapRiskLevel(riskProfile.timeRisk),
      experienceRisk: this.mapRiskLevel(riskProfile.experienceRisk),
      costRisk: this.mapRiskLevel(riskProfile.costRisk),
    };
  }

  /**
   * 映射难度等级
   */
  private mapDifficultyLevel(level: any): DifficultyLevel {
    if (typeof level === 'string') {
      const upper = level.toUpperCase();
      if (['EASY', 'MODERATE', 'HARD', 'EXTREME'].includes(upper)) {
        return upper as DifficultyLevel;
      }
    }
    return 'MODERATE';
  }

  /**
   * 映射难度到数字
   */
  private mapDifficultyToNumber(level: any): number {
    const mapping: Record<DifficultyLevel, number> = {
      EASY: 3,
      MODERATE: 5,
      HARD: 7,
      EXTREME: 9,
    };
    return mapping[this.mapDifficultyLevel(level)] || 5;
  }

  /**
   * 映射风险等级
   */
  private mapRiskLevel(level: any): RiskLevel {
    if (typeof level === 'string') {
      const upper = level.toUpperCase();
      if (['LOW', 'MEDIUM', 'HIGH'].includes(upper)) {
        return upper as RiskLevel;
      }
    }
    return 'MEDIUM';
  }
}
