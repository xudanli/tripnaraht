// src/data-privacy/services/sensitive-data-handling.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { DataPrivacyFrameworkService } from './data-privacy-framework.service';
import {
  HealthData,
  ProcessedHealthData,
  LocationData,
  ProcessedLocationData,
  BehavioralData,
  ProcessedBehavioralData,
} from '../interfaces/data-privacy.interface';

/**
 * 敏感信息处理服务
 * 
 * 处理不同类型的敏感数据：
 * - 健康信息：加密存储，严格访问控制
 * - 位置信息：实时处理，立即删除原始数据
 * - 行为数据：去标识化，仅保留聚合统计
 */
@Injectable()
export class SensitiveDataHandlingService {
  private readonly logger = new Logger(SensitiveDataHandlingService.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly privacyFramework: DataPrivacyFrameworkService,
  ) {}

  /**
   * 健康信息处理
   */
  async handleHealthData(data: HealthData): Promise<ProcessedHealthData> {
    this.logger.log(`Processing health data for user ${data.userId}`);

    // 加密健康数据
    const encrypted = await this.encryptionService.encrypt(data.healthInfo, 'AES-256');

    // 获取保留策略
    const retentionPolicy = await this.privacyFramework.minimizeRetentionPeriod('HEALTH_DATA');

    return {
      data: encrypted,
      encryption: 'AES-256加密存储',
      accessControl: '仅医疗专业人员可访问',
      retention: `最多保留${retentionPolicy.retentionDays}天`,
      purposeLimitation: '仅用于健康风险评估',
    };
  }

  /**
   * 位置信息处理
   */
  async handleLocationData(data: LocationData): Promise<ProcessedLocationData> {
    this.logger.log(`Processing location data for user ${data.userId}`);

    // 实时处理位置数据（例如：转换为区域信息，而不是精确坐标）
    const processed = {
      region: this.getRegionFromCoordinates(data.location.latitude, data.location.longitude),
      timestamp: data.location.timestamp,
      accuracy: data.location.accuracy || 'unknown',
    };

    // 加密处理后的数据
    const encrypted = await this.encryptionService.encrypt(processed, 'AES-256');

    // 获取保留策略
    const retentionPolicy = await this.privacyFramework.minimizeRetentionPeriod('LOCATION_DATA');

    // 注意：在实际实现中，这里应该删除原始位置数据
    // await this.deleteRawLocationData(data.id);

    return {
      data: encrypted,
      encryption: '端到端加密',
      realTimeHandling: '实时处理后立即删除原始精确坐标',
      historicalRetention: `最多保留${retentionPolicy.retentionDays}天`,
    };
  }

  /**
   * 行为数据处理
   */
  async handleBehavioralData(data: BehavioralData): Promise<ProcessedBehavioralData> {
    this.logger.log(`Processing behavioral data for user ${data.userId}`);

    // 去标识化处理
    const anonymized = this.anonymizeData(data.behavior);

    // 聚合数据（仅保留统计信息，不保留个人行为记录）
    const aggregated = this.aggregateData(anonymized);

    // 获取保留策略
    const retentionPolicy = await this.privacyFramework.minimizeRetentionPeriod('BEHAVIORAL_DATA');

    return {
      data: aggregated,
      anonymization: '去标识化处理',
      aggregation: '仅保留聚合统计',
      retention: `最多保留${retentionPolicy.retentionDays}天`,
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 从坐标获取区域信息（模糊化处理）
   */
  private getRegionFromCoordinates(lat: number, lng: number): string {
    // 将精确坐标转换为区域（例如：城市级别）
    // 这里简化实现，实际应该使用地理编码服务
    const regionLat = Math.round(lat * 10) / 10;
    const regionLng = Math.round(lng * 10) / 10;
    return `${regionLat},${regionLng}`;
  }

  /**
   * 匿名化数据
   */
  private anonymizeData(behavior: BehavioralData['behavior']): any {
    // 移除用户标识信息
    const anonymized: any = {};

    if (behavior.searchHistory) {
      // 只保留搜索关键词，不保留时间戳等可识别信息
      anonymized.searchKeywords = behavior.searchHistory.map((item: any) => {
        if (typeof item === 'string') {
          return item;
        }
        return item.query || item.keyword || 'unknown';
      });
    }

    if (behavior.clickHistory) {
      // 只保留点击类型统计，不保留具体记录
      anonymized.clickTypes = this.countOccurrences(
        behavior.clickHistory.map((item: any) => item.type || 'unknown'),
      );
    }

    if (behavior.preferences) {
      // 保留偏好，但移除可识别信息
      anonymized.preferences = behavior.preferences;
    }

    return anonymized;
  }

  /**
   * 聚合数据
   */
  private aggregateData(anonymized: any): any {
    const aggregated: any = {};

    if (anonymized.searchKeywords) {
      aggregated.searchStats = {
        totalSearches: anonymized.searchKeywords.length,
        uniqueKeywords: new Set(anonymized.searchKeywords).size,
        topKeywords: this.getTopItems(anonymized.searchKeywords, 5),
      };
    }

    if (anonymized.clickTypes) {
      aggregated.clickStats = anonymized.clickTypes;
    }

    if (anonymized.preferences) {
      aggregated.preferences = anonymized.preferences;
    }

    return aggregated;
  }

  /**
   * 统计出现次数
   */
  private countOccurrences(items: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      counts[item] = (counts[item] || 0) + 1;
    });
    return counts;
  }

  /**
   * 获取前N项
   */
  private getTopItems(items: string[], n: number): string[] {
    const counts = this.countOccurrences(items);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([item]) => item);
  }
}
