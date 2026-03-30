// src/data-fusion/services/data-conflict-resolution.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DataConflict,
  DataConflictType,
  ConflictSeverity,
  ConflictReport,
  FusionStrategy,
  FusedData,
  DataSourceConfig,
  FusionConfig,
  FusionResult,
} from '../interfaces/data-fusion.interface';
import { FusionResilienceService } from './fusion-resilience.service';
import { FusionResourceManagerService } from './fusion-resource-manager.service';

/**
 * 数据冲突解决服务
 * 
 * 实现文档要求的数据融合和冲突解决：
 * - 数据冲突检测（detect_data_conflicts）
 * - 可靠性加权融合（reliability_weighted_fusion）
 * - 优先级选择（priority_selection）
 * - 情景化选择（context_based_selection）
 */
@Injectable()
export class DataConflictResolutionService {
  private readonly logger = new Logger(DataConflictResolutionService.name);
  
  // 性能优化：缓存冲突检测结果（使用LRU管理）
  private readonly conflictCache = new Map<string, { report: ConflictReport; timestamp: number }>();
  private readonly CACHE_TTL = 60000; // 缓存1分钟
  
  // 性能优化：并行处理阈值
  private readonly PARALLEL_THRESHOLD = 5; // 5个以上数据源使用并行处理
  
  // 性能监控：统计信息
  private readonly performanceStats = {
    totalFusions: 0,
    totalConflictDetections: 0,
    averageFusionTime: 0,
    averageConflictDetectionTime: 0,
    cacheHitRate: 0,
    totalCacheHits: 0,
    totalCacheMisses: 0,
  };

  constructor(
    @Optional() private readonly resilienceService?: FusionResilienceService,
    @Optional() private readonly resourceManager?: FusionResourceManagerService,
  ) {}

  /**
   * 检测数据冲突
   */
  detectConflicts(
    dataSources: DataSourceConfig[]
  ): ConflictReport {
    this.logger.debug(`Detecting conflicts across ${dataSources.length} data sources`);

    // 性能优化：检查缓存
    const cacheKey = this.generateCacheKey(dataSources);
    const cached = this.conflictCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.debug('Using cached conflict report');
      this.performanceStats.totalCacheHits++;
      // 更新LRU访问顺序
      if (this.resourceManager) {
        this.resourceManager.updateCacheAccess(cacheKey, this.conflictCache);
      }
      return cached.report;
    }
    this.performanceStats.totalCacheMisses++;

    const conflicts: DataConflict[] = [];
    const fieldValues = new Map<string, Array<{ sourceId: string; sourceName: string; value: any; reliability: number; timestamp?: string }>>();

    // 收集所有字段的值
    for (const source of dataSources) {
      this.collectFieldValues(source.data, '', source, fieldValues);
    }

