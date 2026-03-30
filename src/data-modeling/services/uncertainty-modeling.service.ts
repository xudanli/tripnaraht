// src/data-modeling/services/uncertainty-modeling.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  UncertaintyModel,
  UncertaintySourceType,
  UncertaintyLevel,
  ScenarioAnalysis,
  ScenarioResult,
  UserFacingUncertaintyDisplay,
} from '../interfaces/uncertainty-model.interface';
import { ExtendedDataSourceInfo } from '../../data-quality/interfaces/source-annotation.interface';

/**
 * 不确定性建模服务
 * 
 * 提供不确定性建模功能：
 * - 创建不确定性模型
 * - 计算置信区间
 * - 情景分析（最好/最坏/最可能）
 * - 呈现不确定性给用户
 */
@Injectable()
export class UncertaintyModelingService {
  private readonly logger = new Logger(UncertaintyModelingService.name);

  /**
   * 创建不确定性模型
   */
  createUncertaintyModel(
    sourceType: UncertaintySourceType,
    bestEstimate: number,
    historicalData?: number[],
    dataSource?: ExtendedDataSourceInfo,
  ): UncertaintyModel {
    this.logger.log(`Creating uncertainty model for ${sourceType} with estimate ${bestEstimate}`);

    // 计算下界和上界
    const { lowerBound, upperBound } = this.calculateBounds(bestEstimate, historicalData);

    // 计算置信度
    const confidence = this.calculateConfidence(historicalData, dataSource);

    // 确定不确定性等级
    const uncertaintyLevel = this.determineUncertaintyLevel(lowerBound, upperBound, bestEstimate);

    // 构建数据来源信息（如果没有提供）
    const sourceInfo: ExtendedDataSourceInfo = dataSource || {
      type: this.mapSourceTypeToDataSourceType(sourceType),
      timestamp: new Date().toISOString(),
      reliability: this.mapUncertaintyLevelToReliability(uncertaintyLevel),
      source: 'API',
      sourceName: this.getSourceName(sourceType),
      confidence,
      verificationLevel: 'B_RELIABLE',
      isFactual: true,
    };

    return {
      sourceType,
      bestEstimate,
      lowerBound,
      upperBound,
      confidence,
      dataSource: sourceInfo,
      uncertaintyLevel,
      distributionType: this.inferDistributionType(sourceType, historicalData),
      distributionParams: this.calculateDistributionParams(bestEstimate, lowerBound, upperBound),
    };
  }

  /**
   * 情景分析（最好/最坏/最可能）
   */
  analyzeScenarios(
    route: any,
    uncertainties: UncertaintyModel[],
  ): ScenarioAnalysis {
    this.logger.log(`Analyzing scenarios with ${uncertainties.length} uncertainties`);

    // 基准情况（使用最佳估计值）
    const baseCase = this.calculateBaseCase(route, uncertainties);

    // 最好情况（使用下界，风险更低）
    const bestCase = this.calculateBestCase(route, uncertainties);

    // 最坏情况（使用上界，风险更高）
    const worstCase = this.calculateWorstCase(route, uncertainties);

    const upsidePotential = bestCase.risk - baseCase.risk;
    const downsideRisk = worstCase.risk - baseCase.risk;

    return {
      bestCase,
      baseCase,
      worstCase,
      upsidePotential,
      downsideRisk,
    };
  }

  /**
   * 呈现不确定性给用户
   */
  presentUncertainty(uncertainty: UncertaintyModel): UserFacingUncertaintyDisplay {
    const confidencePercent = (uncertainty.confidence * 100).toFixed(0);
    const range = `${uncertainty.lowerBound}到${uncertainty.upperBound}`;
    const levelLabel = this.getUncertaintyLevelLabel(uncertainty.uncertaintyLevel);

    return {
      what: `这个数据的准确性有${confidencePercent}%的把握`,
      range: `实际值可能在${range}之间`,
      explanation: this.generateUncertaintyExplanation(uncertainty),
      visualization: this.generateUncertaintyVisualization(uncertainty),
      levelLabel,
      suggestion: this.generateSuggestion(uncertainty),
    };
  }

  // ========== 私有方法 ==========

