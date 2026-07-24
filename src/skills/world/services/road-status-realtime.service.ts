/**
 * Road.is API 集成服务
 *
 * 用途: 获取冰岛 F-road 实时开放状态
 * 权威源: Vegagerðin Gagnaveita faerd2017_1
 * 缓存: 15 分钟
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import axios, { AxiosInstance } from 'axios';
import {
  GAGNAVEITA_CANONICAL_PROVIDER,
  GAGNAVEITA_FAERD2017_URL,
  mapGagnaveitaPayloadToF208Status,
  type GagnaveitaFaerdRecord,
} from '../../../trips/guardian-decision-core/evidence/gagnaveita-faerd.mapper';
import { mapGagnaveitaPayloadToRoadStatus } from '../../../trips/guardian-decision-core/evidence/gagnaveita-collector-parse.util';

/** @deprecated LEGACY_ENDPOINT / UNRESOLVABLE — retained for rollback only */
interface RoadIsAPIResponse {
  results: Array<{
    road_number: string;
    road_name: string;
    status: 'open' | 'closed' | 'limited' | 'unknown';
    status_text: string;
    status_text_en: string;
    last_updated: string;
    warnings?: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high' | 'unknown';
      message: string;
    }>;
    conditions?: {
      surface?: string;
      visibility?: string;
      wind_speed_ms?: number;
      temperature_c?: number;
    };
  }>;
}

export interface RoadStatus {
  roadId: string;
  roadName?: string;
  currentStatus: 'open' | 'closed' | 'limited' | 'unknown';
  statusMessage?: string;
  lastVerifiedAt: Date;
  dataSource?: string;
  apiResponse?: any;
  hazards: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'very_high';
    description: string;
  }>;
  conditions?: {
    surface?: string;
    visibility?: string;
    windSpeedMs?: number;
    temperatureC?: number;
  };
  confidence?: number;
  seasonalFallback?: boolean;
}

type RoadLiveSource = 'gagnaveita' | 'road.is';

@Injectable()
export class RoadStatusRealtimeService {
  private readonly logger = new Logger('RoadStatusRealtimeService');
  /** @deprecated UNRESOLVABLE on devbox/Frankfurt egress */
  private readonly ROAD_IS_API = 'https://api.road.is/api/condition';
  private readonly GAGNAVEITA_API = GAGNAVEITA_FAERD2017_URL;
  private readonly CACHE_TTL_MS = 15 * 60 * 1000;
  private readonly REQUEST_TIMEOUT_MS = 15000;
  private readonly httpClient: AxiosInstance;
  private readonly prisma: PrismaService | PrismaClient;
  private readonly liveSource: RoadLiveSource;
  private gagnaveitaPayloadCache: {
    fetchedAt: number;
    records: GagnaveitaFaerdRecord[];
  } | null = null;

  private readonly F_ROADS = [
    'F208', 'F26', 'F225', 'F35', 'F910', 'F550', 'F88', 'F862',
    'F206', 'F232', 'F210', 'F228', 'F261', 'F337', 'F821', 'F902',
    'F985', 'F233', 'F347', 'F578', 'F622', 'F980',
  ];

  constructor(
    @Optional() prisma?: PrismaService | PrismaClient,
  ) {
    this.prisma = prisma ?? new PrismaClient();
    this.liveSource = this.resolveLiveSource();
    this.httpClient = axios.create({
      timeout: this.REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
    });
    this.logger.log(
      `✅ RoadStatusRealtimeService 已初始化 (liveSource=${this.liveSource}, db cache)`,
    );
  }

  async getRoadStatus(roadId: string): Promise<RoadStatus | null> {
    const normalized = roadId.toUpperCase();
    const cached = await this.getFromDatabase(normalized);
    if (cached) {
      this.logger.debug(`[DB Cache Hit] ${normalized}: ${cached.currentStatus}`);
      return cached;
    }

    if (this.liveSource === 'gagnaveita') {
      return this.getRoadStatusFromGagnaveita(normalized);
    }

    return this.getRoadStatusFromLegacyRoadIs(normalized);
  }

