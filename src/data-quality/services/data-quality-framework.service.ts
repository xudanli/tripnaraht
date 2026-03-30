// src/data-quality/services/data-quality-framework.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  DataQualityAssessment,
  CompletenessMetric,
  AccuracyMetric,
  ConsistencyMetric,
  TimelinessMetric,
  TraceabilityMetric,
  DataSourceInfo,
} from '../interfaces/data-quality-dimensions.interface';

/**
 * 数据质量框架服务
 * 
 * 实现数据质量五维度评估：
 * 1. 完整性（Completeness）
 * 2. 准确性（Accuracy）
 * 3. 一致性（Consistency）
 * 4. 时效性（Timeliness）
 * 5. 可追溯性（Traceability）
 */
@Injectable()
export class DataQualityFrameworkService {
  private readonly logger = new Logger(DataQualityFrameworkService.name);

  /**
   * 评估数据完整性
   */
  assessCompleteness(
    data: any,
    requiredFields: string[],
    optionalFields: string[] = []
  ): CompletenessMetric {
    const allFields = [...requiredFields, ...optionalFields];
    const missingFields: string[] = [];
    const completeFields: string[] = [];

    // 检查每个必需字段
    requiredFields.forEach(field => {
      if (this.isFieldMissing(data, field)) {
        missingFields.push(field);
      } else {
        completeFields.push(field);
      }
    });

    // 检查可选字段
    optionalFields.forEach(field => {
      if (!this.isFieldMissing(data, field)) {
        completeFields.push(field);
      }
    });

    const validRecords = completeFields.length;
    const totalRecords = allFields.length;
    const currentValue = totalRecords > 0 ? validRecords / totalRecords : 0;

    return {
      definition: '所需的数据是否都被采集到',
      calculation: '有效记录数 / 总记录数 × 100%',
      target: '> 95%',
      measurementFrequency: '每日',
      currentValue,
      missingFields,
      completeFields,
      totalFields: allFields.length,
      validRecords,
      totalRecords,
    };
  }

  /**
   * 评估数据准确性
   */
  assessAccuracy(
    data: any,
    validationRules?: Record<string, (value: any) => boolean>,
    referenceData?: any
  ): AccuracyMetric {
    const errors: Array<{
      field: string;
      expected?: any;
      actual: any;
      errorType: 'format' | 'range' | 'logic' | 'reference';
    }> = [];

    let correctData = 0;
    let totalData = 0;

    // 如果有验证规则，使用规则验证
    if (validationRules) {
      Object.entries(validationRules).forEach(([field, validator]) => {
        totalData++;
        const value = this.getFieldValue(data, field);
        
        if (value === undefined || value === null) {
          // 缺失值不算错误，由完整性检查处理
          return;
        }

        try {
          if (validator(value)) {
            correctData++;
          } else {
            errors.push({
              field,
              actual: value,
              errorType: 'format',
            });
          }
        } catch (error) {
          errors.push({
            field,
            actual: value,
            errorType: 'format',
          });
        }
      });
    }

    // 如果有参考数据，进行对比验证
    if (referenceData) {
      Object.keys(referenceData).forEach(field => {
        totalData++;
        const actualValue = this.getFieldValue(data, field);
        const expectedValue = this.getFieldValue(referenceData, field);

        if (actualValue === undefined || actualValue === null) {
          return; // 缺失值由完整性检查处理
        }

        if (this.valuesMatch(actualValue, expectedValue)) {
          correctData++;
        } else {
          errors.push({
            field,
            expected: expectedValue,
            actual: actualValue,
            errorType: 'reference',
          });
        }
      });
    }

    const currentValue = totalData > 0 ? correctData / totalData : 1;

    return {
      definition: '数据是否反映真实情况',
      calculation: '正确数据 / 总数据 × 100%',
      target: '> 90%',
      measurementFrequency: '每周',
      currentValue,
      correctData,
      totalData,
      errors,
    };
  }

