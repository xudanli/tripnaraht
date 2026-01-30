// src/trips/services/evidence-freshness-calculator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EvidenceItemDto, EvidenceType, EvidenceFreshnessDto, EvidenceFreshnessStatus } from '../dto/evidence.dto';
import { Place } from '@prisma/client';

/**
 * 证据时效性计算服务
 * 
 * 职责：
 * 1. 从Place.metadata中提取时间戳
 * 2. 根据证据类型计算TTL（Time To Live）
 * 3. 计算时效性状态（FRESH/STALE/EXPIRED）
 */
@Injectable()
export class EvidenceFreshnessCalculator {
  private readonly logger = new Logger(EvidenceFreshnessCalculator.name);

  /**
   * 证据类型对应的TTL（秒）
   */
  private readonly TTL_MAP: Record<EvidenceType, number> = {
    [EvidenceType.WEATHER]: 1800,        // 30分钟
    [EvidenceType.ROAD_CLOSURE]: 3600,  // 1小时
    [EvidenceType.OPENING_HOURS]: 86400, // 24小时
    [EvidenceType.BOOKING]: 3600,        // 1小时
    [EvidenceType.OTHER]: 86400,         // 24小时（默认）
  };

  /**
   * 计算证据时效性
   * 
   * @param item 证据项
   * @param place 关联的地点（可选，用于提取时间戳）
   * @returns 时效性信息，如果无法提取时间戳则返回undefined
   */
  calculateFreshness(
    item: EvidenceItemDto,
    place?: Place,
  ): EvidenceFreshnessDto | undefined {
    const timestamp = this.extractTimestamp(item, place);
    if (!timestamp) {
      // 没有时间戳，无法计算时效性
      return undefined;
    }

    const ttl = this.getTTLForEvidenceType(item.type);
    const expiresAt = new Date(timestamp.getTime() + ttl * 1000);
    const now = new Date();

    // 计算时效性状态
    let freshnessStatus: EvidenceFreshnessStatus;
    if (now > expiresAt) {
      freshnessStatus = EvidenceFreshnessStatus.EXPIRED;
    } else {
      // 过期前50%时间标记为STALE
      const staleThreshold = new Date(expiresAt.getTime() - 0.5 * ttl * 1000);
      if (now > staleThreshold) {
        freshnessStatus = EvidenceFreshnessStatus.STALE;
      } else {
        freshnessStatus = EvidenceFreshnessStatus.FRESH;
      }
    }

    return {
      fetchedAt: timestamp.toISOString(),
      expiresAt: expiresAt.toISOString(),
      freshnessStatus,
      recommendedRefreshAt: expiresAt.toISOString(),
    };
  }

  /**
   * 提取时间戳
   * 优先级：Place.metadata中的特定时间戳字段 > Place.updatedAt > item.timestamp
   */
  private extractTimestamp(item: EvidenceItemDto, place?: Place): Date | undefined {
    if (place) {
      const metadata = place.metadata as any;
      
      // 根据证据类型从metadata中提取特定时间戳字段
      if (item.type === EvidenceType.WEATHER) {
        const weatherFetchedAt = metadata?.weatherFetchedAt || metadata?.weatherInfo?.fetchedAt;
        if (weatherFetchedAt) {
          return new Date(weatherFetchedAt);
        }
      } else if (item.type === EvidenceType.ROAD_CLOSURE) {
        const roadStatusFetchedAt = metadata?.roadStatusFetchedAt || metadata?.roadStatus?.fetchedAt;
        if (roadStatusFetchedAt) {
          return new Date(roadStatusFetchedAt);
        }
      } else if (item.type === EvidenceType.OPENING_HOURS) {
        const openingHoursFetchedAt = metadata?.openingHoursFetchedAt || metadata?.openingHours?.fetchedAt;
        if (openingHoursFetchedAt) {
          return new Date(openingHoursFetchedAt);
        }
      }
      
      // 降级：使用Place.updatedAt
      if (place.updatedAt) {
        return new Date(place.updatedAt);
      }
    }

    // 最后降级：使用item.timestamp
    if (item.timestamp) {
      return new Date(item.timestamp);
    }

    return undefined;
  }

  /**
   * 获取证据类型的TTL（秒）
   */
  private getTTLForEvidenceType(type: EvidenceType): number {
    return this.TTL_MAP[type] || this.TTL_MAP[EvidenceType.OTHER];
  }
}
