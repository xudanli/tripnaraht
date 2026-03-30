// src/route-directions/services/enhanced-risk-assessment.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  CostRiskAssessment,
  CostRiskFactors,
  ExperienceRiskAssessment,
  ExperienceRiskFactors,
  RiskMitigationMatrix,
  RiskMitigationMeasure,
  RiskMitigationStrategy,
  ComprehensiveRiskAssessment,
  RiskCategory,
  RiskLevel,
} from '../interfaces/enhanced-risk-assessment.interface';
import { RouteDirectionData } from '../interfaces/route-direction.interface';

/**
 * 增强的风险评估服务
 * 
 * 实现P2要求的：
 * - 成本风险评估
 * - 体验风险评估
 * - 风险应对策略矩阵
 */
@Injectable()
export class EnhancedRiskAssessmentService {
  private readonly logger = new Logger(EnhancedRiskAssessmentService.name);

  /**
   * 评估成本风险
   */
  async assessCostRisk(
    route: RouteDirectionData,
    context?: {
      budget?: number;
      travelDate?: string;
      currency?: string;
      travelerCount?: number;
    },
  ): Promise<CostRiskAssessment> {
    const factors: CostRiskFactors = {};

    // 1. 预算超支风险
    factors.budgetOverrun = this.assessBudgetOverrunRisk(route, context);

    // 2. 临时取消风险
    factors.cancellationRisk = this.assessCancellationRisk(route, context);

    // 3. 汇率波动风险
    if (context?.currency && context.currency !== 'CNY') {
      factors.exchangeRateRisk = this.assessExchangeRateRisk(route, context);
    }

    // 4. 隐性成本风险
    factors.hiddenCosts = this.assessHiddenCosts(route, context);

    // 5. 旺季溢价风险
    factors.peakSeasonSurcharge = this.assessPeakSeasonSurcharge(route, context);

    // 计算总体风险等级和评分
    const overallScore = this.calculateCostRiskScore(factors);
    const overallLevel = this.scoreToRiskLevel(overallScore);

    // 生成摘要和建议
    const summary = this.generateCostRiskSummary(factors, overallLevel);
    const recommendations = this.generateCostRiskRecommendations(factors, overallLevel);

    // 估算成本范围
    const estimatedCostRange = this.estimateCostRange(route, factors, context);

    return {
      overallLevel,
      overallScore,
      factors,
      summary,
      recommendations,
      estimatedCostRange,
    };
  }

  /**
   * 评估体验风险
   */
  async assessExperienceRisk(
    route: RouteDirectionData,
    context?: {
      travelDate?: string;
      travelerPreferences?: string[];
    },
  ): Promise<ExperienceRiskAssessment> {
    const factors: ExperienceRiskFactors = {};

    // 1. 人流拥挤风险
    factors.crowdingRisk = this.assessCrowdingRisk(route, context);

    // 2. 维护关闭风险
    factors.maintenanceClosure = this.assessMaintenanceClosureRisk(route, context);

    // 3. 预期偏差风险
    factors.expectationGap = this.assessExpectationGapRisk(route, context);

    // 4. 季节性体验风险
    factors.seasonalExperienceRisk = this.assessSeasonalExperienceRisk(route, context);

    // 5. 天气影响体验风险
    factors.weatherImpactRisk = this.assessWeatherImpactRisk(route, context);

    // 计算总体风险等级和评分
    const overallScore = this.calculateExperienceRiskScore(factors);
    const overallLevel = this.scoreToRiskLevel(overallScore);

    // 生成摘要和建议
    const summary = this.generateExperienceRiskSummary(factors, overallLevel);
    const recommendations = this.generateExperienceRiskRecommendations(factors, overallLevel);

    // 评估预期体验质量
    const expectedExperienceQuality = this.assessExpectedExperienceQuality(factors, overallScore);

    return {
      overallLevel,
      overallScore,
      factors,
      summary,
      recommendations,
      expectedExperienceQuality,
    };
  }

  /**
   * 生成风险应对策略矩阵
   */
  generateMitigationMatrix(
    riskCategory: RiskCategory,
    riskLevel: RiskLevel,
    riskDetails: any,
  ): RiskMitigationMatrix {
    const recommendedStrategies = this.selectMitigationStrategies(riskCategory, riskLevel);
    const measures = this.generateMitigationMeasures(riskCategory, riskLevel, riskDetails);
    const priority = this.determinePriority(riskCategory, riskLevel);

    return {
      riskCategory,
      riskLevel,
      recommendedStrategies,
      measures,
      priority,
    };
  }