  /**
   * 评估数据一致性
   */
  assessConsistency(
    dataSources: Array<{ source: string; data: any; timestamp?: string }>
  ): ConsistencyMetric {
    if (dataSources.length < 2) {
      // 单个数据源无法评估一致性
      return {
        definition: '不同数据源是否协调一致',
        calculation: '一致的数据 / 总数据 × 100%',
        target: '> 95%',
        measurementFrequency: '每日',
        currentValue: 1,
        consistentData: 0,
        totalData: 0,
        inconsistencies: [],
      };
    }

    const inconsistencies: Array<{
      field: string;
      sources: Array<{ source: string; value: any; timestamp?: string }>;
      conflictType: 'value' | 'format' | 'schema';
    }> = [];

    // 提取所有字段
    const allFields = new Set<string>();
    dataSources.forEach(({ data }) => {
      this.extractFields(data, allFields);
    });

    let consistentData = 0;
    let totalData = 0;

    // 检查每个字段的一致性
    allFields.forEach(field => {
      const values: Array<{ source: string; value: any; timestamp?: string }> = [];
      
      dataSources.forEach(({ source, data, timestamp }) => {
        const value = this.getFieldValue(data, field);
        if (value !== undefined && value !== null) {
          values.push({ source, value, timestamp });
        }
      });

      if (values.length === 0) {
        return; // 所有数据源都缺失该字段
      }

      totalData++;

      // 检查值是否一致
      const firstValue = values[0].value;
      const allMatch = values.every(v => this.valuesMatch(v.value, firstValue));

      if (allMatch) {
        consistentData++;
      } else {
        inconsistencies.push({
          field,
          sources: values,
          conflictType: 'value',
        });
      }
    });

    const currentValue = totalData > 0 ? consistentData / totalData : 1;

    return {
      definition: '不同数据源是否协调一致',
      calculation: '一致的数据 / 总数据 × 100%',
      target: '> 95%',
      measurementFrequency: '每日',
      currentValue,
      consistentData,
      totalData,
      inconsistencies,
    };
  }

  /**
   * 评估数据时效性
   */
  assessTimeliness(
    data: any,
    maxAgeSeconds: Record<string, number> = {},
    defaultMaxAgeSeconds: number = 86400 // 默认24小时
  ): TimelinessMetric {
    const staleData: Array<{
      field: string;
      lastUpdated: string;
      ageSeconds: number;
      maxAgeSeconds: number;
      source: string;
    }> = [];

    let timelyData = 0;
    let totalData = 0;

    // 检查每个带时间戳的字段
    Object.keys(data).forEach(field => {
      const value = data[field];
      
      // 如果值是对象且包含时间戳
      if (value && typeof value === 'object' && 'timestamp' in value) {
        totalData++;
        const timestamp = value.timestamp;
        const lastUpdated = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
        const ageSeconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
        const maxAge = maxAgeSeconds[field] || defaultMaxAgeSeconds;

        if (ageSeconds <= maxAge) {
          timelyData++;
        } else {
          staleData.push({
            field,
            lastUpdated,
            ageSeconds,
            maxAgeSeconds: maxAge,
            source: value.source || 'unknown',
          });
        }
      } else if (value && typeof value === 'object' && 'lastUpdatedAt' in value) {
        // 兼容 lastUpdatedAt 字段
        totalData++;
        const timestamp = value.lastUpdatedAt;
        const lastUpdated = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
        const ageSeconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
        const maxAge = maxAgeSeconds[field] || defaultMaxAgeSeconds;

        if (ageSeconds <= maxAge) {
          timelyData++;
        } else {
          staleData.push({
            field,
            lastUpdated,
            ageSeconds,
            maxAgeSeconds: maxAge,
            source: value.source || 'unknown',
          });
        }
      }
    });

    const currentValue = totalData > 0 ? timelyData / totalData : 1;

    return {
      definition: '数据是否及时更新',
      calculation: '及时数据 / 总数据 × 100%',
      target: '根据业务需求定义',
      measurementFrequency: '实时',
      currentValue,
      timelyData,
      totalData,
      staleData,
    };
  }

