// src/data-quality/services/source-annotation.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  ExtendedDataSourceInfo,
  SourceAnnotatedData,
  BatchAnnotationResult,
  VerificationLevel,
} from '../interfaces/source-annotation.interface';

/**
 * 信息源标注服务
 * 
 * 为所有信息添加来源标注和置信度：
 * - 推断数据来源
 * - 计算置信度
 * - 确定验证等级
 * - 区分事实性信息和LLM生成内容
 */
@Injectable()
export class SourceAnnotationService {
  private readonly logger = new Logger(SourceAnnotationService.name);

  /**
   * 为所有信息添加来源标注
   */
  async annotateAllInformation(data: any): Promise<BatchAnnotationResult> {
    this.logger.log('Starting source annotation for all information');

    const annotatedData: Record<string, SourceAnnotatedData> = {};
    const statistics = {
      totalFields: 0,
      annotatedFields: 0,
      verifiedFields: 0,
      llmGeneratedFields: 0,
      pendingFields: 0,
    };

    // 遍历所有字段
    for (const [key, value] of Object.entries(data)) {
      statistics.totalFields++;

      try {
        const annotated = await this.annotateField(key, value);
        annotatedData[key] = annotated;
        statistics.annotatedFields++;

        // 更新统计
        if (annotated.source.verificationLevel === 'A_VERIFIED') {
          statistics.verifiedFields++;
        } else if (annotated.source.verificationLevel === 'E_LLM_GENERATED') {
          statistics.llmGeneratedFields++;
        } else if (annotated.source.verificationLevel === 'D_PENDING') {
          statistics.pendingFields++;
        }
      } catch (error) {
        this.logger.warn(`Failed to annotate field ${key}:`, error);
      }
    }

    this.logger.log(`Source annotation completed: ${statistics.annotatedFields}/${statistics.totalFields} fields annotated`);

    return {
      annotatedData,
      statistics,
      annotatedAt: new Date(),
    };
  }

  /**
   * 为单个字段添加来源标注
   */
  async annotateField(fieldName: string, value: any): Promise<SourceAnnotatedData> {
    // 推断数据来源
    const source = await this.inferSource(fieldName, value);

    // 计算置信度
    const confidence = await this.calculateConfidence(fieldName, value, source);

    // 确定验证等级
    const verificationLevel = await this.determineVerificationLevel(fieldName, value, source, confidence);

    // 判断是否为事实性信息
    const isFactual = this.isFactualInformation(fieldName, value, source);

    // 构建扩展的数据源信息
    const extendedSource: ExtendedDataSourceInfo = {
      ...source,
      confidence,
      verificationLevel,
      isFactual,
      lastVerifiedAt: new Date().toISOString(),
    };

    return {
      value,
      fieldName,
      source: extendedSource,
    };
  }

  /**
   * 推断数据来源
   */
  private async inferSource(fieldName: string, value: any): Promise<Omit<ExtendedDataSourceInfo, 'confidence' | 'verificationLevel' | 'isFactual' | 'lastVerifiedAt'>> {
    const lowerFieldName = fieldName.toLowerCase();

    // DEM相关字段
    if (lowerFieldName.includes('elevation') || lowerFieldName.includes('slope') || lowerFieldName.includes('dem')) {
      return {
        type: 'DEM',
        timestamp: new Date().toISOString(),
        reliability: 'HIGH',
        source: 'API',
        sourceName: 'DEM地形数据API',
        sourceUrl: 'https://api.dem.example.com',
        crossValidationCount: 1,
      };
    }

    // 交通相关字段
    if (lowerFieldName.includes('transport') || lowerFieldName.includes('route') || lowerFieldName.includes('transit')) {
      return {
        type: 'TRANSPORT',
        timestamp: new Date().toISOString(),
        reliability: 'HIGH',
        source: 'API',
        sourceName: '交通路线API',
        sourceUrl: 'https://api.transport.example.com',
        crossValidationCount: 1,
      };
    }

    // POI相关字段
    if (lowerFieldName.includes('poi') || lowerFieldName.includes('place') || lowerFieldName.includes('attraction')) {
      return {
        type: 'POI',
        timestamp: new Date().toISOString(),
        reliability: 'MEDIUM',
        source: 'API',
        sourceName: 'POI数据API',
        sourceUrl: 'https://api.poi.example.com',
        crossValidationCount: 1,
      };
    }

    // 天气相关字段
    if (lowerFieldName.includes('weather') || lowerFieldName.includes('temperature') || lowerFieldName.includes('precipitation')) {
      return {
        type: 'WEATHER',
        timestamp: new Date().toISOString(),
        expiry: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3小时后过期
        reliability: 'HIGH',
        source: 'API',
        sourceName: '中央气象台',
        sourceUrl: 'https://api.weather.example.com',
        crossValidationCount: 1,
      };
    }

    // 开放时间相关字段
    if (lowerFieldName.includes('opening') || lowerFieldName.includes('hours') || lowerFieldName.includes('schedule')) {
      return {
        type: 'OPENING_HOURS',
        timestamp: new Date().toISOString(),
        reliability: 'MEDIUM',
        source: 'API',
        sourceName: 'POI开放时间API',
        sourceUrl: 'https://api.opening-hours.example.com',
        crossValidationCount: 1,
      };
    }

    // 用户输入相关字段
    if (lowerFieldName.includes('user') || lowerFieldName.includes('input') || lowerFieldName.includes('preference')) {
      return {
        type: 'USER_INPUT',
        timestamp: new Date().toISOString(),
        reliability: 'HIGH',
        source: 'USER_INPUT',
        sourceName: '用户输入',
        crossValidationCount: 0,
      };
    }

    // LLM生成内容（通过特殊标记识别）
    if (value && typeof value === 'object' && '_llmGenerated' in value) {
      return {
        type: 'LLM_GENERATED',
        timestamp: new Date().toISOString(),
        reliability: 'LOW',
        source: 'LLM_GENERATED',
        sourceName: 'LLM生成内容',
        crossValidationCount: 0,
      };
    }

    // 估算值
    if (lowerFieldName.includes('estimated') || lowerFieldName.includes('estimate') || lowerFieldName.includes('approx')) {
      return {
        type: 'ESTIMATED',
        timestamp: new Date().toISOString(),
        reliability: 'LOW',
        source: 'ESTIMATED',
        sourceName: '系统估算',
        crossValidationCount: 0,
      };
    }

    // 默认值
    if (lowerFieldName.includes('default') || value === null || value === undefined) {
      return {
        type: 'DEFAULT',
        timestamp: new Date().toISOString(),
        reliability: 'LOW',
        source: 'DEFAULT',
        sourceName: '系统默认值',
        crossValidationCount: 0,
      };
    }

    // 其他类型
    return {
      type: 'OTHER',
      timestamp: new Date().toISOString(),
      reliability: 'MEDIUM',
      source: 'DATABASE',
      sourceName: '数据库',
      crossValidationCount: 0,
    };
  }