  /**
   * 综合风险评估
   */
  async assessComprehensiveRisk(
    route: RouteDirectionData,
    context?: {
      budget?: number;
      travelDate?: string;
      currency?: string;
      travelerCount?: number;
      travelerPreferences?: string[];
    },
  ): Promise<ComprehensiveRiskAssessment> {
    // 评估各类风险
    const costRisk = await this.assessCostRisk(route, context);
    const experienceRisk = await this.assessExperienceRisk(route, context);

    // 安全风险和体力风险（简化实现，实际应从现有服务获取）
    const safety = this.assessSafetyRisk(route);
    const physical = this.assessPhysicalRisk(route);
    const time = this.assessTimeRisk(route);

    // 生成应对策略矩阵
    const mitigationMatrix: RiskMitigationMatrix[] = [
      this.generateMitigationMatrix('SAFETY', safety.level, safety.details),
      this.generateMitigationMatrix('PHYSICAL', physical.level, physical.details),
      this.generateMitigationMatrix('TIME', time.level, time.details),
      this.generateMitigationMatrix('EXPERIENCE', experienceRisk.overallLevel, experienceRisk.factors),
      this.generateMitigationMatrix('COST', costRisk.overallLevel, costRisk.factors),
    ];

    // 计算总体风险
    const overallScore = this.calculateOverallRiskScore({
      safety: safety.score,
      physical: physical.score,
      time: time.score,
      experience: experienceRisk.overallScore,
      cost: costRisk.overallScore,
    });
    const overallLevel = this.scoreToRiskLevel(overallScore);

    // 生成格式化摘要
    const formattedSummary = this.formatRiskSummary({
      safety,
      physical,
      time,
      experience: experienceRisk,
      cost: costRisk,
      overallLevel,
    });

    return {
      safety,
      physical,
      time,
      experience: experienceRisk,
      cost: costRisk,
      overallLevel,
      overallScore,
      mitigationMatrix,
      formattedSummary,
    };
  }

  // ========== 成本风险评估辅助方法 ==========

  /**
   * 评估预算超支风险
   */
  private assessBudgetOverrunRisk(
    route: RouteDirectionData,
    context?: { budget?: number; travelerCount?: number },
  ): CostRiskFactors['budgetOverrun'] {
    const estimatedCost = this.estimateRouteCost(route, context);
    const budget = context?.budget || 0;

    if (budget === 0) {
      return {
        probability: 0.5, // 无预算信息时，中等概率
        estimatedOverrun: estimatedCost * 0.2, // 假设可能超支20%
        reasons: ['缺少预算信息，无法准确评估'],
      };
    }

    const overrunAmount = Math.max(0, estimatedCost - budget);
    const probability = overrunAmount > 0 ? Math.min(1.0, overrunAmount / budget) : 0.3;

    const reasons: string[] = [];
    if (overrunAmount > 0) {
      reasons.push(`预计成本 ${estimatedCost} 超过预算 ${budget}`);
    }
    if (route.metadata?.estimatedCost && route.metadata.estimatedCost > budget) {
      reasons.push('路线预估成本超过预算');
    }

    return {
      probability,
      estimatedOverrun: overrunAmount,
      reasons: reasons.length > 0 ? reasons : ['预算充足'],
    };
  }

  /**
   * 评估临时取消风险
   */
  private assessCancellationRisk(
    route: RouteDirectionData,
    _context?: { travelDate?: string },
  ): CostRiskFactors['cancellationRisk'] {
    // 基于路线类型和约束评估取消风险
    const constraints = route.constraints || {};
    const requiresPermit = constraints.requiresPermit;
    const weatherWindow = route.riskProfile?.weatherWindow;

    let probability = 0.1; // 基础概率
    const reasons: string[] = [];

    if (weatherWindow) {
      probability = 0.3;
      reasons.push('路线受天气窗口限制');
    }

    if (requiresPermit) {
      probability += 0.2;
      reasons.push('需要许可证，可能因申请失败而取消');
    }

    // 简化实现：假设取消费用为预估成本的10-30%
    const estimatedCost = this.estimateRouteCost(route);
    const cancellationFee = estimatedCost * (0.1 + probability * 0.2);

    return {
      probability: Math.min(1.0, probability),
      cancellationFee,
      refundable: probability < 0.5,
      reasons: reasons.length > 0 ? reasons : ['取消风险较低'],
    };
  }