  /**
   * 评估数据可追溯性
   */
  assessTraceability(
    data: any,
    sourceInfo?: DataSourceInfo | Record<string, DataSourceInfo>
  ): TraceabilityMetric {
    const untraceableData: Array<{
      field: string;
      missingInfo: string[];
    }> = [];

    let traceableData = 0;
    let totalData = 0;

    // 如果提供了全局来源信息
    if (sourceInfo && !this.isRecord(sourceInfo)) {
      // 单个来源信息，检查数据是否包含来源标注
      Object.keys(data).forEach(field => {
        totalData++;
        const value = data[field];
        
        if (value && typeof value === 'object' && 'source' in value) {
          traceableData++;
        } else {
          untraceableData.push({
            field,
            missingInfo: ['source'],
          });
        }
      });
    } else if (sourceInfo && this.isRecord(sourceInfo)) {
      // 每个字段有独立的来源信息
      Object.keys(data).forEach(field => {
        totalData++;
        const fieldSourceInfo = (sourceInfo as Record<string, DataSourceInfo>)[field];
        
        if (fieldSourceInfo && this.hasCompleteSourceInfo(fieldSourceInfo)) {
          traceableData++;
        } else {
          const missingInfo: string[] = [];
          if (!fieldSourceInfo) {
            missingInfo.push('sourceInfo');
          } else {
            if (!fieldSourceInfo.sourceId) missingInfo.push('sourceId');
            if (!fieldSourceInfo.sourceName) missingInfo.push('sourceName');
            if (!fieldSourceInfo.timestamp) missingInfo.push('timestamp');
          }
          untraceableData.push({
            field,
            missingInfo,
          });
        }
      });
    } else {
      // 没有提供来源信息，检查数据本身是否包含来源标注
      Object.keys(data).forEach(field => {
        totalData++;
        const value = data[field];
        
        if (value && typeof value === 'object' && 'source' in value) {
          const source = value.source;
          if (this.hasCompleteSourceInfo(source)) {
            traceableData++;
          } else {
            untraceableData.push({
              field,
              missingInfo: this.getMissingSourceInfo(source),
            });
          }
        } else {
          untraceableData.push({
            field,
            missingInfo: ['source'],
          });
        }
      });
    }

    const currentValue = totalData > 0 ? traceableData / totalData : 0;

    return {
      definition: '数据来源是否清晰可追踪',
      calculation: '有完整来源记录的数据 / 总数据 × 100%',
      target: '100%',
      measurementFrequency: '每周',
      currentValue,
      traceableData,
      totalData,
      untraceableData,
    };
  }

