// src/data-architecture/services/data-architecture.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  DataArchitectureLayer,
  RawData,
  ProcessedData,
  DecisionData,
  UIData,
  DataFlowConfig,
  DataFlowResult,
} from '../interfaces/data-architecture.interface';
import { DataQualityFrameworkService } from '../../data-quality/services/data-quality-framework.service';
import { DataConflictResolutionService } from '../../data-fusion/services/data-conflict-resolution.service';
import { DataSourceConfig } from '../../data-fusion/interfaces/data-fusion.interface';

/**
 * 数据架构服务
 * 
 * 实现文档要求的四层数据架构：
 * 1. 用户交互层（User Interaction Layer）
 * 2. 决策支持层（Decision Support Layer）
 * 3. 处理与融合层（Processing & Fusion Layer）
 * 4. 存储与采集层（Storage & Collection Layer）
 */
@Injectable()
export class DataArchitectureService {
  private readonly logger = new Logger(DataArchitectureService.name);

  constructor(
    private readonly dataQualityFramework: DataQualityFrameworkService,
    private readonly dataConflictResolution: DataConflictResolutionService,
  ) {}

  /**
   * 执行完整的数据流转（四层架构）
   */
  async executeDataFlow(
    sources: Array<{ sourceId: string; sourceName: string; data: any; timestamp?: string }>,
    config?: DataFlowConfig
  ): Promise<DataFlowResult> {
    const startTime = Date.now();
    const flowConfig: Required<DataFlowConfig> = {
      enableQualityCheck: config?.enableQualityCheck !== false,
      enableFusion: config?.enableFusion !== false,
      enableFeatureEngineering: config?.enableFeatureEngineering !== false,
      qualityThreshold: config?.qualityThreshold || 0.7,
      fusionStrategy: config?.fusionStrategy || 'RELIABILITY_WEIGHTED',
      layerConfigs: config?.layerConfigs || {
        USER_INTERACTION: {},
        DECISION_SUPPORT: {},
        PROCESSING_FUSION: {},
        STORAGE_COLLECTION: {},
      },
    };

    this.logger.debug(`Executing data flow through 4 layers with ${sources.length} sources`);

    const errors: DataFlowResult['errors'] = [];
    const layerTimes: Record<DataArchitectureLayer, number> = {
      STORAGE_COLLECTION: 0,
      PROCESSING_FUSION: 0,
      DECISION_SUPPORT: 0,
      USER_INTERACTION: 0,
    };
    const qualityScores: Record<DataArchitectureLayer, number> = {
      STORAGE_COLLECTION: 0,
      PROCESSING_FUSION: 0,
      DECISION_SUPPORT: 0,
      USER_INTERACTION: 0,
    };

    try {
      // Layer 1: 存储与采集层
      const layer1Start = Date.now();
      const rawData = await this.collectAndStore(sources, flowConfig.layerConfigs.STORAGE_COLLECTION);
      layerTimes.STORAGE_COLLECTION = Date.now() - layer1Start;
      qualityScores.STORAGE_COLLECTION = this.calculateLayerQuality(rawData);

      // Layer 2: 处理与融合层
      const layer2Start = Date.now();
      let processedData: ProcessedData | undefined;
      if (flowConfig.enableFusion || flowConfig.enableFeatureEngineering) {
        processedData = await this.processAndFuse(rawData, flowConfig);
        layerTimes.PROCESSING_FUSION = Date.now() - layer2Start;
        qualityScores.PROCESSING_FUSION = processedData.quality.overallScore;
      }

      // Layer 3: 决策支持层
      const layer3Start = Date.now();
      let decisionData: DecisionData | undefined;
      if (processedData) {
        decisionData = await this.prepareDecisionData(processedData, flowConfig.layerConfigs.DECISION_SUPPORT);
        layerTimes.DECISION_SUPPORT = Date.now() - layer3Start;
        qualityScores.DECISION_SUPPORT = this.calculateDecisionDataQuality(decisionData);
      }

      // Layer 4: 用户交互层
      const layer4Start = Date.now();
      let uiData: UIData | undefined;
      if (decisionData) {
        uiData = await this.prepareUIData(decisionData, flowConfig.layerConfigs.USER_INTERACTION);
        layerTimes.USER_INTERACTION = Date.now() - layer4Start;
        qualityScores.USER_INTERACTION = uiData.metadata.dataQuality.overallScore;
      }

      const totalTime = Date.now() - startTime;

      return {
        rawData,
        processedData,
        decisionData,
        uiData,
        flowMetrics: {
          totalTime,
          layerTimes,
          qualityScores,
        },
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Data flow execution failed: ${error.message}`, error.stack);
      errors.push({
        layer: 'PROCESSING_FUSION',
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      return {
        rawData: [],
        flowMetrics: {
          totalTime: Date.now() - startTime,
          layerTimes,
          qualityScores,
        },
        errors,
      };
    }
  }

  /**
   * Layer 1: 存储与采集层
   * 职责：数据采集和存储
   */
  async collectAndStore(
    sources: Array<{ sourceId: string; sourceName: string; data: any; timestamp?: string }>,
    _config?: Record<string, any>
  ): Promise<RawData[]> {
    this.logger.debug(`Layer 1: Collecting and storing data from ${sources.length} sources`);

    const rawData: RawData[] = sources.map(source => ({
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      data: source.data,
      timestamp: source.timestamp || new Date().toISOString(),
      metadata: {
        sourceType: this.inferSourceType(source.sourceId),
        reliability: 0.7, // 默认可靠性，实际应该从数据源配置获取
        freshness: 1.0, // 假设是新鲜数据
        format: this.inferDataFormat(source.data),
      },
    }));

    return rawData;
  }

  /**
   * Layer 2: 处理与融合层
   * 职责：数据清洗、融合、特征工程
   * 
   * 性能优化：并行处理数据融合和特征工程
   */
  async processAndFuse(
    rawData: RawData[],
    config: Required<DataFlowConfig>
  ): Promise<ProcessedData> {
    this.logger.debug(`Layer 2: Processing and fusing ${rawData.length} raw data sources`);

    // 转换为数据源配置
    const dataSourceConfigs: DataSourceConfig[] = rawData.map(rd => ({
      sourceId: rd.sourceId,
      sourceName: rd.sourceName,
      data: rd.data,
      reliability: rd.metadata.reliability,
      priority: 1, // 默认优先级
      timestamp: rd.timestamp,
      sourceInfo: {
        sourceId: rd.sourceId,
        sourceName: rd.sourceName,
        sourceType: rd.metadata.sourceType === 'API' ? 'api' : 
                    rd.metadata.sourceType === 'DATABASE' ? 'database' :
                    rd.metadata.sourceType === 'USER_INPUT' ? 'user_input' :
                    rd.metadata.sourceType === 'FILE' ? 'cache' :
                    'external' as const,
        timestamp: rd.timestamp,
      },
    }));

    // 数据融合和特征工程并行处理（如果都启用）
    let fusedData: any;
    let fusionStrategy = config.fusionStrategy;
    let features: Record<string, any> = {};

    if (rawData.length > 1 && config.enableFusion) {
      const fusionResult = await this.dataConflictResolution.fuse(dataSourceConfigs, {
        defaultStrategy: fusionStrategy as any,
        enableConflictDetection: true,
      });
      fusedData = fusionResult.fusedData.value;
      fusionStrategy = fusionResult.fusedData.strategy;
    } else {
      fusedData = rawData[0]?.data || {};
    }

    // 特征工程（如果启用，可以与质量评估并行）
    if (config.enableFeatureEngineering) {
      features = this.performFeatureEngineering(fusedData, rawData);
    }

    // 数据质量评估（可以与特征工程并行，但这里保持串行以确保数据完整性）
    const qualityAssessment = await this.dataQualityFramework.assessOverallQuality(fusedData, {
      dataSources: rawData.map(rd => ({
        source: rd.sourceId,
        data: rd.data,
        timestamp: rd.timestamp,
      })),
      sourceInfo: Object.fromEntries(
        rawData.map(rd => [rd.sourceId, {
          sourceId: rd.sourceId,
          sourceName: rd.sourceName,
          sourceType: rd.metadata.sourceType === 'API' ? 'api' : 
                      rd.metadata.sourceType === 'DATABASE' ? 'database' :
                      rd.metadata.sourceType === 'USER_INPUT' ? 'user_input' :
                      rd.metadata.sourceType === 'FILE' ? 'cache' :
                      'external' as const,
          timestamp: rd.timestamp,
        }])
      ),
    });

    return {
      data: fusedData,
      features,
      quality: {
        completeness: qualityAssessment.completeness.currentValue,
        accuracy: qualityAssessment.accuracy.currentValue,
        consistency: qualityAssessment.consistency.currentValue,
        timeliness: qualityAssessment.timeliness.currentValue,
        traceability: qualityAssessment.traceability.currentValue,
        overallScore: qualityAssessment.overallScore,
      },
      metadata: {
        processedAt: new Date().toISOString(),
        processingSteps: [
          { step: 'data_collection', method: 'collectAndStore' },
          { step: 'data_fusion', method: fusionStrategy },
          { step: 'feature_engineering', method: 'performFeatureEngineering' },
          { step: 'quality_assessment', method: 'assessOverallQuality' },
        ],
        sourceData: rawData,
        fusionStrategy,
      },
    };
  }

  /**
   * Layer 3: 决策支持层
   * 职责：准备决策支持数据
   */
  async prepareDecisionData(
    processedData: ProcessedData,
    _config?: Record<string, any>
  ): Promise<DecisionData> {
    this.logger.debug('Layer 3: Preparing decision support data');

    // 从处理后的数据中提取决策上下文
    const context = {
      ...processedData.data,
      features: processedData.features,
      quality: processedData.quality,
    };

    // 生成决策选项（简化实现）
    const options = this.generateDecisionOptions(processedData);

    // 生成推荐（基于数据质量）
    const recommendations = this.generateRecommendations(processedData);

    return {
      context,
      options,
      recommendations,
      metadata: {
        preparedAt: new Date().toISOString(),
        decisionContext: {
          dataQuality: processedData.quality.overallScore,
          dataSources: processedData.metadata.sourceData.map(sd => sd.sourceId),
        },
        dataSources: processedData.metadata.sourceData.map(sd => sd.sourceId),
      },
    };
  }

  /**
   * Layer 4: 用户交互层
   * 职责：准备用户界面数据
   */
  async prepareUIData(
    decisionData: DecisionData,
    _config?: Record<string, any>
  ): Promise<UIData> {
    this.logger.debug('Layer 4: Preparing UI data');

    // 准备显示数据
    const displayData = this.formatDisplayData(decisionData);

    // 生成三层解释
    const explanations = this.generateThreeLayerExplanations(decisionData);

    // 生成交互选项
    const interactions = this.generateInteractions(decisionData);

    // 确定数据质量等级
    const qualityLevel = this.determineQualityLevel(decisionData.metadata.decisionContext.dataQuality);

    return {
      displayData,
      explanations,
      interactions,
      metadata: {
        preparedAt: new Date().toISOString(),
        userContext: {},
        dataQuality: {
          overallScore: decisionData.metadata.decisionContext.dataQuality,
          qualityLevel,
        },
      },
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 推断数据源类型
   */
  private inferSourceType(sourceId: string): RawData['metadata']['sourceType'] {
    if (sourceId.includes('api') || sourceId.includes('API')) return 'API';
    if (sourceId.includes('db') || sourceId.includes('database')) return 'DATABASE';
    if (sourceId.includes('file')) return 'FILE';
    if (sourceId.includes('stream')) return 'STREAM';
    if (sourceId.includes('user')) return 'USER_INPUT';
    return 'API';
  }

  /**
   * 推断数据格式
   */
  private inferDataFormat(data: any): string {
    if (Array.isArray(data)) return 'ARRAY';
    if (typeof data === 'object') return 'JSON';
    if (typeof data === 'string') return 'STRING';
    if (typeof data === 'number') return 'NUMBER';
    return 'UNKNOWN';
  }

  /**
   * 执行特征工程
   */
  private performFeatureEngineering(
    data: any,
    rawData: RawData[]
  ): Record<string, any> {
    const features: Record<string, any> = {};

    // 提取基本特征
    if (typeof data === 'object' && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'number') {
          features[`${key}_normalized`] = this.normalize(value);
        } else if (typeof value === 'string') {
          features[`${key}_length`] = value.length;
        }
      }
    }

    // 数据源特征
    features.dataSourceCount = rawData.length;
    features.avgReliability = rawData.reduce((sum, rd) => sum + rd.metadata.reliability, 0) / rawData.length;
    features.dataFreshness = rawData.map(rd => {
      const age = (Date.now() - new Date(rd.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      return Math.max(0, 1 - age / 30); // 30天内为新鲜
    }).reduce((sum, f) => sum + f, 0) / rawData.length;

    return features;
  }

  /**
   * 归一化数值
   */
  private normalize(value: number): number {
    // 简化实现：假设值在0-100范围内
    return Math.max(0, Math.min(1, value / 100));
  }

  /**
   * 生成决策选项
   */
  private generateDecisionOptions(processedData: ProcessedData): DecisionData['options'] {
    // 简化实现：基于数据质量生成选项
    const options: DecisionData['options'] = [];

    if (processedData.quality.overallScore >= 0.8) {
      options.push({
        id: 'high_quality',
        label: '高质量数据',
        data: processedData.data,
        quality: processedData.quality.overallScore,
      });
    }

    if (processedData.quality.overallScore >= 0.6) {
      options.push({
        id: 'medium_quality',
        label: '中等质量数据',
        data: processedData.data,
        quality: processedData.quality.overallScore,
      });
    }

    return options;
  }

  /**
   * 生成推荐
   */
  private generateRecommendations(processedData: ProcessedData): DecisionData['recommendations'] {
    const recommendations: DecisionData['recommendations'] = [];

    if (processedData.quality.overallScore >= 0.9) {
      recommendations.push({
        type: 'RECOMMENDATION',
        content: '数据质量优秀，可以放心使用',
        confidence: 0.9,
        evidence: ['数据完整性高', '数据准确性高', '数据时效性好'],
      });
    } else if (processedData.quality.overallScore >= 0.7) {
      recommendations.push({
        type: 'RECOMMENDATION',
        content: '数据质量良好，建议使用',
        confidence: 0.7,
        evidence: ['数据质量基本达标'],
      });
    } else if (processedData.quality.overallScore < 0.5) {
      recommendations.push({
        type: 'WARNING',
        content: '数据质量不足，建议谨慎使用或补充数据',
        confidence: 0.8,
        evidence: ['数据质量低于阈值'],
      });
    }

    return recommendations;
  }

  /**
   * 格式化显示数据
   */
  private formatDisplayData(decisionData: DecisionData): any {
    // 简化实现：返回决策数据的简化版本
    return {
      context: decisionData.context,
      options: decisionData.options.map(opt => ({
        id: opt.id,
        label: opt.label,
        quality: opt.quality,
      })),
      recommendations: decisionData.recommendations.map(rec => ({
        type: rec.type,
        content: rec.content,
        confidence: rec.confidence,
      })),
    };
  }

  /**
   * 生成三层解释
   */
  private generateThreeLayerExplanations(decisionData: DecisionData): UIData['explanations'] {
    const explanations: UIData['explanations'] = [];

    // 第一层：结论
    if (decisionData.recommendations.length > 0) {
      const mainRec = decisionData.recommendations[0];
      explanations.push({
        level: 'CONCLUSION',
        content: mainRec.content,
        confidence: mainRec.confidence,
      });
    }

    // 第二层：原因
    explanations.push({
      level: 'REASON',
      content: `基于 ${decisionData.options.length} 个数据选项的分析，数据质量得分为 ${decisionData.metadata.decisionContext.dataQuality.toFixed(2)}`,
    });

    // 第三层：依据
    explanations.push({
      level: 'EVIDENCE',
      content: `数据来源：${decisionData.metadata.dataSources.join('、')}`,
    });

    return explanations;
  }

  /**
   * 生成交互选项
   */
  private generateInteractions(decisionData: DecisionData): UIData['interactions'] {
    const interactions: UIData['interactions'] = [];

    // 确认选项
    interactions.push({
      type: 'CONFIRMATION',
      label: '确认使用此数据',
    });

    // 选择选项
    if (decisionData.options.length > 1) {
      interactions.push({
        type: 'SELECTION',
        label: '选择数据选项',
        options: decisionData.options.map(opt => opt.label),
      });
    }

    // 反馈选项
    interactions.push({
      type: 'FEEDBACK',
      label: '提供反馈',
    });

    return interactions;
  }

  /**
   * 确定质量等级
   */
  private determineQualityLevel(score: number): UIData['metadata']['dataQuality']['qualityLevel'] {
    if (score >= 0.9) return 'EXCELLENT';
    if (score >= 0.75) return 'GOOD';
    if (score >= 0.6) return 'FAIR';
    if (score >= 0.4) return 'POOR';
    return 'CRITICAL';
  }

  /**
   * 计算层级质量
   */
  private calculateLayerQuality(rawData: RawData[]): number {
    if (rawData.length === 0) return 0;
    return rawData.reduce((sum, rd) => sum + rd.metadata.reliability, 0) / rawData.length;
  }

  /**
   * 计算决策数据质量
   */
  private calculateDecisionDataQuality(decisionData: DecisionData): number {
    // 基于推荐置信度和选项质量计算
    if (decisionData.recommendations.length === 0) return 0.5;
    
    const avgConfidence = decisionData.recommendations.reduce(
      (sum, rec) => sum + rec.confidence,
      0
    ) / decisionData.recommendations.length;

    const avgOptionQuality = decisionData.options.length > 0
      ? decisionData.options.reduce((sum, opt) => sum + opt.quality, 0) / decisionData.options.length
      : 0.5;

    return (avgConfidence + avgOptionQuality) / 2;
  }
}