  /**
   * 评估汇率波动风险
   */
  private assessExchangeRateRisk(
    route: RouteDirectionData,
    context?: { currency?: string },
  ): CostRiskFactors['exchangeRateRisk'] {
    const currency = context?.currency || 'USD';
    const estimatedCost = this.estimateRouteCost(route);

    // 简化实现：基于货币类型评估波动性
    const volatilityMap: Record<string, 'LOW' | 'MEDIUM' | 'HIGH'> = {
      USD: 'MEDIUM',
      EUR: 'MEDIUM',
      GBP: 'HIGH',
      JPY: 'MEDIUM',
      CNY: 'LOW',
    };

    const volatility = volatilityMap[currency] || 'MEDIUM';
    const probability = volatility === 'HIGH' ? 0.4 : volatility === 'MEDIUM' ? 0.2 : 0.1;
    const estimatedImpact = estimatedCost * probability * 0.1; // 假设波动影响10%

    return {
      probability,
      estimatedImpact,
      currency,
      volatility,
    };
  }

  /**
   * 评估隐性成本
   */
  private assessHiddenCosts(
    route: RouteDirectionData,
    context?: { travelerCount?: number },
  ): CostRiskFactors['hiddenCosts'] {
    const items: NonNullable<CostRiskFactors['hiddenCosts']>['items'] = [];
    const travelerCount = context?.travelerCount || 1;

    // 停车费
    if (route.tags?.includes('自驾') || route.tags?.includes('driving')) {
      items.push({
        type: 'PARKING',
        description: '景点停车费',
        estimatedCost: 50 * travelerCount,
        probability: 0.8,
      });
    }

    // 门票费（如果未包含在预估成本中）
    const signaturePois = route.signaturePois || {};
    const poiCount = signaturePois.types?.length || 0;
    if (poiCount > 0) {
      items.push({
        type: 'ENTRANCE_FEE',
        description: '部分景点可能需要额外门票',
        estimatedCost: 100 * poiCount * travelerCount,
        probability: 0.6,
      });
    }

    // 装备租赁（如果是户外活动）
    if (route.tags?.includes('徒步') || route.tags?.includes('hiking')) {
      items.push({
        type: 'EQUIPMENT_RENTAL',
        description: '可能需要租赁装备',
        estimatedCost: 200 * travelerCount,
        probability: 0.4,
      });
    }

    const totalEstimated = items.reduce(
      (sum: number, item: { estimatedCost: number; probability: number }) => sum + item.estimatedCost * item.probability,
      0,
    );

    return {
      items,
      totalEstimated,
    };
  }

  /**
   * 评估旺季溢价
   */
  private assessPeakSeasonSurcharge(
    route: RouteDirectionData,
    context?: { travelDate?: string },
  ): CostRiskFactors['peakSeasonSurcharge'] {
    const seasonality = route.seasonality;
    const travelDate = context?.travelDate;

    if (!travelDate || !seasonality?.bestMonths) {
      return {
        isPeakSeason: false,
        surchargePercentage: 0,
        estimatedAdditionalCost: 0,
      };
    }

    const travelMonth = new Date(travelDate).getMonth() + 1;
    const isPeakSeason = seasonality.bestMonths.includes(travelMonth);

    if (isPeakSeason) {
      const surchargePercentage = 20; // 假设旺季溢价20%
      const baseCost = this.estimateRouteCost(route);
      const estimatedAdditionalCost = baseCost * (surchargePercentage / 100);

      return {
        isPeakSeason: true,
        surchargePercentage,
        estimatedAdditionalCost,
      };
    }

    return {
      isPeakSeason: false,
      surchargePercentage: 0,
      estimatedAdditionalCost: 0,
    };
  }

  /**
   * 计算成本风险评分
   */
  private calculateCostRiskScore(factors: CostRiskFactors): number {
    let score = 0;
    let weights = 0;

    if (factors.budgetOverrun) {
      score += factors.budgetOverrun.probability * 0.3;
      weights += 0.3;
    }

    if (factors.cancellationRisk) {
      score += factors.cancellationRisk.probability * 0.2;
      weights += 0.2;
    }

    if (factors.exchangeRateRisk) {
      const volatilityWeight = factors.exchangeRateRisk.volatility === 'HIGH' ? 0.3 : factors.exchangeRateRisk.volatility === 'MEDIUM' ? 0.2 : 0.1;
      score += factors.exchangeRateRisk.probability * volatilityWeight;
      weights += volatilityWeight;
    }

    if (factors.hiddenCosts && factors.hiddenCosts.totalEstimated > 0) {
      const baseCost = 10000; // 假设基础成本
      const hiddenCostRatio = Math.min(1.0, factors.hiddenCosts.totalEstimated / baseCost);
      score += hiddenCostRatio * 0.2;
      weights += 0.2;
    }

    if (factors.peakSeasonSurcharge?.isPeakSeason) {
      score += (factors.peakSeasonSurcharge.surchargePercentage / 100) * 0.1;
      weights += 0.1;
    }

    return weights > 0 ? score / weights : 0.5;
  }

