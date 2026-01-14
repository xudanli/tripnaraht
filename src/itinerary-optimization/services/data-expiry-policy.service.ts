// src/itinerary-optimization/services/data-expiry-policy.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * 数据时间戳元数据
 */
export interface TimestampedData<T = any> {
  data: T;
  metadata: {
    timestamp: string; // ISO 8601
    source: 'API' | 'CACHE' | 'DATABASE' | 'ESTIMATED' | 'DEFAULT';
    expiry_policy: ExpiryPolicy;
    reliability: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

/**
 * 过期策略
 */
export interface ExpiryPolicy {
  type: 'TTL' | 'SCHEDULED' | 'EVENT_BASED';
  ttl_seconds?: number; // TTL 模式：生存时间（秒）
  expiry_time?: string; // SCHEDULED 模式：过期时间（ISO 8601）
  event_trigger?: string; // EVENT_BASED 模式：触发事件（例如: 'WEATHER_UPDATE'）
}

/**
 * 数据质量评估结果
 */
export interface DataQualityAssessment {
  is_expired: boolean;
  age_seconds: number;
  reliability: 'HIGH' | 'MEDIUM' | 'LOW';
  warnings: string[];
  recommendations: string[];
}

/**
 * 数据过期策略服务
 * 
 * 核心功能：
 * 1. 检查数据是否过期
 * 2. 计算数据年龄
 * 3. 评估数据可靠性
 * 4. 生成数据质量报告
 */
@Injectable()
export class DataExpiryPolicyService {
  private readonly logger = new Logger(DataExpiryPolicyService.name);

  /**
   * 默认 TTL 配置（秒）
   */
  private readonly defaultTTL: Record<string, number> = {
    DEM: 86400 * 7, // 7 天（地形数据变化慢）
    TRANSPORT: 3600, // 1 小时（交通数据变化快）
    OPENING_HOURS: 86400, // 1 天（开放时间相对稳定）
    WEATHER: 3600, // 1 小时（天气数据实时性强）
    POI: 86400 * 30, // 30 天（POI 信息相对稳定）
    ROUTE: 3600, // 1 小时（路线数据受交通影响）
  };

  /**
   * 检查数据是否过期
   */
  isExpired(data: TimestampedData): boolean {
    const { expiry_policy, timestamp } = data.metadata;
    const ageSeconds = this.getDataAge(data);

    switch (expiry_policy.type) {
      case 'TTL':
        if (expiry_policy.ttl_seconds) {
          return ageSeconds > expiry_policy.ttl_seconds;
        }
        // 如果没有指定 TTL，使用默认值
        return this.isExpiredByDefaultTTL(data, ageSeconds);

      case 'SCHEDULED':
        if (expiry_policy.expiry_time) {
          return new Date() > new Date(expiry_policy.expiry_time);
        }
        return false;

      case 'EVENT_BASED':
        // EVENT_BASED 需要外部触发，这里返回 false
        // 实际应用中应该由事件系统触发检查
        return false;

      default:
        return this.isExpiredByDefaultTTL(data, ageSeconds);
    }
  }

  /**
   * 使用默认 TTL 检查过期
   */
  private isExpiredByDefaultTTL(data: TimestampedData, ageSeconds: number): boolean {
    // 根据数据源推断类型
    const dataType = this.inferDataType(data);
    const defaultTTL = this.defaultTTL[dataType] || 3600; // 默认 1 小时

    return ageSeconds > defaultTTL;
  }

  /**
   * 推断数据类型
   */
  private inferDataType(data: TimestampedData): string {
    // 根据数据源推断
    const source = data.metadata.source;
    
    // 可以根据实际数据结构进一步推断
    // 这里简化处理
    if (source === 'ESTIMATED' || source === 'DEFAULT') {
      return 'ROUTE'; // 估算数据通常用于路线
    }
    
    return 'ROUTE'; // 默认
  }

  /**
   * 获取数据年龄（秒）
   */
  getDataAge(data: TimestampedData): number {
    const timestamp = new Date(data.metadata.timestamp);
    const now = new Date();
    return Math.floor((now.getTime() - timestamp.getTime()) / 1000);
  }

  /**
   * 评估数据质量
   */
  assessDataQuality(data: TimestampedData): DataQualityAssessment {
    const ageSeconds = this.getDataAge(data);
    const isExpired = this.isExpired(data);
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // 检查过期
    if (isExpired) {
      warnings.push(`数据已过期（年龄: ${this.formatAge(ageSeconds)}）`);
      recommendations.push('建议：刷新数据或使用保守策略');
    }

    // 检查可靠性
    const reliability = data.metadata.reliability;
    if (reliability === 'LOW') {
      warnings.push('数据可靠性低');
      recommendations.push('建议：验证数据来源或使用备用数据');
    }

    // 检查数据源
    const source = data.metadata.source;
    if (source === 'ESTIMATED' || source === 'DEFAULT') {
      warnings.push(`数据来源为估算值（${source}）`);
      recommendations.push('建议：使用实际数据源验证');
    }

    // 检查年龄（即使未过期，如果太老也可能有问题）
    const dataType = this.inferDataType(data);
    const defaultTTL = this.defaultTTL[dataType] || 3600;
    const ageRatio = ageSeconds / defaultTTL;
    
    if (ageRatio > 0.8) {
      warnings.push(`数据年龄接近过期阈值（${this.formatAge(ageSeconds)}）`);
      recommendations.push('建议：考虑刷新数据');
    }

    return {
      is_expired: isExpired,
      age_seconds: ageSeconds,
      reliability,
      warnings,
      recommendations,
    };
  }

  /**
   * 批量评估数据质量
   */
  assessMultipleDataQuality(dataList: TimestampedData[]): {
    overall: {
      total: number;
      expired: number;
      low_reliability: number;
      warnings_count: number;
    };
    details: Array<{
      index: number;
      assessment: DataQualityAssessment;
    }>;
  } {
    const details = dataList.map((data, index) => ({
      index,
      assessment: this.assessDataQuality(data),
    }));

    const expired = details.filter(d => d.assessment.is_expired).length;
    const lowReliability = details.filter(
      d => d.assessment.reliability === 'LOW'
    ).length;
    const warningsCount = details.reduce(
      (sum, d) => sum + d.assessment.warnings.length,
      0
    );

    return {
      overall: {
        total: dataList.length,
        expired,
        low_reliability: lowReliability,
        warnings_count: warningsCount,
      },
      details,
    };
  }

  /**
   * 创建带时间戳的数据对象
   */
  createTimestampedData<T>(
    data: T,
    options: {
      source?: TimestampedData['metadata']['source'];
      expiry_policy?: ExpiryPolicy;
      reliability?: 'HIGH' | 'MEDIUM' | 'LOW';
    } = {}
  ): TimestampedData<T> {
    const timestamp = new Date().toISOString();
    const source = options.source || 'DATABASE';
    const reliability = options.reliability || this.inferReliability(source);

    // 如果没有指定过期策略，使用默认 TTL
    const expiry_policy: ExpiryPolicy = options.expiry_policy || {
      type: 'TTL',
      ttl_seconds: this.defaultTTL[this.inferDataType({ data, metadata: { timestamp, source, expiry_policy: { type: 'TTL' }, reliability } })] || 3600,
    };

    return {
      data,
      metadata: {
        timestamp,
        source,
        expiry_policy,
        reliability,
      },
    };
  }

  /**
   * 推断可靠性
   */
  private inferReliability(source: TimestampedData['metadata']['source']): 'HIGH' | 'MEDIUM' | 'LOW' {
    switch (source) {
      case 'API':
        return 'HIGH';
      case 'DATABASE':
        return 'MEDIUM';
      case 'CACHE':
        return 'MEDIUM';
      case 'ESTIMATED':
        return 'LOW';
      case 'DEFAULT':
        return 'LOW';
      default:
        return 'MEDIUM';
    }
  }

  /**
   * 格式化年龄显示
   */
  private formatAge(seconds: number): string {
    if (seconds < 60) {
      return `${seconds} 秒`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)} 分钟`;
    } else if (seconds < 86400) {
      return `${Math.floor(seconds / 3600)} 小时`;
    } else {
      return `${Math.floor(seconds / 86400)} 天`;
    }
  }

  /**
   * 获取默认 TTL（用于外部查询）
   */
  getDefaultTTL(dataType: string): number {
    return this.defaultTTL[dataType] || 3600;
  }

  /**
   * 设置自定义 TTL
   */
  setDefaultTTL(dataType: string, ttlSeconds: number): void {
    this.defaultTTL[dataType] = ttlSeconds;
    this.logger.debug(`设置 ${dataType} 的默认 TTL 为 ${ttlSeconds} 秒`);
  }
}