  /**
   * 计算置信区间（下界和上界）
   */
  private calculateBounds(
    bestEstimate: number,
    historicalData?: number[],
  ): { lowerBound: number; upperBound: number } {
    if (!historicalData || historicalData.length === 0) {
      // 如果没有历史数据，使用默认的不确定性范围（±20%）
      const defaultUncertainty = 0.2;
      return {
        lowerBound: bestEstimate * (1 - defaultUncertainty),
        upperBound: bestEstimate * (1 + defaultUncertainty),
      };
    }

    // 计算5%和95%分位数
    const sorted = [...historicalData].sort((a, b) => a - b);
    const lowerIndex = Math.floor(sorted.length * 0.05);
    const upperIndex = Math.ceil(sorted.length * 0.95) - 1;

    return {
      lowerBound: sorted[lowerIndex] || bestEstimate * 0.8,
      upperBound: sorted[upperIndex] || bestEstimate * 1.2,
    };
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    historicalData?: number[],
    dataSource?: ExtendedDataSourceInfo,
  ): number {
    let confidence = 0.5; // 基础置信度

    // 基于历史数据量
    if (historicalData && historicalData.length > 0) {
      const sampleSize = historicalData.length;
      confidence += Math.min(0.3, sampleSize / 100); // 最多增加0.3
    }

    // 基于数据来源可靠性
    if (dataSource) {
      switch (dataSource.reliability) {
        case 'HIGH':
          confidence += 0.2;
          break;
        case 'MEDIUM':
          confidence += 0.1;
          break;
        case 'LOW':
          confidence -= 0.1;
          break;
      }

      // 基于验证等级
      switch (dataSource.verificationLevel) {
        case 'A_VERIFIED':
          confidence += 0.15;
          break;
        case 'B_RELIABLE':
          confidence += 0.1;
          break;
        case 'C_USER_FEEDBACK':
          confidence += 0.05;
          break;
        case 'D_PENDING':
          confidence -= 0.1;
          break;
        case 'E_LLM_GENERATED':
          confidence -= 0.2;
          break;
      }
    }

    // 确保置信度在0-1范围内
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * 确定不确定性等级
   */
  private determineUncertaintyLevel(
    lowerBound: number,
    upperBound: number,
    bestEstimate: number,
  ): UncertaintyLevel {
    if (bestEstimate === 0) {
      return 'HIGH';
    }

    const range = upperBound - lowerBound;
    const relativeUncertainty = range / Math.abs(bestEstimate);

    if (relativeUncertainty < 0.1) {
      return 'LOW';
    } else if (relativeUncertainty < 0.3) {
      return 'MEDIUM';
    } else {
      return 'HIGH';
    }
  }

  /**
   * 推断概率分布类型
   */
  private inferDistributionType(
    sourceType: UncertaintySourceType,
    historicalData?: number[],
  ): 'NORMAL' | 'UNIFORM' | 'TRIANGULAR' | 'BETA' {
    // 根据来源类型和历史数据特征推断分布类型
    if (!historicalData || historicalData.length < 3) {
      return 'TRIANGULAR'; // 默认使用三角分布
    }

    // 简单检查：如果数据看起来对称，使用正态分布
    const mean = historicalData.reduce((a, b) => a + b, 0) / historicalData.length;
    const variance =
      historicalData.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) /
      historicalData.length;
    const stdDev = Math.sqrt(variance);

    // 如果标准差相对较小，可能是正态分布
    if (stdDev / mean < 0.2) {
      return 'NORMAL';
    }

    return 'TRIANGULAR';
  }

  /**
   * 计算分布参数
   */
  private calculateDistributionParams(
    bestEstimate: number,
    lowerBound: number,
    upperBound: number,
  ): Record<string, number> {
    return {
      mode: bestEstimate,
      min: lowerBound,
      max: upperBound,
    };
  }

  /**
   * 计算基准情况
   */
  private calculateBaseCase(route: any, uncertainties: UncertaintyModel[]): ScenarioResult {
    // 使用最佳估计值计算风险
    const risk = this.calculateRisk(route, uncertainties, 'base');

    return {
      risk,
      feasibility: risk < 0.7, // 风险低于0.7认为可行
      explanation: '基于当前最佳估计的风险评估',
    };
  }

  /**
   * 计算最好情况
   */
  private calculateBestCase(route: any, uncertainties: UncertaintyModel[]): ScenarioResult {
    // 使用下界（更乐观的值）计算风险
    const risk = this.calculateRisk(route, uncertainties, 'best');

    return {
      risk,
      feasibility: risk < 0.7,
      explanation: '最乐观情况下的风险评估（使用不确定性下界）',
    };
  }

  /**
   * 计算最坏情况
   */
  private calculateWorstCase(route: any, uncertainties: UncertaintyModel[]): ScenarioResult {
    // 使用上界（更悲观的值）计算风险
    const risk = this.calculateRisk(route, uncertainties, 'worst');

    return {
      risk,
      feasibility: risk < 0.7,
      explanation: '最悲观情况下的风险评估（使用不确定性上界）',
    };
  }