  async getAllRoadStatuses(): Promise<Map<string, RoadStatus>> {
    const statuses = new Map<string, RoadStatus>();

    if (this.liveSource === 'gagnaveita') {
      const records = await this.fetchGagnaveitaRecords();
      if (!records) {
        for (const roadId of this.F_ROADS) {
          const fallback = await this.getFallbackStatus(roadId);
          if (fallback) statuses.set(roadId, fallback);
        }
        return statuses;
      }

      for (const roadId of this.F_ROADS) {
        const mapped = mapGagnaveitaPayloadToRoadStatus(records, roadId);
        if (mapped) {
          await this.saveToDatabase(mapped);
          statuses.set(roadId, mapped);
        }
      }
      this.logger.log(`成功获取 ${statuses.size}/${this.F_ROADS.length} 条路线状态 (Gagnaveita)`);
      return statuses;
    }

    this.logger.log(`开始获取 ${this.F_ROADS.length} 条 F-road 状态...`);
    const batchSize = 5;
    for (let i = 0; i < this.F_ROADS.length; i += batchSize) {
      const batch = this.F_ROADS.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((id) => this.getRoadStatus(id)));
      results.forEach((status, index) => {
        if (status) statuses.set(batch[index], status);
      });
      if (i + batchSize < this.F_ROADS.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    this.logger.log(`成功获取 ${statuses.size}/${this.F_ROADS.length} 条路线状态`);
    return statuses;
  }

  async isRoadOpen(roadId: string): Promise<boolean> {
    const status = await this.getRoadStatus(roadId);
    return status?.currentStatus === 'open';
  }

  async isRoadClosed(roadId: string): Promise<boolean> {
    const status = await this.getRoadStatus(roadId);
    return status?.currentStatus === 'closed';
  }

  private resolveLiveSource(): RoadLiveSource {
    const raw = (process.env.ROAD_STATUS_LIVE_SOURCE ?? 'gagnaveita').trim().toLowerCase();
    return raw === 'road.is' ? 'road.is' : 'gagnaveita';
  }

  private async getRoadStatusFromGagnaveita(roadId: string): Promise<RoadStatus | null> {
    try {
      const records = await this.fetchGagnaveitaRecords();
      if (!records) {
        this.logger.warn(`Gagnaveita 不可用，降级到静态数据 (${roadId})`);
        return this.getFallbackStatus(roadId);
      }

      const status =
        mapGagnaveitaPayloadToRoadStatus(records, roadId) ??
        (roadId === 'F208' ? mapGagnaveitaPayloadToF208Status(records) : null);

      if (!status) {
        this.logger.warn(`Gagnaveita 未映射 ${roadId}，降级到静态数据`);
        return this.getFallbackStatus(roadId);
      }

      await this.saveToDatabase(status);
      this.logger.log(
        `[Gagnaveita Success] ${roadId}: ${status.currentStatus} (${status.lastVerifiedAt.toISOString()})`,
      );
      return status;
    } catch (error) {
      this.logger.error(
        `Gagnaveita 获取 ${roadId} 失败:`,
        error instanceof Error ? error.message : error,
      );
      return this.getFallbackStatus(roadId);
    }
  }

  private async fetchGagnaveitaRecords(): Promise<GagnaveitaFaerdRecord[] | null> {
    if (
      this.gagnaveitaPayloadCache &&
      Date.now() - this.gagnaveitaPayloadCache.fetchedAt < this.CACHE_TTL_MS
    ) {
      return this.gagnaveitaPayloadCache.records;
    }

    this.logger.debug(`[Gagnaveita Query] ${this.GAGNAVEITA_API}`);
    const response = await this.httpClient.get<GagnaveitaFaerdRecord[]>(this.GAGNAVEITA_API);
    if (response.status !== 200 || !Array.isArray(response.data) || response.data.length === 0) {
      this.logger.warn(`Gagnaveita 返回异常: status=${response.status}`);
      return null;
    }

    this.gagnaveitaPayloadCache = {
      fetchedAt: Date.now(),
      records: response.data,
    };
    return response.data;
  }

  /** @deprecated road.is primary path — DNS UNRESOLVABLE on current egress */
  private async getRoadStatusFromLegacyRoadIs(roadId: string): Promise<RoadStatus | null> {
    try {
      this.logger.debug(`[Legacy road.is Query] ${roadId}`);
      const response = await this.httpClient.get<RoadIsAPIResponse>(this.ROAD_IS_API, {
        params: { road: roadId },
      });

      if (response.status !== 200) {
        this.logger.warn(`road.is 返回错误状态码: ${response.status}，尝试 Gagnaveita`);
        return this.getRoadStatusFromGagnaveita(roadId);
      }

      if (!response.data?.results || response.data.results.length === 0) {
        this.logger.warn(`road.is 未返回 ${roadId}，尝试 Gagnaveita`);
        return this.getRoadStatusFromGagnaveita(roadId);
      }

      const roadData = response.data.results[0];
      const status = this.mapLegacyRoadIsToTripNARAFormat(roadData, response.data);
      await this.saveToDatabase(status);
      return status;
    } catch (error) {
      this.logger.error(`road.is 获取 ${roadId} 失败，尝试 Gagnaveita`);
      return this.getRoadStatusFromGagnaveita(roadId);
    }
  }

  private async getFromDatabase(roadId: string): Promise<RoadStatus | null> {
    try {
      const record = await this.prisma.roadStatusRealtime.findFirst({
        where: {
          roadId,
          lastVerifiedAt: {
            gte: new Date(Date.now() - this.CACHE_TTL_MS),
          },
        },
        orderBy: { lastVerifiedAt: 'desc' },
      });

      if (!record) return null;
      return this.dbRecordToRoadStatus(record);
    } catch (error) {
      this.logger.error(`[DB Query Error] ${roadId}:`, error);
      return null;
    }
  }

  private async saveToDatabase(status: RoadStatus): Promise<void> {
    try {
      await this.prisma.roadStatusRealtime.create({
        data: {
          roadId: status.roadId,
          roadName: status.roadName || null,
          currentStatus: status.currentStatus,
          statusMessage: status.statusMessage || null,
          lastVerifiedAt: status.lastVerifiedAt,
          dataSource: status.dataSource || GAGNAVEITA_CANONICAL_PROVIDER,
          apiResponse: status.apiResponse || null,
          hazards: status.hazards,
          confidence: status.confidence || 0.88,
          seasonalFallback: status.seasonalFallback || false,
        },
      });
      this.logger.debug(`[DB Write] ${status.roadId} saved`);
    } catch (error) {
      this.logger.error(`[DB Write Error] ${status.roadId}:`, error);
    }
  }

  private dbRecordToRoadStatus(record: any): RoadStatus {
    return {
      roadId: record.roadId,
      roadName: record.roadName || undefined,
      currentStatus: record.currentStatus,
      statusMessage: record.statusMessage || undefined,
      lastVerifiedAt: record.lastVerifiedAt,
      dataSource: record.dataSource,
      apiResponse: record.apiResponse || undefined,
      hazards: Array.isArray(record.hazards) ? record.hazards : [],
      confidence: record.confidence,
      seasonalFallback: record.seasonalFallback,
    };
  }

  private mapLegacyRoadIsToTripNARAFormat(apiData: any, fullResponse?: any): RoadStatus {
    return {
      roadId: apiData.road_number,
      roadName: apiData.road_name,
      currentStatus: this.normalizeStatus(apiData.status),
      statusMessage: apiData.status_text_en || apiData.status_text,
      lastVerifiedAt: new Date(apiData.last_updated),
      dataSource: 'road.is_api',
      apiResponse: fullResponse,
      hazards: (apiData.warnings || []).map((w: any) => ({
        type: w.type,
        severity: this.normalizeSeverity(w.severity),
        description: w.message,
      })),
      conditions: apiData.conditions
        ? {
            surface: apiData.conditions.surface,
            visibility: apiData.conditions.visibility,
            windSpeedMs: apiData.conditions.wind_speed_ms,
            temperatureC: apiData.conditions.temperature_c,
          }
        : undefined,
      confidence: 0.9,
      seasonalFallback: false,
    };
  }

  private normalizeStatus(status: string): 'open' | 'closed' | 'limited' | 'unknown' {
    const normalized = status.toLowerCase().trim();
    if (normalized === 'open') return 'open';
    if (normalized === 'closed') return 'closed';
    if (normalized === 'limited') return 'limited';
    return 'unknown';
  }

  private normalizeSeverity(severity: string): 'low' | 'medium' | 'high' | 'very_high' {
    const normalized = severity.toLowerCase().trim();
    if (normalized === 'low') return 'low';
    if (normalized === 'medium') return 'medium';
    if (normalized === 'high') return 'high';
    if (normalized === 'very_high' || normalized === 'very high') return 'very_high';
    return 'medium';
  }

  private async getFallbackStatus(roadId: string): Promise<RoadStatus | null> {
    this.logger.warn(`使用静态数据源获取 ${roadId} 状态`);

    const currentMonth = new Date().getMonth() + 1;
    const isSummer = currentMonth >= 6 && currentMonth <= 9;
    const isHighlandRoad = this.F_ROADS.includes(roadId);

    if (!isHighlandRoad) {
      const status: RoadStatus = {
        roadId,
        currentStatus: 'open',
        statusMessage: 'Status based on static data - actual conditions may vary',
        lastVerifiedAt: new Date('2026-01-28'),
        dataSource: 'static_seasonal_data',
        hazards: [{
          type: 'UNVERIFIED_STATUS',
          severity: 'medium',
          description: 'Real-time API unavailable. Status based on historical patterns.',
        }],
        confidence: 0.6,
        seasonalFallback: true,
      };
      await this.saveToDatabase(status);
      return status;
    }

    const status: RoadStatus = {
      roadId,
      currentStatus: isSummer ? 'limited' : 'closed',
      statusMessage: isSummer
        ? `Typically open in summer (June-September). Status unverified.`
        : `Typically closed in winter (October-May). Status unverified.`,
      lastVerifiedAt: new Date('2026-01-28'),
      dataSource: 'static_seasonal_data',
      hazards: [
        {
          type: 'UNVERIFIED_STATUS',
          severity: 'high',
          description: 'Real-time API unavailable. Status based on seasonal patterns only.',
        },
        {
          type: 'MANUAL_VERIFICATION_REQUIRED',
          severity: 'high',
          description: 'MUST verify at vegagerdin.is or call 1777 before travel.',
        },
      ],
      confidence: 0.6,
      seasonalFallback: true,
    };

    const knownRoadInfo: Record<string, { name: string; typicalOpenPeriod: string }> = {
      'F208': { name: 'Fjallabaksleið nyrðri', typicalOpenPeriod: 'Late June - Early September' },
      'F26': { name: 'Sprengisandur', typicalOpenPeriod: 'Late June - September' },
      'F35': { name: 'Kjölur', typicalOpenPeriod: 'Mid June - September' },
      'F88': { name: 'Öskjuleið', typicalOpenPeriod: 'Late June - Early September' },
      'F910': { name: 'Askja - Herðubreiðarlindir', typicalOpenPeriod: 'Late June - August' },
    };

    const roadInfo = knownRoadInfo[roadId];
    if (roadInfo) {
      status.roadName = roadInfo.name;
      status.hazards.push({
        type: 'TYPICAL_SEASON',
        severity: 'low',
        description: `Typical opening period: ${roadInfo.typicalOpenPeriod}`,
      });
    }

    await this.saveToDatabase(status);
    this.logger.warn(`返回 ${roadId} 的静态状态: ${status.currentStatus}`);
    return status;
  }
}
