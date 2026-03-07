/**
 * WorldModelCollectorService
 *
 * 抽离自 Orchestrator.collectWorldModelData
 * 通过 Domain Agents 并行收集世界模型数据
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { GeoAgentService } from '../../services/domain-agents/geo-agent.service';
import { WeatherAgentService } from '../../services/domain-agents/weather-agent.service';
import { CostAgentService } from '../../services/domain-agents/cost-agent.service';

/** 旅行请求最小字段（兼容 TripPlanRequest） */
export interface TripRequestForWorldModel {
  destination?: string | { lat: number; lng: number };
  /** 当 destination 为坐标时，可选传入地区名供 CostAgent 使用（如 "Iceland"） */
  destination_name?: string;
  /** 路线坐标数组，供 GeoAgent.analyzeTerrain 获取完整海拔剖面（若有则优于单点） */
  route_coords?: Array<{ lat: number; lng: number }>;
  date_range?: { start_date: string; end_date: string };
  party?: { count: number };
}

@Injectable()
export class WorldModelCollectorService {
  private readonly logger = new Logger(WorldModelCollectorService.name);

  constructor(
    @Optional() private readonly geoAgent?: GeoAgentService,
    @Optional() private readonly weatherAgent?: WeatherAgentService,
    @Optional() private readonly costAgent?: CostAgentService,
  ) {}

  /**
   * 收集世界模型数据（Geo/Weather/Cost Agent 并行）
   * @param tripRequest 旅行请求
   * @param researchData 输出对象，会被 mutate
   * @param evidenceRefs 证据引用列表，会被 append
   */
  async collect(
    tripRequest: TripRequestForWorldModel,
    researchData: Record<string, unknown>,
    evidenceRefs: string[],
  ): Promise<void> {
    this.logger.debug(`[WorldModelCollector] Collecting world model data via Domain Agents`);
    const promises: Promise<void>[] = [];

    // GeoAgent
    if (this.geoAgent && typeof tripRequest.destination === 'object') {
      const coords = tripRequest.destination;
      const terrainPoints =
        tripRequest.route_coords && tripRequest.route_coords.length > 0
          ? tripRequest.route_coords
          : [{ lat: coords.lat, lng: coords.lng }];
      promises.push(
        this.geoAgent
          .analyzeTerrain(terrainPoints)
          .then((r) => {
            (researchData as Record<string, unknown>).geo_terrain = r;
            r.evidence.forEach((e) => evidenceRefs.push(e.evidence_id));
          })
          .catch((e) => this.logger.warn(`[GeoAgent] Failed: ${e?.message}`)),
      );
    }

    // WeatherAgent
    if (
      this.weatherAgent &&
      typeof tripRequest.destination === 'object' &&
      tripRequest.date_range
    ) {
      const coords = tripRequest.destination;
      promises.push(
        this.weatherAgent
          .getForecast(
            { lat: coords.lat, lng: coords.lng },
            { start: tripRequest.date_range.start_date, end: tripRequest.date_range.end_date },
          )
          .then((r) => {
            (researchData as Record<string, unknown>).weather_forecast = r;
            r.evidence.forEach((e) => evidenceRefs.push(e.evidence_id));
          })
          .catch((e) => this.logger.warn(`[WeatherAgent] Failed: ${e?.message}`)),
      );
    }

    // CostAgent
    if (this.costAgent && tripRequest.destination && tripRequest.date_range) {
      const dest =
        typeof tripRequest.destination === 'string'
          ? tripRequest.destination
          : tripRequest.destination_name ?? 'destination';
      promises.push(
        this.costAgent
          .estimateTripCost(
            dest,
            {
              start: tripRequest.date_range.start_date,
              end: tripRequest.date_range.end_date,
            },
            tripRequest.party?.count || 2,
          )
          .then((r) => {
            (researchData as Record<string, unknown>).cost_estimate = r;
            r.evidence.forEach((e) => evidenceRefs.push(e.evidence_id));
          })
          .catch((e) => this.logger.warn(`[CostAgent] Failed: ${e?.message}`)),
      );
    }

    await Promise.all(promises);
  }
}
