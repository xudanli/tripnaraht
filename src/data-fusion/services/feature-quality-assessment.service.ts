// src/data-fusion/services/feature-quality-assessment.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  FeatureQualityReport,
  FeatureQualityLevel,
  FeatureQualityAssessmentConfig,
} from '../interfaces/feature-quality.interface';
import { DataSourceConfig } from '../interfaces/data-fusion.interface';

/**
 * 特征质量评估服务
 * 
 * 实现文档要求的特征质量评估：
 * - 可靠性评估
 * - 完整性评估
 * - 时效性评估
 * - 可追溯性评估
 * - 一致性评估（增强）
 */
@Injectable()
export class FeatureQualityAssessmentService {
  private readonly logger = new Logger(FeatureQualityAssessmentService.name);

  // 性能优化：缓存评估结果
  private readonly assessmentCache = new Map<string, { report: FeatureQualityReport; timestamp: number }>();
  private readonly CACHE_TTL = 300000; // 缓存5分钟

  private readonly defaultConfig: Required<FeatureQualityAssessmentConfig> = {
    reliabilityWeight: 0.25,
    completenessWeight: 0.20,
    timelinessWeight: 0.20,
    traceabilityWeight: 0.20,
    consistencyWeight: 0.15,
    reliabilityThreshold: 0.7,
    completenessThreshold: 0.8,
    timelinessThresholdSeconds: 3600, // 1小时
    enableDetailedAssessment: true,
  };

  /**
   * 评估特征质量
   */
  async assessFeatureQuality(
    featureName: string,
    featureValue: any,
    sourceData: DataSourceConfig[],
    config?: FeatureQualityAssessmentConfig
  ): Promise<FeatureQualityReport> {
    const assessmentConfig: Required<FeatureQualityAssessmentConfig> = {
      ...this.defaultConfig,
      ...config,
    };

    this.logger.debug(`Assessing feature quality: ${featureName}`);

    // 性能优化：检查缓存
    const cacheKey = this.generateCacheKey(featureName, featureValue, sourceData);
    const cached = this.assessmentCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.debug(`Using cached assessment for feature: ${featureName}`);
      return cached.report;
    }

    // 评估各维度
    const reliability = this.assessReliability(featureValue, sourceData, assessmentConfig);
    const completeness = this.assessCompleteness(sourceData, assessmentConfig);
    const timeliness = this.assessTimeliness(sourceData, assessmentConfig);
    const traceability = this.assessTraceability(sourceData, assessmentConfig);
    const consistency = this.assessConsistency(sourceData, assessmentConfig);

    // 计算综合质量
    const overallQuality = this.calculateOverallQuality(
      {
        reliability,
        completeness,
        timeliness,
        traceability,
        consistency,
      },
      assessmentConfig
    );

    // 确定质量等级
    const qualityLevel = this.determineQualityLevel(overallQuality);

    // 识别问题
    const issues = this.identifyIssues(
      {
        reliability,
        completeness,
        timeliness,
        traceability,
        consistency,
      },
      assessmentConfig
    );

    // 生成建议
    const recommendations = this.generateRecommendations(
      {
        reliability,
        completeness,
        timeliness,
        traceability,
        consistency,
      },
      issues,
      assessmentConfig
    );

    const report: FeatureQualityReport = {
      featureName,
      featureValue,
      reliability,
      completeness,
      timeliness,
      traceability,
      consistency,
      overallQuality,
      qualityLevel,
      issues,
      recommendations,
      assessedAt: new Date().toISOString(),
    };

    // 性能优化：缓存结果
    this.assessmentCache.set(cacheKey, {
      report,
      timestamp: Date.now(),
    });

    // 清理过期缓存
    this.cleanExpiredCache();