  /**
   * 生成成本风险摘要
   */
  private generateCostRiskSummary(factors: CostRiskFactors, level: RiskLevel): string {
    const parts: string[] = [];

    if (factors.budgetOverrun && factors.budgetOverrun.probability > 0.5) {
      parts.push(`预算超支风险较高（概率${Math.round(factors.budgetOverrun.probability * 100)}%）`);
    }

    if (factors.cancellationRisk && factors.cancellationRisk.probability > 0.3) {
      parts.push(`存在取消风险（概率${Math.round(factors.cancellationRisk.probability * 100)}%）`);
    }

    if (factors.hiddenCosts && factors.hiddenCosts.totalEstimated > 0) {
      parts.push(`存在隐性成本（约${Math.round(factors.hiddenCosts.totalEstimated)}元）`);
    }

    if (parts.length === 0) {
      return `成本风险${level === 'LOW' ? '较低' : level === 'MEDIUM' ? '中等' : '较高'}`;
    }

    return parts.join('；');
  }

  /**
   * 生成成本风险建议
   */
  private generateCostRiskRecommendations(factors: CostRiskFactors, _level: RiskLevel): string[] {
    const recommendations: string[] = [];

    if (factors.budgetOverrun && factors.budgetOverrun.probability > 0.5) {
      recommendations.push('建议增加预算缓冲（10-20%）');
      recommendations.push('考虑选择成本较低的替代方案');
    }

    if (factors.cancellationRisk && factors.cancellationRisk.probability > 0.3) {
      recommendations.push('建议购买可退改的机票和住宿');
      recommendations.push('提前了解取消政策');
    }

    if (factors.hiddenCosts && factors.hiddenCosts.totalEstimated > 0) {
      recommendations.push('提前了解可能的额外费用（停车、门票、装备等）');
    }

    if (factors.peakSeasonSurcharge?.isPeakSeason) {
      recommendations.push('考虑错峰出行以节省成本');
    }

    if (recommendations.length === 0) {
      recommendations.push('成本风险可控，按计划执行即可');
    }

    return recommendations;
  }

  /**
   * 估算成本范围
   */
  private estimateCostRange(
    route: RouteDirectionData,
    factors: CostRiskFactors,
    context?: { budget?: number; travelerCount?: number },
  ): { min: number; max: number; base: number } {
    const base = this.estimateRouteCost(route, context ? { travelerCount: context.travelerCount } : undefined);
    const min = base;
    let max = base;

    // 考虑各种风险因素
    if (factors.budgetOverrun) {
      max += factors.budgetOverrun.estimatedOverrun;
    }

    if (factors.hiddenCosts) {
      max += factors.hiddenCosts.totalEstimated;
    }

    if (factors.peakSeasonSurcharge?.isPeakSeason) {
      max += factors.peakSeasonSurcharge.estimatedAdditionalCost;
    }

    if (factors.exchangeRateRisk) {
      max += factors.exchangeRateRisk.estimatedImpact;
    }

    return { min, max, base };
  }

  // ========== 体验风险评估辅助方法 ==========

  /**
   * 评估人流拥挤风险
   */
  private assessCrowdingRisk(
    route: RouteDirectionData,
    context?: { travelDate?: string },
  ): ExperienceRiskFactors['crowdingRisk'] {
    const seasonality = route.seasonality;
    const travelDate = context?.travelDate;

    if (!travelDate || !seasonality?.bestMonths) {
      return {
        level: 'MEDIUM',
        peakTimes: ['10:00-12:00', '14:00-16:00'],
        estimatedWaitTime: 30,
        impact: '可能需要排队等待',
      };
    }

    const travelMonth = new Date(travelDate).getMonth() + 1;
    const isPeakSeason = seasonality.bestMonths.includes(travelMonth);

    if (isPeakSeason) {
      return {
        level: 'HIGH',
        peakTimes: ['09:00-11:00', '13:00-17:00'],
        estimatedWaitTime: 60,
        impact: '旺季人流较多，可能需要较长时间排队',
      };
    }

    return {
      level: 'LOW',
      peakTimes: ['10:00-12:00'],
      estimatedWaitTime: 15,
      impact: '人流较少，体验较好',
    };
  }

