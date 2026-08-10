// src/data-contracts/adapters/china-road-status.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { RoadStatusAdapter } from './road-status.adapter.interface';
import { RoadStatus, RoadStatusQuery } from '../interfaces/road-status.interface';
import {
  cnSeasonalRoadStatusToContract,
  resolveCnSeasonalRoadStatus,
} from '../../trips/readiness/utils/cn-seasonal-road-status.util';

/**
 * 中国路况适配器（季节窗 / 走廊粗定位）
 *
 * 非准实时交警；优先级高于 Default，避免 CN 落入「永远开放」。
 */
@Injectable()
export class ChinaRoadStatusAdapter implements RoadStatusAdapter {
  private readonly logger = new Logger(ChinaRoadStatusAdapter.name);

  async getRoadStatus(query: RoadStatusQuery): Promise<RoadStatus> {
    const resolved = resolveCnSeasonalRoadStatus({
      lat: query.lat,
      lng: query.lng,
      classicRouteId: query.classicRouteId,
      asOfDate: query.asOfDate,
    });
    this.logger.debug(
      `CN seasonal road status: route=${resolved.classicRouteIds.join(',') || '—'} ` +
        `status=${resolved.roadStatus} risk=${resolved.riskLevel}`,
    );
    return cnSeasonalRoadStatusToContract(resolved);
  }

  async getRoadStatuses(query: RoadStatusQuery): Promise<RoadStatus[]> {
    if (!query.segments || query.segments.length === 0) {
      return [await this.getRoadStatus(query)];
    }

    const statuses: RoadStatus[] = [];
    for (const segment of query.segments) {
      const segmentQuery: RoadStatusQuery = {
        lat: segment.from.lat,
        lng: segment.from.lng,
        classicRouteId: query.classicRouteId,
        asOfDate: query.asOfDate,
        segments: [{ from: segment.from, to: segment.to }],
      };
      statuses.push(await this.getRoadStatus(segmentQuery));
    }
    return statuses;
  }

  getSupportedCountries(): string[] {
    return ['CN'];
  }

  getPriority(): number {
    return 10;
  }

  getName(): string {
    return 'China Seasonal Road Advisory';
  }
}