  /**
   * 计算风险（简化实现）
   */
  private calculateRisk(
    route: any,
    uncertainties: UncertaintyModel[],
    scenario: 'base' | 'best' | 'worst',
  ): number {
    // 简化实现：基于不确定性的加权平均
    let totalRisk = 0;
    let weightSum = 0;

    uncertainties.forEach(uncertainty => {
      let value: number;
      switch (scenario) {
        case 'best':
          value = uncertainty.lowerBound;
          break;
        case 'worst':
          value = uncertainty.upperBound;
          break;
        default:
          value = uncertainty.bestEstimate;
      }

      // 根据不确定性等级计算风险贡献
      const riskContribution = this.calculateRiskContribution(uncertainty, value);
      const weight = 1 - uncertainty.confidence; // 置信度越低，权重越高

      totalRisk += riskContribution * weight;
      weightSum += weight;
    });

    return weightSum > 0 ? totalRisk / weightSum : 0.5;
  }

  /**
   * 计算风险贡献
   */
  private calculateRiskContribution(uncertainty: UncertaintyModel, _value: number): number {
    // 简化实现：根据不确定性等级和值的大小计算风险
    const levelMultiplier = {
      LOW: 0.3,
      MEDIUM: 0.5,
      HIGH: 0.8,
    };

    return levelMultiplier[uncertainty.uncertaintyLevel] * (1 - uncertainty.confidence);
  }

  /**
   * 生成不确定性解释
   */
  private generateUncertaintyExplanation(uncertainty: UncertaintyModel): string {
    const sourceName = uncertainty.dataSource.sourceName;
    const level = this.getUncertaintyLevelLabel(uncertainty.uncertaintyLevel);

    return `数据来源于${sourceName}，不确定性等级为${level}。实际值有${(uncertainty.confidence * 100).toFixed(0)}%的概率在${uncertainty.lowerBound}到${uncertainty.upperBound}之间。`;
  }

  /**
   * 生成不确定性可视化数据
   */
  private generateUncertaintyVisualization(uncertainty: UncertaintyModel): {
    type: 'BAR' | 'LINE' | 'DISTRIBUTION';
    data: any;
  } {
    return {
      type: 'DISTRIBUTION',
      data: {
        bestEstimate: uncertainty.bestEstimate,
        lowerBound: uncertainty.lowerBound,
        upperBound: uncertainty.upperBound,
        distributionType: uncertainty.distributionType,
        distributionParams: uncertainty.distributionParams,
      },
    };
  }

  /**
   * 生成建议
   */
  private generateSuggestion(uncertainty: UncertaintyModel): string {
    if (uncertainty.uncertaintyLevel === 'HIGH') {
      return '建议收集更多数据以提高准确性，或准备应对较大变化范围的方案。';
    } else if (uncertainty.uncertaintyLevel === 'MEDIUM') {
      return '数据有一定不确定性，建议准备备选方案。';
    } else {
      return '数据相对可靠，可以基于此进行决策。';
    }
  }

  /**
   * 获取不确定性等级标签
   */
  private getUncertaintyLevelLabel(level: UncertaintyLevel): string {
    const labels = {
      LOW: '低',
      MEDIUM: '中',
      HIGH: '高',
    };
    return labels[level];
  }

  /**
   * 映射来源类型到数据源类型
   */
  private mapSourceTypeToDataSourceType(
    sourceType: UncertaintySourceType,
  ): ExtendedDataSourceInfo['type'] {
    const mapping: Record<UncertaintySourceType, ExtendedDataSourceInfo['type']> = {
      WEATHER: 'WEATHER',
      CROWD: 'POI',
      USER_CAPACITY: 'USER_INPUT',
      TRANSPORT: 'TRANSPORT',
      EXPERIENCE: 'POI',
      ROUTE_CONDITION: 'ROUTE',
      COST: 'POI',
      DURATION: 'TRANSPORT',
    };
    return mapping[sourceType] || 'OTHER';
  }

  /**
   * 映射不确定性等级到可靠性
   */
  private mapUncertaintyLevelToReliability(
    level: UncertaintyLevel,
  ): ExtendedDataSourceInfo['reliability'] {
    const mapping: Record<UncertaintyLevel, ExtendedDataSourceInfo['reliability']> = {
      LOW: 'HIGH',
      MEDIUM: 'MEDIUM',
      HIGH: 'LOW',
    };
    return mapping[level];
  }

  /**
   * 获取来源名称
   */
  private getSourceName(sourceType: UncertaintySourceType): string {
    const names: Record<UncertaintySourceType, string> = {
      WEATHER: '天气数据API',
      CROWD: '人流数据API',
      USER_CAPACITY: '用户能力评估',
      TRANSPORT: '交通数据API',
      EXPERIENCE: '体验数据API',
      ROUTE_CONDITION: '路线条件数据',
      COST: '成本数据API',
      DURATION: '时长数据API',
    };
    return names[sourceType] || '未知数据源';
  }
}