  /**
   * 评估维护关闭风险
   */
  private assessMaintenanceClosureRisk(
    route: RouteDirectionData,
    context?: { travelDate?: string },
  ): ExperienceRiskFactors['maintenanceClosure'] {
    // 简化实现：基于路线类型和月份评估
    const travelDate = context?.travelDate;
    const probability = 0.1; // 基础概率

    // 如果是淡季，维护概率可能更高
    const seasonality = route.seasonality;
    if (travelDate && seasonality?.avoidMonths) {
      const travelMonth = new Date(travelDate).getMonth() + 1;
      if (seasonality.avoidMonths.includes(travelMonth)) {
        return {
          probability: 0.3,
          impact: '淡季可能有维护关闭',
          alternativeOptions: ['查看其他替代路线', '调整出行时间'],
        };
      }
    }

    return {
      probability,
      impact: '维护关闭风险较低',
      alternativeOptions: [],
    };
  }

  /**
   * 评估预期偏差风险
   */
  private assessExpectationGapRisk(
    route: RouteDirectionData,
    _context?: { travelerPreferences?: string[] },
  ): ExperienceRiskFactors['expectationGap'] {
    const potentialGaps: NonNullable<ExperienceRiskFactors['expectationGap']>['potentialGaps'] = [];
    const probability = 0.2; // 基础概率

    // 检查路线描述与实际可能存在的偏差
    const description = route.description || '';
    if (description.length < 100) {
      potentialGaps.push({
        aspect: 'SCENERY',
        description: '路线描述可能不够详细',
        severity: 'MEDIUM',
      });
    }

    // 检查设施信息
    const constraints = route.constraints || {};
    if (constraints.hard?.requiresStairs && !constraints.hard?.hasElevator) {
      potentialGaps.push({
        aspect: 'FACILITIES',
        description: '可能需要爬楼梯，无障碍设施可能不足',
        severity: 'MEDIUM',
      });
    }

    return {
      probability: potentialGaps.length > 0 ? Math.min(1.0, probability + potentialGaps.length * 0.1) : probability,
      potentialGaps,
      impact: potentialGaps.length > 0 ? '可能存在预期偏差' : '预期偏差风险较低',
    };
  }

  /**
   * 评估季节性体验风险
   */
  private assessSeasonalExperienceRisk(
    route: RouteDirectionData,
    context?: { travelDate?: string },
  ): ExperienceRiskFactors['seasonalExperienceRisk'] {
    const seasonality = route.seasonality;
    const travelDate = context?.travelDate;

    if (!travelDate || !seasonality?.bestMonths) {
      return {
        currentSeason: '未知',
        optimalSeason: '未知',
        experienceDifference: '无法评估',
        impact: '缺少季节性信息',
      };
    }

    const travelMonth = new Date(travelDate).getMonth() + 1;
    const isBestMonth = seasonality.bestMonths.includes(travelMonth);
    const isAvoidMonth = seasonality.avoidMonths?.includes(travelMonth);

    const currentSeason = this.getSeasonName(travelMonth);
    const optimalSeason = seasonality.bestMonths.map(m => this.getSeasonName(m)).join('、');

    if (isBestMonth) {
      return {
        currentSeason,
        optimalSeason,
        experienceDifference: '当前季节为最佳体验时间',
        impact: '体验质量预期良好',
      };
    } else if (isAvoidMonth) {
      return {
        currentSeason,
        optimalSeason,
        experienceDifference: '当前季节不适宜',
        impact: '体验质量可能较差',
      };
    } else {
      return {
        currentSeason,
        optimalSeason,
        experienceDifference: '当前季节可接受，但非最佳',
        impact: '体验质量中等',
      };
    }
  }