  /**
   * 计算置信度
   */
  private async calculateConfidence(
    fieldName: string,
    value: any,
    source: Omit<ExtendedDataSourceInfo, 'confidence' | 'verificationLevel' | 'isFactual' | 'lastVerifiedAt'>,
  ): Promise<number> {
    let confidence = 0.5; // 基础置信度

    // 基于可靠性等级
    switch (source.reliability) {
      case 'HIGH':
        confidence += 0.3;
        break;
      case 'MEDIUM':
        confidence += 0.1;
        break;
      case 'LOW':
        confidence -= 0.2;
        break;
    }

    // 基于数据来源
    switch (source.source) {
      case 'API':
        confidence += 0.2;
        break;
      case 'DATABASE':
        confidence += 0.1;
        break;
      case 'CACHE':
        confidence += 0.05;
        break;
      case 'USER_INPUT':
        confidence += 0.15;
        break;
      case 'ESTIMATED':
        confidence -= 0.2;
        break;
      case 'DEFAULT':
        confidence -= 0.3;
        break;
      case 'LLM_GENERATED':
        confidence -= 0.4;
        break;
    }

    // 基于交叉验证次数
    if (source.crossValidationCount && source.crossValidationCount > 0) {
      confidence += Math.min(0.2, source.crossValidationCount * 0.05);
    }

    // 基于数据新鲜度
    if (source.expiry) {
      const expiryTime = new Date(source.expiry).getTime();
      const now = Date.now();
      const timeUntilExpiry = expiryTime - now;
      if (timeUntilExpiry > 0) {
        confidence += 0.1; // 数据未过期
      } else {
        confidence -= 0.2; // 数据已过期
      }
    }

    // 确保置信度在0-1范围内
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * 确定验证等级
   */
  private async determineVerificationLevel(
    fieldName: string,
    value: any,
    source: Omit<ExtendedDataSourceInfo, 'confidence' | 'verificationLevel' | 'isFactual' | 'lastVerifiedAt'>,
    confidence: number,
  ): Promise<VerificationLevel> {
    // LLM生成内容
    if (source.source === 'LLM_GENERATED' || source.type === 'LLM_GENERATED') {
      return 'E_LLM_GENERATED';
    }

    // A级：已验证（至少2个独立可靠来源，且置信度>0.9）
    if (source.crossValidationCount && source.crossValidationCount >= 2 && confidence > 0.9) {
      return 'A_VERIFIED';
    }

    // B级：可靠（官方或权威渠道，且置信度>0.7）
    if (
      (source.reliability === 'HIGH' && source.source === 'API') ||
      (confidence > 0.7 && source.reliability === 'HIGH')
    ) {
      return 'B_RELIABLE';
    }

    // C级：用户反馈
    if (source.source === 'USER_INPUT') {
      return 'C_USER_FEEDBACK';
    }

    // D级：待验证（其他情况）
    return 'D_PENDING';
  }

  /**
   * 判断是否为事实性信息
   */
  private isFactualInformation(
    fieldName: string,
    value: any,
    source: Omit<ExtendedDataSourceInfo, 'confidence' | 'verificationLevel' | 'isFactual' | 'lastVerifiedAt'>,
  ): boolean {
    // LLM生成内容不是事实性信息
    if (source.source === 'LLM_GENERATED' || source.type === 'LLM_GENERATED') {
      return false;
    }

    // 估算值和默认值不是事实性信息
    if (source.source === 'ESTIMATED' || source.source === 'DEFAULT') {
      return false;
    }

    // API、数据库、用户输入等是事实性信息
    return true;
  }

  /**
   * 标记LLM生成内容
   */
  markAsLLMGenerated(data: any): any {
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return {
        ...data,
        _llmGenerated: true,
        _llmGeneratedAt: new Date().toISOString(),
      };
    }
    return data;
  }

  /**
   * 检查是否为LLM生成内容
   */
  isLLMGenerated(data: any): boolean {
    return data && typeof data === 'object' && '_llmGenerated' in data;
  }
}
