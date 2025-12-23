// src/data-contracts/adapters/default-road-status.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { RoadStatusAdapter } from './road-status.adapter.interface';
import { RoadStatus, RoadStatusQuery } from '../interfaces/road-status.interface';

/**
 * 默认路况适配器
 * 
 * 使用 Google Traffic API 或返回默认安全状态
 * 作为通用路况数据源，优先级最低
 */
@Injectable()
export class DefaultRoadStatusAdapter implements RoadStatusAdapter {
  private readonly logger = new Logger(DefaultRoadStatusAdapter.name);

  async getRoadStatus(query: RoadStatusQuery): Promise<RoadStatus> {
    // TODO: 实现 Google Traffic API 调用
    // 目前返回默认安全状态
    
    this.logger.debug(`获取路况状态 (${query.lat}, ${query.lng})`);
    
    // 默认返回安全状态
    return {
      isOpen: true,
      riskLevel: 0,
      lastUpdated: new Date(),
      source: 'default',
      metadata: {
        note: '使用默认适配器，未接入实际路况数据源',
      },
    };
  }

  async getRoadStatuses(query: RoadStatusQuery): Promise<RoadStatus[]> {
    if (!query.segments || query.segments.length === 0) {
      // 如果没有指定路段，返回单个点的路况
      return [await this.getRoadStatus(query)];
    }

    // 批量查询路段路况
    const statuses: RoadStatus[] = [];
    for (const segment of query.segments) {
      const segmentQuery: RoadStatusQuery = {
        lat: segment.from.lat,
        lng: segment.from.lng,
        segments: [{ from: segment.from, to: segment.to }],
      };
      const status = await this.getRoadStatus(segmentQuery);
      statuses.push(status);
    }

    return statuses;
  }

  getSupportedCountries(): string[] {
    return ['*']; // 支持所有国家
  }

  getPriority(): number {
    return 100; // 默认适配器优先级最低
  }

  getName(): string {
    return 'Default Road Status';
  }
}