  /**
   * 评估天气影响体验风险
   */
  private assessWeatherImpactRisk(
    route: RouteDirectionData,
    _context?: { travelDate?: string },
  ): ExperienceRiskFactors['weatherImpactRisk'] {
    const weatherWindow = route.riskProfile?.weatherWindow;

    if (weatherWindow) {
      return {
        weatherDependent: true,
        weatherSensitivity: 'HIGH',
        impact: '路线受天气影响较大，天气不佳时体验可能显著下降',
      };
    }

    // 基于路线类型推断天气敏感性
    const tags = route.tags || [];
    if (tags.includes('户外') || tags.includes('outdoor')) {
      return {
        weatherDependent: true,
        weatherSensitivity: 'MEDIUM',
        impact: '户外活动受天气影响，建议关注天气预报',
      };
    }

    return {
      weatherDependent: false,
      weatherSensitivity: 'LOW',
      impact: '天气对体验影响较小',
    };
  }

  /**
   * 计算体验风险评分
   */
  private calculateExperienceRiskScore(factors: ExperienceRiskFactors): number {
    let score = 0;
    let weights = 0;

    if (factors.crowdingRisk) {
      const levelScore = factors.crowdingRisk.level === 'HIGH' ? 0.8 : factors.crowdingRisk.level === 'MEDIUM' ? 0.5 : 0.2;
      score += levelScore * 0.3;
      weights += 0.3;
    }

    if (factors.maintenanceClosure) {
      score += factors.maintenanceClosure.probability * 0.2;
      weights += 0.2;
    }

    if (factors.expectationGap) {
      score += factors.expectationGap.probability * 0.2;
      weights += 0.2;
    }

    if (factors.seasonalExperienceRisk) {
      const isOptimal = factors.seasonalExperienceRisk.experienceDifference.includes('最佳');
      const isAvoid = factors.seasonalExperienceRisk.experienceDifference.includes('不适宜');
      const seasonScore = isOptimal ? 0.2 : isAvoid ? 0.8 : 0.5;
      score += seasonScore * 0.2;
      weights += 0.2;
    }

    if (factors.weatherImpactRisk) {
      const sensitivityScore = factors.weatherImpactRisk.weatherSensitivity === 'HIGH' ? 0.7 : factors.weatherImpactRisk.weatherSensitivity === 'MEDIUM' ? 0.4 : 0.2;
      score += sensitivityScore * 0.1;
      weights += 0.1;
    }

    return weights > 0 ? score / weights : 0.5;
  }

  /**
   * 生成体验风险摘要
   */
  private generateExperienceRiskSummary(factors: ExperienceRiskFactors, level: RiskLevel): string {
    const parts: string[] = [];

    if (factors.crowdingRisk && factors.crowdingRisk.level === 'HIGH') {
      parts.push('人流拥挤风险较高');
    }

    if (factors.maintenanceClosure && factors.maintenanceClosure.probability > 0.2) {
      parts.push('存在维护关闭风险');
    }

    if (factors.seasonalExperienceRisk && factors.seasonalExperienceRisk.experienceDifference.includes('不适宜')) {
      parts.push('当前季节不适宜');
    }

    if (parts.length === 0) {
      return `体验风险${level === 'LOW' ? '较低' : level === 'MEDIUM' ? '中等' : '较高'}`;
    }

    return parts.join('；');
  }

  /**
   * 生成体验风险建议
   */
  private generateExperienceRiskRecommendations(factors: ExperienceRiskFactors, _level: RiskLevel): string[] {
    const recommendations: string[] = [];

    if (factors.crowdingRisk && factors.crowdingRisk.level === 'HIGH') {
      recommendations.push('建议错峰出行，避开高峰时段');
      recommendations.push(`预计等待时间约${factors.crowdingRisk.estimatedWaitTime}分钟`);
    }

    if (factors.maintenanceClosure && factors.maintenanceClosure.probability > 0.2) {
      recommendations.push('提前查询景点开放状态');
      if (factors.maintenanceClosure.alternativeOptions) {
        recommendations.push(...factors.maintenanceClosure.alternativeOptions);
      }
    }

    if (factors.seasonalExperienceRisk && factors.seasonalExperienceRisk.experienceDifference.includes('不适宜')) {
      recommendations.push(`建议在${factors.seasonalExperienceRisk.optimalSeason}出行以获得最佳体验`);
    }

    if (factors.weatherImpactRisk?.weatherDependent) {
      recommendations.push('关注天气预报，准备应对天气变化的方案');
    }

    if (recommendations.length === 0) {
      recommendations.push('体验风险可控，按计划执行即可');
    }

    return recommendations;
  }