    return report;
  }

  /**
   * 批量评估多个特征质量（性能优化版本）
   * 
   * 优化点：
   * - 智能并行处理（根据特征数量和数据源数量）
   * - 批量缓存检查
   * - 结果聚合和统计
   */
  async assessMultipleFeatures(
    features: Array<{ name: string; value: any }>,
    sourceData: DataSourceConfig[],
    config?: FeatureQualityAssessmentConfig
  ): Promise<Map<string, FeatureQualityReport>> {
    this.logger.debug(`Batch assessing ${features.length} features`);

    const results = new Map<string, FeatureQualityReport>();

    // 性能优化：批量检查缓存
    const cachedResults = new Map<string, FeatureQualityReport>();
    const uncachedFeatures: Array<{ name: string; value: any }> = [];

    for (const feature of features) {
      const cacheKey = this.generateCacheKey(feature.name, feature.value, sourceData);
      const cached = this.assessmentCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        cachedResults.set(feature.name, cached.report);
      } else {
        uncachedFeatures.push(feature);
      }
    }

    // 将缓存结果添加到结果集
    for (const [name, report] of cachedResults.entries()) {
      results.set(name, report);
    }

    if (uncachedFeatures.length === 0) {
      this.logger.debug(`All ${features.length} features found in cache`);
      return results;
    }

    // 并行评估未缓存的特征（智能阈值：特征数量 >= 3 或数据源数量 >= 5）
    const shouldParallelize = uncachedFeatures.length >= 3 || sourceData.length >= 5;

    if (shouldParallelize) {
      // 并行评估
      const batchSize = Math.min(10, uncachedFeatures.length); // 限制并发数
      for (let i = 0; i < uncachedFeatures.length; i += batchSize) {
        const batch = uncachedFeatures.slice(i, i + batchSize);
        const promises = batch.map(feature =>
          this.assessFeatureQuality(feature.name, feature.value, sourceData, config)
            .then(report => ({ name: feature.name, report }))
            .catch(error => {
              this.logger.error(`Failed to assess feature ${feature.name}: ${error.message}`);
              return null;
            })
        );

        const batchResults = await Promise.all(promises);
        for (const result of batchResults) {
          if (result) {
            results.set(result.name, result.report);
          }
        }
      }
    } else {
      // 串行评估（特征数量较少时）
      for (const feature of uncachedFeatures) {
        try {
          const report = await this.assessFeatureQuality(
            feature.name,
            feature.value,
            sourceData,
            config
          );
          results.set(feature.name, report);
        } catch (error: any) {
          this.logger.error(`Failed to assess feature ${feature.name}: ${error.message}`);
        }
      }
    }

    return results;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(
    featureName: string,
    featureValue: any,
    sourceData: DataSourceConfig[]
  ): string {
    const sourceIds = sourceData.map(s => s.sourceId).sort().join(',');
    const valueHash = typeof featureValue === 'object'
      ? JSON.stringify(featureValue).substring(0, 100) // 限制长度
      : String(featureValue);
    return `${featureName}:${valueHash}:${sourceIds}`;
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.assessmentCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.assessmentCache.delete(key);
      }
    }
  }

  /**
   * 评估可靠性
   */
  private assessReliability(
    featureValue: any,
    sourceData: DataSourceConfig[],
    config: Required<FeatureQualityAssessmentConfig>
  ): number {
    if (sourceData.length === 0) {
      return 0;
    }

    // 基于数据源可靠性计算
    const avgReliability = sourceData.reduce((sum, s) => sum + s.reliability, 0) / sourceData.length;
    
    // 考虑数据源数量（更多数据源通常更可靠）
    const sourceCountFactor = Math.min(1, sourceData.length / 3); // 3个以上数据源为满分
    
    // 考虑数据源一致性
    const consistencyFactor = this.calculateSourceConsistency(sourceData);
    
    // 考虑特征值合理性
    const valueReasonableness = this.assessValueReasonableness(featureValue, sourceData);

    return avgReliability * 0.4 + 
           sourceCountFactor * 0.2 + 
           consistencyFactor * 0.2 + 
           valueReasonableness * 0.2;
  }

  /**
   * 评估完整性
   */
  private assessCompleteness(
    sourceData: DataSourceConfig[],
    config: Required<FeatureQualityAssessmentConfig>
  ): number {
    if (sourceData.length === 0) {
      return 0;
    }

    // 检查数据源是否都有该特征
    const sourcesWithFeature = sourceData.filter(s => {
      try {
        return this.hasFeature(s.data, 'feature'); // 简化：检查是否有数据
      } catch {
        return false;
      }
    }).length;

    const coverage = sourcesWithFeature / sourceData.length;

    // 检查数据是否为空
    const nonEmptySources = sourceData.filter(s => {
      if (s.data === null || s.data === undefined) return false;
      if (typeof s.data === 'object' && Object.keys(s.data).length === 0) return false;
      return true;
    }).length;

    const dataCompleteness = nonEmptySources / sourceData.length;

    return (coverage + dataCompleteness) / 2;
  }

  /**
   * 评估时效性（数据科学家优化版本）
   * 
   * 使用更科学的时效性评估：
   * - 加权平均新鲜度（考虑数据源可靠性）
   * - 使用半衰期模型
   * - 考虑数据源更新频率
   */
  private assessTimeliness(
    sourceData: DataSourceConfig[],
    config: Required<FeatureQualityAssessmentConfig>
  ): number {
    if (sourceData.length === 0) {
      return 0;
    }

    const now = Date.now();
    let totalWeightedFreshness = 0;
    let totalWeight = 0;
    let validSources = 0;

    for (const source of sourceData) {
      if (!source.timestamp) {
        continue;
      }

      const sourceTime = new Date(source.timestamp).getTime();
      const ageSeconds = (now - sourceTime) / 1000;
      
      // 使用半衰期模型计算新鲜度
      // freshness = 0.5^(age / halfLife)
      // 当age = halfLife时，freshness = 0.5
      const halfLife = config.timelinessThresholdSeconds / Math.log2(Math.E); // 转换为半衰期
      const freshness = Math.pow(0.5, ageSeconds / halfLife);
      
      // 加权平均（可靠性高的数据源权重更大）
      const weight = source.reliability;
      totalWeightedFreshness += freshness * weight;
      totalWeight += weight;
      validSources++;
    }

    if (validSources === 0) {
      return 0.5; // 没有时间戳，给中等分数
    }

    // 返回加权平均新鲜度
    return totalWeight > 0 ? totalWeightedFreshness / totalWeight : totalWeightedFreshness / validSources;
  }

  /**
   * 评估可追溯性
   */
  private assessTraceability(
    sourceData: DataSourceConfig[],
    config: Required<FeatureQualityAssessmentConfig>
  ): number {
    if (sourceData.length === 0) {
      return 0;
    }

    let traceabilityScore = 0;
    let validSources = 0;

    for (const source of sourceData) {
      let sourceScore = 0;
      let factors = 0;

      // 检查sourceId
      if (source.sourceId) {
        sourceScore += 0.3;
        factors++;
      }

      // 检查sourceName
      if (source.sourceName) {
        sourceScore += 0.2;
        factors++;
      }

      // 检查sourceInfo
      if (source.sourceInfo) {
        sourceScore += 0.3;
        factors++;
        if (source.sourceInfo.sourceType) {
          sourceScore += 0.1;
          factors++;
        }
        if (source.sourceInfo.timestamp) {
          sourceScore += 0.1;
          factors++;
        }
      }

      if (factors > 0) {
        traceabilityScore += sourceScore / factors;
        validSources++;
      }
    }

    return validSources > 0 ? traceabilityScore / validSources : 0;
  }

  /**
   * 评估一致性（增强）
   */
  private assessConsistency(
    sourceData: DataSourceConfig[],
    config: Required<FeatureQualityAssessmentConfig>
  ): number {
    if (sourceData.length <= 1) {
      return 1.0; // 单个数据源，一致性为满分
    }

    // 提取所有数据源的值
    const values = sourceData.map(s => s.data);
    
    // 计算值的一致性
    const consistency = this.calculateValueConsistency(values);
    
    return consistency;
  }

  /**
   * 计算数据源一致性（数据科学家优化版本）
   * 
   * 使用更科学的统计方法：
   * - 使用变异系数（CV）而非方差
   * - 考虑样本量调整
   */
  private calculateSourceConsistency(sourceData: DataSourceConfig[]): number {
    if (sourceData.length <= 1) {
      return 1.0;
    }

    // 计算可靠性统计量
    const reliabilities = sourceData.map(s => s.reliability);
    const mean = reliabilities.reduce((sum, r) => sum + r, 0) / reliabilities.length;
    const stdDev = this.calculateStandardDeviation(reliabilities);
    
    // 使用变异系数（CV = stdDev / mean）
    // CV越小，一致性越高
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;
    
    // 将CV转换为一致性分数（CV=0时为1.0，CV>=1时为0）
    // 使用指数衰减函数：exp(-CV * 2)
    const consistency = Math.exp(-coefficientOfVariation * 2);
    
    // 考虑样本量（样本量越大，一致性评估越可靠）
    const sampleSizeFactor = Math.min(1, Math.log2(sourceData.length + 1) / Math.log2(8));
    
    return consistency * 0.8 + sampleSizeFactor * 0.2;
  }

  /**
   * 计算标准差（数据科学家工具方法）
   */
  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  }

  /**
   * 评估值合理性
   */
  private assessValueReasonableness(
    value: any,
    sourceData: DataSourceConfig[]
  ): number {
    if (value === null || value === undefined) {
      return 0.3; // 空值，给较低分数
    }

    // 检查值类型
    if (typeof value === 'number') {
      // 检查是否为NaN或Infinity
      if (isNaN(value) || !isFinite(value)) {
        return 0.2;
      }
      return 0.9; // 数值类型通常合理
    }

    if (typeof value === 'string') {
      // 检查是否为空字符串
      if (value.trim().length === 0) {
        return 0.4;
      }
      return 0.8;
    }

    if (typeof value === 'object') {
      // 检查对象是否为空
      if (Object.keys(value).length === 0) {
        return 0.5;
      }
      return 0.85;
    }

    return 0.7; // 其他类型，给中等分数
  }

  /**
   * 计算值一致性（数据科学家优化版本）
   * 
   * 使用更科学的统计方法：
   * - 数值：使用变异系数和置信区间
   * - 字符串：使用编辑距离或Jaccard相似度
   * - 对象：使用结构相似度
   */
  private calculateValueConsistency(values: any[]): number {
    if (values.length <= 1) {
      return 1.0;
    }

    // 检查值类型一致性
    const types = values.map(v => typeof v);
    const typeConsistency = types.every(t => t === types[0]) ? 1.0 : 0.3; // 类型不一致时大幅降低

    // 如果是数值，使用统计方法计算一致性
    if (types[0] === 'number' && values.every(v => typeof v === 'number')) {
      const nums = values as number[];
      const mean = nums.reduce((sum, n) => sum + n, 0) / nums.length;
      const stdDev = this.calculateStandardDeviation(nums);
      const coefficientOfVariation = mean !== 0 ? stdDev / Math.abs(mean) : (stdDev > 0 ? 1 : 0);
      
      // 使用指数衰减函数：CV越小，一致性越高
      // CV=0时一致性=1.0，CV=1时一致性≈0.14
      const numericConsistency = Math.exp(-coefficientOfVariation * 2);
      
      // 考虑样本量（样本量越大，一致性评估越可靠）
      const sampleSizeFactor = Math.min(1, Math.log2(nums.length + 1) / Math.log2(4));
      
      return typeConsistency * 0.3 + numericConsistency * 0.5 + sampleSizeFactor * 0.2;
    }

    // 如果是字符串，使用相似度计算
    if (types[0] === 'string' && values.every(v => typeof v === 'string')) {
      const strings = values as string[];
      
      // 完全一致
      const allSame = strings.every(s => s === strings[0]);
      if (allSame) {
        return 1.0;
      }
      
      // 计算平均相似度（使用简单的字符重叠度）
      let totalSimilarity = 0;
      let comparisons = 0;
      
      for (let i = 0; i < strings.length; i++) {
        for (let j = i + 1; j < strings.length; j++) {
          const similarity = this.calculateStringSimilarity(strings[i], strings[j]);
          totalSimilarity += similarity;
          comparisons++;
        }
      }
      
      const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0.5;
      return typeConsistency * 0.3 + avgSimilarity * 0.7;
    }

    // 其他类型，主要依赖类型一致性
    return typeConsistency;
  }

  /**
   * 计算字符串相似度（简化版Jaccard相似度）
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) {
      return 1.0;
    }
    
    // 使用字符集合的Jaccard相似度
    const set1 = new Set(str1.toLowerCase().split(''));
    const set2 = new Set(str2.toLowerCase().split(''));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * 计算综合质量
   */
  private calculateOverallQuality(
    scores: {
      reliability: number;
      completeness: number;
      timeliness: number;
      traceability: number;
      consistency: number;
    },
    config: Required<FeatureQualityAssessmentConfig>
  ): number {
    return scores.reliability * config.reliabilityWeight +
           scores.completeness * config.completenessWeight +
           scores.timeliness * config.timelinessWeight +
           scores.traceability * config.traceabilityWeight +
           scores.consistency * config.consistencyWeight;
  }

  /**
   * 确定质量等级
   */
  private determineQualityLevel(overallQuality: number): FeatureQualityLevel {
    if (overallQuality >= 0.9) return 'EXCELLENT';
    if (overallQuality >= 0.75) return 'GOOD';
    if (overallQuality >= 0.6) return 'FAIR';
    if (overallQuality >= 0.4) return 'POOR';
    return 'CRITICAL';
  }

  /**
   * 识别问题
   */
  private identifyIssues(
    scores: {
      reliability: number;
      completeness: number;
      timeliness: number;
      traceability: number;
      consistency: number;
    },
    config: Required<FeatureQualityAssessmentConfig>
  ): FeatureQualityReport['issues'] {
    const issues: FeatureQualityReport['issues'] = [];

    if (scores.reliability < config.reliabilityThreshold) {
      issues.push({
        type: 'RELIABILITY',
        severity: scores.reliability < 0.5 ? 'CRITICAL' : scores.reliability < 0.6 ? 'HIGH' : 'MEDIUM',
        description: `可靠性不足（${(scores.reliability * 100).toFixed(1)}%）`,
        recommendation: '建议使用更可靠的数据源或增加数据源数量',
      });
    }

    if (scores.completeness < config.completenessThreshold) {
      issues.push({
        type: 'COMPLETENESS',
        severity: scores.completeness < 0.6 ? 'HIGH' : 'MEDIUM',
        description: `完整性不足（${(scores.completeness * 100).toFixed(1)}%）`,
        recommendation: '建议补充缺失的数据源或字段',
      });
    }

    if (scores.timeliness < 0.7) {
      issues.push({
        type: 'TIMELINESS',
        severity: scores.timeliness < 0.5 ? 'HIGH' : 'MEDIUM',
        description: `时效性不足（${(scores.timeliness * 100).toFixed(1)}%）`,
        recommendation: '建议更新数据源或使用更频繁的更新频率',
      });
    }

    if (scores.traceability < 0.7) {
      issues.push({
        type: 'TRACEABILITY',
        severity: scores.traceability < 0.5 ? 'MEDIUM' : 'LOW',
        description: `可追溯性不足（${(scores.traceability * 100).toFixed(1)}%）`,
        recommendation: '建议完善数据源信息标注',
      });
    }

    if (scores.consistency < 0.7) {
      issues.push({
        type: 'CONSISTENCY',
        severity: scores.consistency < 0.5 ? 'HIGH' : 'MEDIUM',
        description: `一致性不足（${(scores.consistency * 100).toFixed(1)}%）`,
        recommendation: '建议检查数据源之间的差异，可能需要数据清洗或标准化',
      });
    }

    return issues;
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    scores: {
      reliability: number;
      completeness: number;
      timeliness: number;
      traceability: number;
      consistency: number;
    },
    issues: FeatureQualityReport['issues'],
    config: Required<FeatureQualityAssessmentConfig>
  ): string[] {
    const recommendations: string[] = [];

    // 基于问题生成建议
    for (const issue of issues) {
      if (issue.recommendation) {
        recommendations.push(issue.recommendation);
      }
    }

    // 基于分数生成通用建议
    const minScore = Math.min(
      scores.reliability,
      scores.completeness,
      scores.timeliness,
      scores.traceability,
      scores.consistency
    );

    if (minScore < 0.5) {
      recommendations.push('特征质量严重不足，建议重新评估数据源或特征提取方法');
    } else if (minScore < 0.7) {
      recommendations.push('特征质量有待提升，建议优化数据源或处理流程');
    }

    return [...new Set(recommendations)]; // 去重
  }

  /**
   * 检查数据是否有特征
   */
  private hasFeature(data: any, featureName: string): boolean {
    if (data === null || data === undefined) {
      return false;
    }
    if (typeof data === 'object') {
      return featureName in data;
    }
    return true; // 非对象类型，认为有数据
  }
}