  /**
   * 综合评估数据质量
   */
  async assessOverallQuality(
    data: any,
    options: {
      requiredFields?: string[];
      optionalFields?: string[];
      validationRules?: Record<string, (value: any) => boolean>;
      referenceData?: any;
      dataSources?: Array<{ source: string; data: any; timestamp?: string }>;
      maxAgeSeconds?: Record<string, number>;
      defaultMaxAgeSeconds?: number;
      sourceInfo?: DataSourceInfo | Record<string, DataSourceInfo>;
      weights?: {
        completeness?: number;
        accuracy?: number;
        consistency?: number;
        timeliness?: number;
        traceability?: number;
      };
    } = {}
  ): Promise<DataQualityAssessment> {
    const {
      requiredFields = [],
      optionalFields = [],
      validationRules,
      referenceData,
      dataSources,
      maxAgeSeconds = {},
      defaultMaxAgeSeconds = 86400,
      sourceInfo,
      weights = {
        completeness: 0.2,
        accuracy: 0.2,
        consistency: 0.2,
        timeliness: 0.2,
        traceability: 0.2,
      },
    } = options;

    // 评估各维度
    const completeness = this.assessCompleteness(data, requiredFields, optionalFields);
    const accuracy = this.assessAccuracy(data, validationRules, referenceData);
    
    let consistency: ConsistencyMetric;
    if (dataSources && dataSources.length > 0) {
      consistency = this.assessConsistency(dataSources);
    } else {
      // 如果没有提供多个数据源，一致性设为满分
      consistency = {
        definition: '不同数据源是否协调一致',
        calculation: '一致的数据 / 总数据 × 100%',
        target: '> 95%',
        measurementFrequency: '每日',
        currentValue: 1,
        consistentData: 0,
        totalData: 0,
        inconsistencies: [],
      };
    }

    const timeliness = this.assessTimeliness(data, maxAgeSeconds, defaultMaxAgeSeconds);
    const traceability = this.assessTraceability(data, sourceInfo);

    // 计算综合分数（加权平均）
    const overallScore =
      completeness.currentValue * weights.completeness +
      accuracy.currentValue * weights.accuracy +
      consistency.currentValue * weights.consistency +
      timeliness.currentValue * weights.timeliness +
      traceability.currentValue * weights.traceability;

    // 确定质量等级
    let qualityLevel: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
    if (overallScore >= 0.9) {
      qualityLevel = 'EXCELLENT';
    } else if (overallScore >= 0.75) {
      qualityLevel = 'GOOD';
    } else if (overallScore >= 0.6) {
      qualityLevel = 'FAIR';
    } else if (overallScore >= 0.4) {
      qualityLevel = 'POOR';
    } else {
      qualityLevel = 'CRITICAL';
    }

    // 生成改进建议
    const recommendations: string[] = [];
    if (completeness.currentValue < 0.95) {
      recommendations.push(`完整性不足：缺失字段 ${completeness.missingFields.join(', ')}`);
    }
    if (accuracy.currentValue < 0.9) {
      recommendations.push(`准确性不足：发现 ${accuracy.errors.length} 个错误`);
    }
    if (consistency.currentValue < 0.95 && consistency.inconsistencies.length > 0) {
      recommendations.push(`一致性不足：发现 ${consistency.inconsistencies.length} 个不一致项`);
    }
    if (timeliness.currentValue < 1 && timeliness.staleData.length > 0) {
      recommendations.push(`时效性不足：${timeliness.staleData.length} 个字段数据过期`);
    }
    if (traceability.currentValue < 1) {
      recommendations.push(`可追溯性不足：${traceability.untraceableData.length} 个字段缺少来源信息`);
    }

    return {
      timestamp: new Date().toISOString(),
      completeness,
      accuracy,
      consistency,
      timeliness,
      traceability,
      overallScore,
      qualityLevel,
      recommendations,
    };
  }

  // ========== 辅助方法 ==========

  private isFieldMissing(data: any, field: string): boolean {
    const value = this.getFieldValue(data, field);
    return value === undefined || value === null || value === '';
  }

  private getFieldValue(data: any, field: string): any {
    if (!data || typeof data !== 'object') {
      return undefined;
    }

    // 支持嵌套字段（如 'user.profile.name'）
    const parts = field.split('.');
    let value = data;
    
    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }
    
    return value;
  }

  private valuesMatch(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;
    
    // 日期比较
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    
    // 对象深度比较（简单版本）
    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      
      if (keysA.length !== keysB.length) return false;
      
      for (const key of keysA) {
        if (!this.valuesMatch(a[key], b[key])) {
          return false;
        }
      }
      
      return true;
    }
    
    return false;
  }

  private extractFields(data: any, fields: Set<string>, prefix = ''): void {
    if (!data || typeof data !== 'object') {
      return;
    }

    Object.keys(data).forEach(key => {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      const value = data[key];
      
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        this.extractFields(value, fields, fieldPath);
      } else {
        fields.add(fieldPath);
      }
    });
  }

  private isRecord(value: any): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hasCompleteSourceInfo(sourceInfo: any): boolean {
    if (!sourceInfo || typeof sourceInfo !== 'object') {
      return false;
    }
    
    return !!(
      sourceInfo.sourceId &&
      sourceInfo.sourceName &&
      sourceInfo.timestamp
    );
  }

  private getMissingSourceInfo(sourceInfo: any): string[] {
    const missing: string[] = [];
    
    if (!sourceInfo || typeof sourceInfo !== 'object') {
      return ['sourceInfo'];
    }
    
    if (!sourceInfo.sourceId) missing.push('sourceId');
    if (!sourceInfo.sourceName) missing.push('sourceName');
    if (!sourceInfo.timestamp) missing.push('timestamp');
    
    return missing;
  }
}