  /**
   * 评估预期体验质量
   */
  private assessExpectedExperienceQuality(
    factors: ExperienceRiskFactors,
    riskScore: number,
  ): { score: number; description: string } {
    const qualityScore = 1 - riskScore; // 风险越低，质量越高

    let description: string;
    if (qualityScore >= 0.8) {
      description = '预期体验质量优秀';
    } else if (qualityScore >= 0.6) {
      description = '预期体验质量良好';
    } else if (qualityScore >= 0.4) {
      description = '预期体验质量中等';
    } else {
      description = '预期体验质量可能较差';
    }

    return { score: qualityScore, description };
  }

  // ========== 风险应对策略矩阵辅助方法 ==========

  /**
   * 选择应对策略
   */
  private selectMitigationStrategies(riskCategory: RiskCategory, riskLevel: RiskLevel): RiskMitigationStrategy[] {
    const strategies: RiskMitigationStrategy[] = [];

    // 安全风险：优先预防和避免
    if (riskCategory === 'SAFETY') {
      if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
        strategies.push('AVOID', 'PREVENT');
      } else {
        strategies.push('PREVENT', 'MITIGATE');
      }
    }
    // 成本风险：优先预防和转移
    else if (riskCategory === 'COST') {
      strategies.push('PREVENT', 'MITIGATE', 'TRANSFER');
    }
    // 体验风险：优先缓解和接受
    else if (riskCategory === 'EXPERIENCE') {
      strategies.push('MITIGATE', 'ACCEPT');
    }
    // 其他风险：根据等级选择
    else {
      if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
        strategies.push('PREVENT', 'MITIGATE');
      } else {
        strategies.push('MITIGATE', 'ACCEPT');
      }
    }

    return strategies;
  }

  /**
   * 生成应对措施
   */
  private generateMitigationMeasures(
    riskCategory: RiskCategory,
    riskLevel: RiskLevel,
    _riskDetails: any,
  ): RiskMitigationMeasure[] {
    const measures: RiskMitigationMeasure[] = [];

    if (riskCategory === 'COST') {
      if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
        measures.push({
          strategy: 'PREVENT',
          description: '提前规划预算，增加缓冲',
          actions: ['设置预算上限', '预留10-20%缓冲', '选择可退改选项'],
          expectedEffect: '降低预算超支风险',
          implementationDifficulty: 'LOW',
          costImpact: 0,
        });
        measures.push({
          strategy: 'TRANSFER',
          description: '购买旅行保险',
          actions: ['购买取消险', '购买延误险'],
          expectedEffect: '转移部分成本风险',
          implementationDifficulty: 'LOW',
          costImpact: 200,
        });
      }
    } else if (riskCategory === 'EXPERIENCE') {
      if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
        measures.push({
          strategy: 'MITIGATE',
          description: '错峰出行，避开高峰',
          actions: ['选择非旺季出行', '避开高峰时段', '提前预订'],
          expectedEffect: '降低拥挤风险，提升体验',
          implementationDifficulty: 'MEDIUM',
          costImpact: 0,
        });
      }
    }

    // 通用措施
    measures.push({
      strategy: 'ACCEPT',
      description: '接受风险，准备应对方案',
      actions: ['了解风险详情', '准备备选方案', '保持灵活性'],
      expectedEffect: '降低风险影响',
      implementationDifficulty: 'LOW',
      costImpact: 0,
    });

    return measures;
  }

  /**
   * 确定优先级
   */
  private determinePriority(riskCategory: RiskCategory, riskLevel: RiskLevel): 'HIGH' | 'MEDIUM' | 'LOW' {
    // 安全风险总是高优先级
    if (riskCategory === 'SAFETY') {
      return 'HIGH';
    }

    // 高风险或关键风险为高优先级
    if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      return 'HIGH';
    }

    // 中等风险为中等优先级
    if (riskLevel === 'MEDIUM') {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  // ========== 综合风险评估辅助方法 ==========

  /**
   * 评估安全风险（简化实现）
   */
  private assessSafetyRisk(route: RouteDirectionData): { level: RiskLevel; score: number; details: string[] } {
    const riskProfile = route.riskProfile || {};
    const details: string[] = [];

    if (riskProfile.altitudeSickness) {
      details.push('存在高反风险');
    }
    if (riskProfile.roadClosure) {
      details.push('存在封路风险');
    }
    if (riskProfile.weatherWindow) {
      details.push('受天气窗口限制');
    }

    const hasRisk = details.length > 0;
    return {
      level: hasRisk ? 'MEDIUM' : 'LOW',
      score: hasRisk ? 0.5 : 0.2,
      details,
    };
  }

  /**
   * 评估体力风险（简化实现）
   */
  private assessPhysicalRisk(route: RouteDirectionData): { level: RiskLevel; score: number; details: string[] } {
    const constraints = route.constraints || {};
    const details: string[] = [];

    if (constraints.hard?.maxElevationM && constraints.hard.maxElevationM > 3000) {
      details.push('高海拔路线');
    }
    if (constraints.hard?.maxSlopePct && constraints.hard.maxSlopePct > 20) {
      details.push('陡坡路线');
    }

    const hasRisk = details.length > 0;
    return {
      level: hasRisk ? 'MEDIUM' : 'LOW',
      score: hasRisk ? 0.4 : 0.2,
      details,
    };
  }

  /**
   * 评估时间风险（简化实现）
   */
  private assessTimeRisk(route: RouteDirectionData): { level: RiskLevel; score: number; details: string[] } {
    const details: string[] = [];
    const riskProfile = route.riskProfile || {};

    if (riskProfile.ferryDependent) {
      details.push('依赖渡轮，时间可能不稳定');
    }
    if (riskProfile.weatherWindow) {
      details.push('受天气窗口限制，可能延误');
    }

    const hasRisk = details.length > 0;
    return {
      level: hasRisk ? 'MEDIUM' : 'LOW',
      score: hasRisk ? 0.3 : 0.2,
      details,
    };
  }

  /**
   * 计算总体风险评分
   */
  private calculateOverallRiskScore(scores: {
    safety: number;
    physical: number;
    time: number;
    experience: number;
    cost: number;
  }): number {
    // 使用加权平均，安全风险权重最高
    return (
      scores.safety * 0.3 +
      scores.physical * 0.2 +
      scores.time * 0.15 +
      scores.experience * 0.2 +
      scores.cost * 0.15
    );
  }

  /**
   * 格式化风险摘要
   */
  private formatRiskSummary(risks: {
    safety: { level: RiskLevel };
    physical: { level: RiskLevel };
    time: { level: RiskLevel };
    experience: { overallLevel: RiskLevel };
    cost: { overallLevel: RiskLevel };
    overallLevel: RiskLevel;
  }): string {
    const emojiMap: Record<RiskLevel, string> = {
      LOW: '🟢',
      MEDIUM: '🟡',
      HIGH: '🟠',
      CRITICAL: '🔴',
    };

    const levelTextMap: Record<RiskLevel, string> = {
      LOW: '低',
      MEDIUM: '中',
      HIGH: '高',
      CRITICAL: '极高',
    };

    return [
      `${emojiMap[risks.safety.level]} 安全风险：${levelTextMap[risks.safety.level]}`,
      `${emojiMap[risks.physical.level]} 体力风险：${levelTextMap[risks.physical.level]}`,
      `${emojiMap[risks.time.level]} 时间风险：${levelTextMap[risks.time.level]}`,
      `${emojiMap[risks.experience.overallLevel]} 体验风险：${levelTextMap[risks.experience.overallLevel]}`,
      `${emojiMap[risks.cost.overallLevel]} 成本风险：${levelTextMap[risks.cost.overallLevel]}`,
      `\n总体风险：${emojiMap[risks.overallLevel]} ${levelTextMap[risks.overallLevel]}`,
    ].join('\n');
  }

  // ========== 工具方法 ==========

  /**
   * 评分转换为风险等级
   */
  private scoreToRiskLevel(score: number): RiskLevel {
    if (score >= 0.8) return 'CRITICAL';
    if (score >= 0.6) return 'HIGH';
    if (score >= 0.4) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * 估算路线成本（简化实现）
   */
  private estimateRouteCost(route: RouteDirectionData, context?: { travelerCount?: number }): number {
    const travelerCount = context?.travelerCount || 1;
    const metadata = route.metadata || {};

    // 如果有预估成本，直接使用
    if (metadata.estimatedCost) {
      return metadata.estimatedCost * travelerCount;
    }

    // 否则基于路线类型和时长估算
    const estimatedDuration = metadata.estimatedDuration || 7;
    const baseDailyCost = 1000; // 假设每日基础成本1000元

    return baseDailyCost * estimatedDuration * travelerCount;
  }

  /**
   * 获取季节名称
   */
  private getSeasonName(month: number): string {
    if (month >= 3 && month <= 5) return '春季';
    if (month >= 6 && month <= 8) return '夏季';
    if (month >= 9 && month <= 11) return '秋季';
    return '冬季';
  }
}