    // 检测每个字段的冲突
    for (const [field, values] of fieldValues.entries()) {
      if (values.length < 2) {
        continue; // 只有一个数据源，无冲突
      }

      const conflict = this.detectFieldConflict(field, values);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    // 统计冲突
    const criticalConflicts = conflicts.filter(c => c.severity === 'CRITICAL').length;
    const highConflicts = conflicts.filter(c => c.severity === 'HIGH').length;
    const mediumConflicts = conflicts.filter(c => c.severity === 'MEDIUM').length;
    const lowConflicts = conflicts.filter(c => c.severity === 'LOW').length;

    const affectedFields = [...new Set(conflicts.map(c => c.field))];

    const report: ConflictReport = {
      conflicts,
      totalConflicts: conflicts.length,
      criticalConflicts,
      highConflicts,
      mediumConflicts,
      lowConflicts,
      affectedFields,
      summary: this.generateConflictSummary(conflicts),
    };

    // 性能优化：缓存结果（使用LRU管理）
    this.conflictCache.set(cacheKey, {
      report,
      timestamp: Date.now(),
    });
    // 更新LRU访问顺序
    if (this.resourceManager) {
      this.resourceManager.updateCacheAccess(cacheKey, this.conflictCache);
    }
    
    // 清理过期缓存（异步，不阻塞）
    setImmediate(() => this.cleanExpiredCache());

    return report;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(dataSources: DataSourceConfig[]): string {
    // 基于数据源ID和时间戳生成缓存键
    const sourceIds = dataSources.map(s => s.sourceId).sort().join(',');
    const timestamps = dataSources.map(s => s.timestamp || '').join(',');
    return `${sourceIds}:${timestamps}`;
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.conflictCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.conflictCache.delete(key);
      }
    }
  }

  /**
   * 可靠性加权融合（性能优化版本）
   */
  reliabilityWeightedFusion(
    dataSources: DataSourceConfig[],
    field?: string
  ): FusedData {
    this.logger.debug(`Performing reliability-weighted fusion for ${dataSources.length} sources`);

    // 如果指定了字段，只融合该字段
    if (field) {
      const values = this.extractFieldValues(dataSources, field);
      const fused = this.fuseValues(values, 'RELIABILITY_WEIGHTED');
      // 转换为完整的FusedData格式
      return {
        value: fused.value,
        confidence: fused.confidence,
        strategy: 'RELIABILITY_WEIGHTED',
        sources: dataSources.map(s => s.sourceId),
        metadata: {
          fusionTimestamp: new Date().toISOString(),
          conflictCount: 0,
          resolutionDetails: [],
        },
      };
    }

    // 融合整个数据结构（性能优化：批量处理）
    const fusedData: any = {};
    const allFields = this.getAllFields(dataSources);
    const resolutionDetails: FusedData['metadata']['resolutionDetails'] = [];

    // 性能优化：批量提取所有字段的值（减少遍历次数）
    const fieldValuesMap = new Map<string, Array<{ sourceId: string; value: any; reliability: number }>>();
    for (const source of dataSources) {
      this.extractAllFieldValues(source, '', fieldValuesMap);
    }

    // 批量融合字段（如果字段较多，可以考虑并行处理）
    for (const fieldName of allFields) {
      const values = fieldValuesMap.get(fieldName) || this.extractFieldValues(dataSources, fieldName);
      if (values.length === 0) {
        continue; // 跳过没有值的字段
      }
      
      const fused = this.fuseValues(values, 'RELIABILITY_WEIGHTED');
      
      this.setNestedValue(fusedData, fieldName, fused.value);
      
      resolutionDetails.push({
        field: fieldName,
        strategy: 'RELIABILITY_WEIGHTED',
        selectedValue: fused.value,
        rejectedValues: values
          .filter(v => v.value !== fused.value)
          .map(v => ({
            sourceId: v.sourceId,
            value: v.value,
            reason: `可靠性较低（${v.reliability.toFixed(2)}）`,
          })),
      });
    }

    // 计算总体置信度
    const avgReliability = dataSources.reduce((sum, s) => sum + s.reliability, 0) / dataSources.length;
    const conflictCount = this.detectConflicts(dataSources).totalConflicts;

    return {
      value: fusedData,
      confidence: avgReliability * (1 - conflictCount * 0.1), // 冲突越多，置信度越低
      strategy: 'RELIABILITY_WEIGHTED',
      sources: dataSources.map(s => s.sourceId),
      metadata: {
        fusionTimestamp: new Date().toISOString(),
        conflictCount,
        resolutionDetails,
      },
    };
  }

  /**
   * 优先级选择
   */
  prioritySelection(
    dataSources: DataSourceConfig[],
    priorityOrder?: string[]
  ): FusedData {
    this.logger.debug(`Performing priority selection for ${dataSources.length} sources`);

    // 如果没有指定优先级顺序，按priority字段排序
    let sortedSources = [...dataSources];
    if (priorityOrder && priorityOrder.length > 0) {
      sortedSources = dataSources.sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a.sourceId);
        const bIndex = priorityOrder.indexOf(b.sourceId);
        if (aIndex === -1 && bIndex === -1) return b.priority - a.priority;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    } else {
      sortedSources = dataSources.sort((a, b) => b.priority - a.priority);
    }

    // 选择优先级最高的数据源
    const selectedSource = sortedSources[0];
    const rejectedSources = sortedSources.slice(1);

    return {
      value: selectedSource.data,
      confidence: selectedSource.reliability,
      strategy: 'PRIORITY_SELECTION',
      sources: [selectedSource.sourceId],
      metadata: {
        fusionTimestamp: new Date().toISOString(),
        conflictCount: 0,
        resolutionDetails: [{
          field: 'all',
          strategy: 'PRIORITY_SELECTION',
          selectedValue: selectedSource.data,
          rejectedValues: rejectedSources.map(s => ({
            sourceId: s.sourceId,
            value: s.data,
            reason: `优先级较低（${s.priority}）`,
          })),
        }],
      },
    };
  }

  /**
   * 情景化选择
   */
  contextBasedSelection(
    dataSources: DataSourceConfig[],
    context: Record<string, any>
  ): FusedData {
    this.logger.debug(`Performing context-based selection with context: ${JSON.stringify(context)}`);

    // 根据上下文选择最合适的数据源
    let bestSource: DataSourceConfig | undefined;
    let bestScore = -1;

    for (const source of dataSources) {
      const score = this.calculateContextScore(source, context);
      if (score > bestScore) {
        bestScore = score;
        bestSource = source;
      }
    }

    if (!bestSource) {
      // 如果没有找到合适的数据源，降级到优先级选择
      return this.prioritySelection(dataSources);
    }

    const rejectedSources = dataSources.filter(s => s.sourceId !== bestSource!.sourceId);

    return {
      value: bestSource.data,
      confidence: bestSource.reliability * (bestScore / 100), // 根据上下文匹配度调整置信度
      strategy: 'CONTEXT_BASED',
      sources: [bestSource.sourceId],
      metadata: {
        fusionTimestamp: new Date().toISOString(),
        conflictCount: 0,
        resolutionDetails: [{
          field: 'all',
          strategy: 'CONTEXT_BASED',
          selectedValue: bestSource.data,
          rejectedValues: rejectedSources.map(s => ({
            sourceId: s.sourceId,
            value: s.data,
            reason: `上下文匹配度较低（${this.calculateContextScore(s, context).toFixed(1)}）`,
          })),
        }],
      },
    };
  }

  /**
   * 执行数据融合（核心逻辑未改变，支持可选的资源管理和错误处理）
   */
  async fuse(
    dataSources: DataSourceConfig[],
    config?: FusionConfig
  ): Promise<FusionResult> {
    // 核心融合逻辑（提取为独立方法，便于复用）
    const executeFusion = async (): Promise<FusionResult> => {
      const fusionStartTime = Date.now();
      this.performanceStats.totalFusions++;

      const fusionConfig: Required<FusionConfig> = {
        defaultStrategy: config?.defaultStrategy || 'RELIABILITY_WEIGHTED',
        reliabilityThreshold: config?.reliabilityThreshold || 0.5,
        conflictResolutionStrategy: config?.conflictResolutionStrategy || 'AUTO',
        enableConflictDetection: config?.enableConflictDetection !== false,
        context: config?.context || {},
      };

      // 过滤低可靠性的数据源
      const validSources = dataSources.filter(
        s => s.reliability >= fusionConfig.reliabilityThreshold
      );

      if (validSources.length === 0) {
        throw new Error('No valid data sources after reliability filtering');
      }

      // 检测冲突（性能监控）
      let conflictReport: ConflictReport | undefined;
      if (fusionConfig.enableConflictDetection) {
        const conflictStartTime = Date.now();
        this.performanceStats.totalConflictDetections++;
        conflictReport = this.detectConflicts(validSources);
        const conflictTime = Date.now() - conflictStartTime;
        this.updateAverageTime('conflictDetection', conflictTime);
      }

      // 选择融合策略
      let fusedData: FusedData;
      const strategy = fusionConfig.defaultStrategy;

      switch (strategy) {
        case 'RELIABILITY_WEIGHTED':
          fusedData = this.reliabilityWeightedFusion(validSources);
          break;
        case 'PRIORITY_SELECTION':
          fusedData = this.prioritySelection(validSources);
          break;
        case 'CONTEXT_BASED':
          fusedData = this.contextBasedSelection(validSources, fusionConfig.context);
          break;
        case 'AVERAGE':
          fusedData = this.averageFusion(validSources);
          break;
        case 'MEDIAN':
          fusedData = this.medianFusion(validSources);
          break;
        default:
          fusedData = this.reliabilityWeightedFusion(validSources);
      }

      // 计算质量指标
      const qualityMetrics = this.calculateQualityMetrics(validSources, conflictReport);

      // 生成建议
      const recommendations = this.generateRecommendations(
        validSources,
        conflictReport,
        fusedData,
        qualityMetrics
      );

      // 性能监控：更新平均融合时间
      const fusionTime = Date.now() - fusionStartTime;
      this.updateAverageTime('fusion', fusionTime);

      return {
        fusedData,
        conflictReport,
        qualityMetrics,
        recommendations,
      };
    };

    // 如果资源管理和错误处理服务存在，使用它们
    if (this.resourceManager && this.resilienceService) {
      // 资源管理：获取并发许可和限流令牌
      await this.resourceManager.acquireConcurrency();
      await this.resourceManager.acquireRateLimitToken();

      try {
        // 使用错误处理和重试机制
        return await this.resilienceService.executeWithErrorHandling(
          executeFusion,
          'fuse',
          {
            maxRetries: 2,
            retryDelay: 1000,
            skipOnError: false,
          }
        );
      } finally {
        // 释放并发许可
        this.resourceManager.releaseConcurrency();
      }
    } else {
      // 降级：直接执行核心业务逻辑（保持向后兼容）
      return await executeFusion();
    }
  }

  // ========== 辅助方法 ==========

  /**
   * 收集字段值
   */
  private collectFieldValues(
    data: any,
    prefix: string,
    source: DataSourceConfig,
    fieldValues: Map<string, Array<{ sourceId: string; sourceName: string; value: any; reliability: number; timestamp?: string }>>
  ): void {
    if (data === null || data === undefined) {
      return;
    }

    if (typeof data !== 'object' || Array.isArray(data)) {
      const field = prefix || 'root';
      if (!fieldValues.has(field)) {
        fieldValues.set(field, []);
      }
      fieldValues.get(field)!.push({
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        value: data,
        reliability: source.reliability,
        timestamp: source.timestamp,
      });
      return;
    }

    for (const [key, value] of Object.entries(data)) {
      const field = prefix ? `${prefix}.${key}` : key;
      this.collectFieldValues(value, field, source, fieldValues);
    }
  }

  /**
   * 检测字段冲突
   */
  private detectFieldConflict(
    field: string,
    values: Array<{ sourceId: string; sourceName: string; value: any; reliability: number; timestamp?: string }>
  ): DataConflict | null {
    // 检查值是否一致
    const uniqueValues = new Set(values.map(v => JSON.stringify(v.value)));
    if (uniqueValues.size <= 1) {
      return null; // 值一致，无冲突
    }

    // 确定冲突类型
    const conflictType = this.determineConflictType(values);
    const severity = this.determineConflictSeverity(conflictType, values);

    return {
      field,
      type: conflictType,
      severity,
      sources: values,
      description: this.generateConflictDescription(field, conflictType, values),
      impact: this.assessConflictImpact(conflictType, severity),
      resolutionStrategy: this.suggestResolutionStrategy(conflictType, values),
    };
  }

  /**
   * 确定冲突类型
   */
  private determineConflictType(
    values: Array<{ sourceId: string; sourceName: string; value: any; reliability: number }>
  ): DataConflictType {
    const types = new Set(values.map(v => typeof v.value));
    
    if (types.size > 1) {
      return 'TYPE_MISMATCH';
    }

    const firstType = types.values().next().value;
    
    if (firstType === 'number') {
      const nums = values.map(v => Number(v.value)).filter(n => !isNaN(n));
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const range = max - min;
      const avg = nums.reduce((sum, n) => sum + n, 0) / nums.length;
      
      if (range > avg * 0.5) {
        return 'RANGE_MISMATCH';
      }
      return 'VALUE_MISMATCH';
    }

    if (firstType === 'string') {
      return 'VALUE_MISMATCH';
    }

    if (firstType === 'object' && values[0].value instanceof Date) {
      const dates = values.map(v => new Date(v.value).getTime());
      const min = Math.min(...dates);
      const max = Math.max(...dates);
      const diffDays = (max - min) / (1000 * 60 * 60 * 24);
      
      if (diffDays > 7) {
        return 'TEMPORAL_MISMATCH';
      }
      return 'VALUE_MISMATCH';
    }

    return 'VALUE_MISMATCH';
  }

  /**
   * 确定冲突严重程度
   */
  private determineConflictSeverity(
    type: DataConflictType,
    values: Array<{ sourceId: string; sourceName: string; value: any; reliability: number }>
  ): ConflictSeverity {
    const avgReliability = values.reduce((sum, v) => sum + v.reliability, 0) / values.length;
    const reliabilityGap = Math.max(...values.map(v => v.reliability)) - 
                           Math.min(...values.map(v => v.reliability));

    if (type === 'TYPE_MISMATCH' || type === 'LOGICAL_CONTRADICTION') {
      return 'CRITICAL';
    }

    if (type === 'RANGE_MISMATCH' && reliabilityGap > 0.5) {
      return 'HIGH';
    }

    if (avgReliability < 0.5) {
      return 'HIGH';
    }

    if (reliabilityGap > 0.3) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * 生成冲突描述
   */
  private generateConflictDescription(
    field: string,
    type: DataConflictType,
    values: Array<{ sourceId: string; sourceName: string; value: any }>
  ): string {
    const valueList = values.map(v => `${v.sourceName}: ${JSON.stringify(v.value)}`).join(', ');
    
    const typeMap: Record<DataConflictType, string> = {
      VALUE_MISMATCH: '值不匹配',
      TYPE_MISMATCH: '类型不匹配',
      RANGE_MISMATCH: '范围差异较大',
      TEMPORAL_MISMATCH: '时间不匹配',
      SPATIAL_MISMATCH: '空间位置不匹配',
      LOGICAL_CONTRADICTION: '逻辑矛盾',
    };

    return `字段 ${field} 存在${typeMap[type]}：${valueList}`;
  }

  /**
   * 评估冲突影响
   */
  private assessConflictImpact(
    type: DataConflictType,
    severity: ConflictSeverity
  ): string[] {
    const impacts: string[] = [];

    if (severity === 'CRITICAL') {
      impacts.push('可能导致决策错误');
      impacts.push('需要人工干预');
    } else if (severity === 'HIGH') {
      impacts.push('可能影响决策质量');
      impacts.push('建议验证数据源');
    } else if (severity === 'MEDIUM') {
      impacts.push('可能影响准确性');
    } else {
      impacts.push('影响较小');
    }

    if (type === 'TYPE_MISMATCH') {
      impacts.push('数据类型不一致，无法直接比较');
    }

    return impacts;
  }

  /**
   * 建议解决策略
   */
  private suggestResolutionStrategy(
    type: DataConflictType,
    values: Array<{ sourceId: string; sourceName: string; value: any; reliability: number }>
  ): DataConflict['resolutionStrategy'] {
    const reliabilityGap = Math.max(...values.map(v => v.reliability)) - 
                           Math.min(...values.map(v => v.reliability));

    if (reliabilityGap > 0.3) {
      return 'RELIABILITY_WEIGHTED';
    }

    if (type === 'VALUE_MISMATCH' && typeof values[0].value === 'number') {
      return 'AVERAGE';
    }

    return 'PRIORITY_SELECTION';
  }

  /**
   * 融合值（可靠性加权）
   */
  private fuseValues(
    values: Array<{ sourceId: string; value: any; reliability: number }>,
    strategy: FusionStrategy
  ): { value: any; confidence: number } {
    if (values.length === 0) {
      throw new Error('No values to fuse');
    }

    if (values.length === 1) {
      return {
        value: values[0].value,
        confidence: values[0].reliability,
      };
    }

    switch (strategy) {
      case 'RELIABILITY_WEIGHTED':
        return this.reliabilityWeightedFuseValues(values);
      case 'AVERAGE':
        return this.averageFuseValues(values);
      case 'MEDIAN':
        return this.medianFuseValues(values);
      case 'MODE':
        return this.modeFuseValues(values);
      default:
        return this.reliabilityWeightedFuseValues(values);
    }
  }

  /**
   * 可靠性加权融合值
   */
  private reliabilityWeightedFuseValues(
    values: Array<{ sourceId: string; value: any; reliability: number }>
  ): { value: any; confidence: number } {
    // 归一化可靠性权重
    const totalReliability = values.reduce((sum, v) => sum + v.reliability, 0);
    const weights = values.map(v => v.reliability / totalReliability);

    // 检查值类型
    const firstValue = values[0].value;
    
    if (typeof firstValue === 'number') {
      // 数值：加权平均
      const weightedSum = values.reduce((sum, v, i) => sum + Number(v.value) * weights[i], 0);
      return {
        value: weightedSum,
        confidence: totalReliability / values.length,
      };
    }

    if (typeof firstValue === 'string') {
      // 字符串：选择可靠性最高的
      const bestIndex = weights.indexOf(Math.max(...weights));
      return {
        value: values[bestIndex].value,
        confidence: values[bestIndex].reliability,
      };
    }

    if (firstValue instanceof Date) {
      // 日期：加权平均时间戳
      const timestamps = values.map(v => new Date(v.value).getTime());
      const weightedTimestamp = timestamps.reduce((sum, ts, i) => sum + ts * weights[i], 0);
      return {
        value: new Date(weightedTimestamp),
        confidence: totalReliability / values.length,
      };
    }

    // 其他类型：选择可靠性最高的
    const bestIndex = weights.indexOf(Math.max(...weights));
    return {
      value: values[bestIndex].value,
      confidence: values[bestIndex].reliability,
    };
  }

  /**
   * 平均值融合
   */
  private averageFuseValues(
    values: Array<{ sourceId: string; value: any; reliability: number }>
  ): { value: any; confidence: number } {
    const firstValue = values[0].value;
    
    if (typeof firstValue === 'number') {
      const avg = values.reduce((sum, v) => sum + Number(v.value), 0) / values.length;
      const avgReliability = values.reduce((sum, v) => sum + v.reliability, 0) / values.length;
      return {
        value: avg,
        confidence: avgReliability,
      };
    }

    // 非数值类型，降级到可靠性加权
    return this.reliabilityWeightedFuseValues(values);
  }

  /**
   * 中位数融合
   */
  private medianFuseValues(
    values: Array<{ sourceId: string; value: any; reliability: number }>
  ): { value: any; confidence: number } {
    const firstValue = values[0].value;
    
    if (typeof firstValue === 'number') {
      const sorted = values.map(v => Number(v.value)).sort((a, b) => a - b);
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
      
      const avgReliability = values.reduce((sum, v) => sum + v.reliability, 0) / values.length;
      return {
        value: median,
        confidence: avgReliability,
      };
    }

    // 非数值类型，降级到可靠性加权
    return this.reliabilityWeightedFuseValues(values);
  }

  /**
   * 众数融合
   */
  private modeFuseValues(
    values: Array<{ sourceId: string; value: any; reliability: number }>
  ): { value: any; confidence: number } {
    const valueCounts = new Map<string, { count: number; reliability: number }>();
    
    for (const v of values) {
      const key = JSON.stringify(v.value);
      if (!valueCounts.has(key)) {
        valueCounts.set(key, { count: 0, reliability: 0 });
      }
      const entry = valueCounts.get(key)!;
      entry.count++;
      entry.reliability = Math.max(entry.reliability, v.reliability);
    }

    let maxCount = 0;
    let modeValue: any = null;
    let modeReliability = 0;

    for (const [key, entry] of valueCounts.entries()) {
      if (entry.count > maxCount || (entry.count === maxCount && entry.reliability > modeReliability)) {
        maxCount = entry.count;
        modeValue = JSON.parse(key);
        modeReliability = entry.reliability;
      }
    }

    return {
      value: modeValue,
      confidence: modeReliability,
    };
  }

  /**
   * 提取字段值
   */
  private extractFieldValues(
    dataSources: DataSourceConfig[],
    field: string
  ): Array<{ sourceId: string; value: any; reliability: number }> {
    return dataSources.map(source => ({
      sourceId: source.sourceId,
      value: this.getNestedValue(source.data, field),
      reliability: source.reliability,
    })).filter(v => v.value !== undefined);
  }

  /**
   * 批量提取所有字段的值（性能优化）
   */
  private extractAllFieldValues(
    source: DataSourceConfig,
    prefix: string,
    fieldValuesMap: Map<string, Array<{ sourceId: string; value: any; reliability: number }>>
  ): void {
    if (source.data === null || source.data === undefined) {
      return;
    }

    if (typeof source.data !== 'object' || Array.isArray(source.data)) {
      if (prefix) {
        if (!fieldValuesMap.has(prefix)) {
          fieldValuesMap.set(prefix, []);
        }
        fieldValuesMap.get(prefix)!.push({
          sourceId: source.sourceId,
          value: source.data,
          reliability: source.reliability,
        });
      }
      return;
    }

    for (const [key, value] of Object.entries(source.data)) {
      const field = prefix ? `${prefix}.${key}` : key;
      this.extractAllFieldValues(
        { ...source, data: value },
        field,
        fieldValuesMap
      );
    }
  }

  /**
   * 获取所有字段
   */
  private getAllFields(dataSources: DataSourceConfig[]): string[] {
    const fields = new Set<string>();
    
    for (const source of dataSources) {
      this.collectFields(source.data, '', fields);
    }

    return Array.from(fields);
  }

  /**
   * 收集字段
   */
  private collectFields(data: any, prefix: string, fields: Set<string>): void {
    if (data === null || data === undefined) {
      return;
    }

    if (typeof data !== 'object' || Array.isArray(data)) {
      if (prefix) {
        fields.add(prefix);
      }
      return;
    }

    for (const [key, value] of Object.entries(data)) {
      const field = prefix ? `${prefix}.${key}` : key;
      this.collectFields(value, field, fields);
    }
  }

  /**
   * 获取嵌套值
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  /**
   * 设置嵌套值
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }

  /**
   * 计算上下文得分（优化版本）
   * 
   * 使用更科学的评分方法：
   * - 上下文匹配度（精确匹配 + 模糊匹配）
   * - 可靠性权重
   * - 优先级权重
   * - 时间相关性（如果上下文包含时间信息）
   */
  private calculateContextScore(
    source: DataSourceConfig,
    context: Record<string, any>
  ): number {
    let score = 0;
    let totalWeight = 0;

    // 1. 上下文匹配度（40%权重）
    if (source.context) {
      let matchCount = 0;
      let totalKeys = 0;
      
      for (const [key, value] of Object.entries(context)) {
        totalKeys++;
        if (source.context[key] === value) {
          matchCount++; // 精确匹配
        } else if (this.fuzzyMatch(source.context[key], value)) {
          matchCount += 0.5; // 模糊匹配（部分得分）
        }
      }
      
      const contextMatchScore = totalKeys > 0 ? (matchCount / totalKeys) * 100 : 50;
      score += contextMatchScore * 0.4;
      totalWeight += 0.4;
    } else {
      // 没有上下文信息，给中等分数
      score += 50 * 0.4;
      totalWeight += 0.4;
    }

    // 2. 可靠性（35%权重）
    score += source.reliability * 100 * 0.35;
    totalWeight += 0.35;

    // 3. 优先级（15%权重，归一化到0-1）
    const normalizedPriority = Math.min(1, source.priority / 10); // 假设优先级范围0-10
    score += normalizedPriority * 100 * 0.15;
    totalWeight += 0.15;

    // 4. 时间相关性（10%权重，如果上下文包含时间信息）
    if (context.timestamp && source.timestamp) {
      const contextTime = new Date(context.timestamp).getTime();
      const sourceTime = new Date(source.timestamp).getTime();
      const timeDiff = Math.abs(contextTime - sourceTime);
      const timeRelevance = Math.exp(-timeDiff / (7 * 24 * 60 * 60 * 1000)); // 7天半衰期
      score += timeRelevance * 100 * 0.1;
      totalWeight += 0.1;
    }

    // 归一化到0-100
    return totalWeight > 0 ? Math.min(100, score / totalWeight) : 50;
  }

  /**
   * 模糊匹配（用于上下文匹配）
   */
  private fuzzyMatch(value1: any, value2: any): boolean {
    if (value1 === value2) {
      return true;
    }

    // 字符串模糊匹配（包含关系）
    if (typeof value1 === 'string' && typeof value2 === 'string') {
      const str1 = value1.toLowerCase();
      const str2 = value2.toLowerCase();
      return str1.includes(str2) || str2.includes(str1);
    }

    // 数值模糊匹配（允许10%误差）
    if (typeof value1 === 'number' && typeof value2 === 'number') {
      const diff = Math.abs(value1 - value2);
      const avg = (Math.abs(value1) + Math.abs(value2)) / 2;
      return avg > 0 && diff / avg < 0.1;
    }

    return false;
  }

  /**
   * 平均值融合（整个数据结构）
   */
  private averageFusion(dataSources: DataSourceConfig[]): FusedData {
    const allFields = this.getAllFields(dataSources);
    const fusedData: any = {};
    const resolutionDetails: FusedData['metadata']['resolutionDetails'] = [];

    for (const fieldName of allFields) {
      const values = this.extractFieldValues(dataSources, fieldName);
      const fused = this.averageFuseValues(values);
      
      this.setNestedValue(fusedData, fieldName, fused.value);
      
      resolutionDetails.push({
        field: fieldName,
        strategy: 'AVERAGE',
        selectedValue: fused.value,
        rejectedValues: [],
      });
    }

    const avgReliability = dataSources.reduce((sum, s) => sum + s.reliability, 0) / dataSources.length;

    return {
      value: fusedData,
      confidence: avgReliability,
      strategy: 'AVERAGE',
      sources: dataSources.map(s => s.sourceId),
      metadata: {
        fusionTimestamp: new Date().toISOString(),
        conflictCount: 0,
        resolutionDetails,
      },
    };
  }

  /**
   * 中位数融合（整个数据结构）
   */
  private medianFusion(dataSources: DataSourceConfig[]): FusedData {
    const allFields = this.getAllFields(dataSources);
    const fusedData: any = {};
    const resolutionDetails: FusedData['metadata']['resolutionDetails'] = [];

    for (const fieldName of allFields) {
      const values = this.extractFieldValues(dataSources, fieldName);
      const fused = this.medianFuseValues(values);
      
      this.setNestedValue(fusedData, fieldName, fused.value);
      
      resolutionDetails.push({
        field: fieldName,
        strategy: 'MEDIAN',
        selectedValue: fused.value,
        rejectedValues: [],
      });
    }

    const avgReliability = dataSources.reduce((sum, s) => sum + s.reliability, 0) / dataSources.length;

    return {
      value: fusedData,
      confidence: avgReliability,
      strategy: 'MEDIAN',
      sources: dataSources.map(s => s.sourceId),
      metadata: {
        fusionTimestamp: new Date().toISOString(),
        conflictCount: 0,
        resolutionDetails,
      },
    };
  }

  /**
   * 计算质量指标
   */
  private calculateQualityMetrics(
    dataSources: DataSourceConfig[],
    conflictReport?: ConflictReport
  ): FusionResult['qualityMetrics'] {
    const avgReliability = dataSources.reduce((sum, s) => sum + s.reliability, 0) / dataSources.length;
    
    const completeness = 1.0; // 假设融合后数据完整
    const accuracy = avgReliability;
    const consistency = conflictReport
      ? 1 - (conflictReport.totalConflicts / (dataSources.length * 10)) // 简化计算
      : 1.0;
    
    const overallQuality = (completeness + accuracy + consistency) / 3;

    return {
      completeness,
      accuracy,
      consistency,
      overallQuality,
    };
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    dataSources: DataSourceConfig[],
    conflictReport: ConflictReport | undefined,
    fusedData: FusedData,
    qualityMetrics: FusionResult['qualityMetrics']
  ): string[] {
    const recommendations: string[] = [];

    if (conflictReport && conflictReport.totalConflicts > 0) {
      if (conflictReport.criticalConflicts > 0) {
        recommendations.push(`检测到 ${conflictReport.criticalConflicts} 个严重冲突，建议人工审核`);
      }
      if (conflictReport.highConflicts > 0) {
        recommendations.push(`检测到 ${conflictReport.highConflicts} 个高优先级冲突，建议验证数据源`);
      }
    }

    if (qualityMetrics.overallQuality < 0.7) {
      recommendations.push('数据质量较低，建议补充更多可靠的数据源');
    }

    if (dataSources.length < 2) {
      recommendations.push('数据源数量较少，建议增加数据源以提高可靠性');
    }

    if (fusedData.confidence < 0.6) {
      recommendations.push('融合后置信度较低，建议使用更可靠的数据源');
    }

    return recommendations;
  }

  /**
   * 生成冲突摘要
   */
  private generateConflictSummary(conflicts: DataConflict[]): string {
    if (conflicts.length === 0) {
      return '未检测到数据冲突';
    }

    const critical = conflicts.filter(c => c.severity === 'CRITICAL').length;
    const high = conflicts.filter(c => c.severity === 'HIGH').length;
    const medium = conflicts.filter(c => c.severity === 'MEDIUM').length;
    const low = conflicts.filter(c => c.severity === 'LOW').length;

    const parts: string[] = [];
    if (critical > 0) parts.push(`${critical}个严重冲突`);
    if (high > 0) parts.push(`${high}个高优先级冲突`);
    if (medium > 0) parts.push(`${medium}个中等冲突`);
    if (low > 0) parts.push(`${low}个低优先级冲突`);

    return `共检测到 ${conflicts.length} 个冲突（${parts.join('、')}）`;
  }

  /**
   * 更新平均时间（移动平均）
   */
  private updateAverageTime(type: 'fusion' | 'conflictDetection', time: number): void {
    const alpha = 0.1; // 移动平均系数（10%新值，90%旧值）
    
    if (type === 'fusion') {
      this.performanceStats.averageFusionTime = 
        this.performanceStats.averageFusionTime === 0
          ? time
          : this.performanceStats.averageFusionTime * (1 - alpha) + time * alpha;
    } else {
      this.performanceStats.averageConflictDetectionTime = 
        this.performanceStats.averageConflictDetectionTime === 0
          ? time
          : this.performanceStats.averageConflictDetectionTime * (1 - alpha) + time * alpha;
    }
  }
}
