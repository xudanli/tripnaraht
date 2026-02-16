/**
 * Road.is API 集成服务
 *
 * 用途: 获取冰岛 F-road 实时开放状态
 * API: https://api.road.is/api/condition
 * 缓存: 15 分钟
 *
 * 使用示例:
 * const service = new RoadStatusRealtimeService();
 * const status = await service.getRoadStatus('F208');
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import axios, { AxiosInstance } from 'axios';

/**
 * Road.is API 响应格式
 */
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

/**
 * TripNARA 内部格式
 */
export interface RoadStatus {
  roadId: string;
  roadName?: string;
  currentStatus: 'open' | 'closed' | 'limited' | 'unknown';
  statusMessage?: string;
  lastVerifiedAt: Date;
  dataSource?: string; // 数据来源: 'road.is_api' | 'static_seasonal_data'
  apiResponse?: any; // 原始 API 响应（用于追溯）
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
  confidence?: number; // 置信度: 0.9 (API) | 0.6 (fallback)
  seasonalFallback?: boolean; // 是否使用降级数据
}

@Injectable()
export class RoadStatusRealtimeService {
  private readonly logger = new Logger('RoadStatusRealtimeService');
  private readonly ROAD_IS_API = 'https://api.road.is/api/condition';
  private readonly FALLBACK_API = 'https://gagnaveita.vegagerdin.is'; // 备用端点
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 分钟
  private readonly REQUEST_TIMEOUT_MS = 5000; // 5 秒超时
  private readonly httpClient: AxiosInstance;
  private readonly prisma: PrismaService | PrismaClient;

  // 关键 F-road 列表
  private readonly F_ROADS = [
    'F208', 'F26', 'F225', 'F35', 'F910', 'F550', 'F88', 'F862',
    'F206', 'F232', 'F210', 'F228', 'F261', 'F337', 'F821', 'F902',
    'F985', 'F233', 'F347', 'F578', 'F622', 'F980',
  ];

  constructor(
    @Optional() prisma?: PrismaService | PrismaClient,
  ) {
    this.prisma = prisma ?? new PrismaClient();
    this.httpClient = axios.create({
      timeout: this.REQUEST_TIMEOUT_MS,
      validateStatus: () => true, // 不抛出错误，手动处理状态码
    });
    this.logger.log('✅ RoadStatusRealtimeService 已初始化 (使用数据库缓存)');
  }

  /**
   * 获取特定 F-road 的实时状态
   */
  async getRoadStatus(roadId: string): Promise<RoadStatus | null> {
    // 1. 查询数据库缓存 (15 分钟内)
    const cached = await this.getFromDatabase(roadId);
    if (cached) {
      this.logger.debug(`[DB Cache Hit] ${roadId}: ${cached.currentStatus}`);
      return cached;
    }

    // 2. 缓存未命中，查询 API
    try {
      this.logger.debug(`[API Query] ${roadId}`);
      const response = await this.httpClient.get<RoadIsAPIResponse>(
        this.ROAD_IS_API,
        {
          params: { road: roadId },
        }
      );

      if (response.status !== 200) {
        this.logger.warn(`API 返回错误状态码: ${response.status}，降级到静态数据`);
        return await this.getFallbackStatus(roadId);
      }

      if (!response.data?.results || response.data.results.length === 0) {
        this.logger.warn(`API 未返回 ${roadId} 的数据，降级到静态数据`);
        return await this.getFallbackStatus(roadId);
      }

      // 3. 转换格式
      const roadData = response.data.results[0];
      const status = this.mapToTripNARAFormat(roadData, response.data);

      // 4. 写入数据库
      await this.saveToDatabase(status);

      this.logger.log(
        `[API Success] ${roadId}: ${status.currentStatus} (${status.lastVerifiedAt.toISOString()})`
      );

      return status;
    } catch (error) {
      this.logger.error(`获取 ${roadId} 状态失败:`, error instanceof Error ? error.message : error);
      this.logger.warn(`降级到静态数据源`);
      return await this.getFallbackStatus(roadId);
    }
  }

  /**
   * 批量获取所有关键 F-road 状态
   */
  async getAllRoadStatuses(): Promise<Map<string, RoadStatus>> {
    const statuses = new Map<string, RoadStatus>();

    this.logger.log(`开始获取 ${this.F_ROADS.length} 条 F-road 状态...`);

    // 并行请求，最多 5 个并发
    const batchSize = 5;
    for (let i = 0; i < this.F_ROADS.length; i += batchSize) {
      const batch = this.F_ROADS.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(roadId => this.getRoadStatus(roadId))
      );

      results.forEach((status, index) => {
        if (status) {
          statuses.set(batch[index], status);
        }
      });

      // 批次间延迟，避免频繁请求
      if (i + batchSize < this.F_ROADS.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.logger.log(`成功获取 ${statuses.size}/${this.F_ROADS.length} 条路线状态`);
    return statuses;
  }

  /**
   * 检查路线是否开放
   */
  async isRoadOpen(roadId: string): Promise<boolean> {
    const status = await this.getRoadStatus(roadId);
    return status?.currentStatus === 'open';
  }

  /**
   * 检查路线是否关闭
   */
  async isRoadClosed(roadId: string): Promise<boolean> {
    const status = await this.getRoadStatus(roadId);
    return status?.currentStatus === 'closed';
  }

  // ============ Private Methods ============

  /**
   * 从数据库获取（15 分钟内的缓存）
   */
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

  /**
   * 写入数据库
   */
  private async saveToDatabase(status: RoadStatus): Promise<void> {
    try {
      await this.prisma.roadStatusRealtime.create({
        data: {
          roadId: status.roadId,
          roadName: status.roadName || null,
          currentStatus: status.currentStatus,
          statusMessage: status.statusMessage || null,
          lastVerifiedAt: status.lastVerifiedAt,
          dataSource: status.dataSource || 'road.is_api',
          apiResponse: status.apiResponse || null,
          hazards: status.hazards,
          confidence: status.confidence || 0.9,
          seasonalFallback: status.seasonalFallback || false,
        },
      });
      this.logger.debug(`[DB Write] ${status.roadId} saved`);
    } catch (error) {
      // 写入失败不影响返回结果，只记录日志
      this.logger.error(`[DB Write Error] ${status.roadId}:`, error);
    }
  }

  /**
   * 数据库记录转换为 RoadStatus
   */
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

  /**
   * 格式转换: road.is API → TripNARA
   */
  private mapToTripNARAFormat(apiData: any, fullResponse?: any): RoadStatus {
    return {
      roadId: apiData.road_number,
      roadName: apiData.road_name,
      currentStatus: this.normalizeStatus(apiData.status),
      statusMessage: apiData.status_text_en || apiData.status_text,
      lastVerifiedAt: new Date(apiData.last_updated),
      dataSource: 'road.is_api',
      apiResponse: fullResponse, // 保存完整 API 响应用于追溯
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
      confidence: 0.9, // API 数据置信度高
      seasonalFallback: false,
    };
  }

  /**
   * 规范化状态值
   */
  private normalizeStatus(status: string): 'open' | 'closed' | 'limited' | 'unknown' {
    const normalized = status.toLowerCase().trim();
    if (normalized === 'open') return 'open';
    if (normalized === 'closed') return 'closed';
    if (normalized === 'limited') return 'limited';
    return 'unknown';
  }

  /**
   * 规范化严重程度
   */
  private normalizeSeverity(severity: string): 'low' | 'medium' | 'high' | 'very_high' {
    const normalized = severity.toLowerCase().trim();
    if (normalized === 'low') return 'low';
    if (normalized === 'medium') return 'medium';
    if (normalized === 'high') return 'high';
    if (normalized === 'very_high' || normalized === 'very high') return 'very_high';
    return 'medium';
  }

  /**
   * 降级方案: 从静态数据源获取道路状态
   * 当 API 不可用时使用（基于历史数据和季节性规律）
   */
  private async getFallbackStatus(roadId: string): Promise<RoadStatus | null> {
    this.logger.warn(`使用静态数据源获取 ${roadId} 状态`);

    // 静态规则: 基于月份判断高地道路状态
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const isSummer = currentMonth >= 6 && currentMonth <= 9; // 6-9月

    // 高地 F-road 通常只在夏季开放
    const isHighlandRoad = this.F_ROADS.includes(roadId);

    if (!isHighlandRoad) {
      // 非高地道路，通常全年开放
      const status: RoadStatus = {
        roadId,
        currentStatus: 'open',
        statusMessage: 'Status based on static data - actual conditions may vary',
        lastVerifiedAt: new Date('2026-01-28'), // 标记为静态数据时间
        dataSource: 'static_seasonal_data',
        hazards: [{
          type: 'UNVERIFIED_STATUS',
          severity: 'medium',
          description: 'Real-time API unavailable. Status based on historical patterns.',
        }],
        confidence: 0.6, // 降级数据置信度较低
        seasonalFallback: true,
      };

      // 写入数据库
      await this.saveToDatabase(status);

      return status;
    }

    // 高地道路: 根据季节判断
    const status: RoadStatus = {
      roadId,
      currentStatus: isSummer ? 'limited' : 'closed',
      statusMessage: isSummer
        ? `Typically open in summer (June-September). Status unverified.`
        : `Typically closed in winter (October-May). Status unverified.`,
      lastVerifiedAt: new Date('2026-01-28'), // 标记为静态数据时间
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
          description: 'MUST verify at road.is or call 1777 before travel.',
        },
      ],
      confidence: 0.6, // 降级数据置信度较低
      seasonalFallback: true,
    };

    // 对特定路线添加已知信息
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

    // 写入数据库
    await this.saveToDatabase(status);

    this.logger.warn(`返回 ${roadId} 的静态状态: ${status.currentStatus}`);
    return status;
  }
}

/**
 * 使用示例
 */
export async function exampleUsage() {
  const service = new RoadStatusRealtimeService();

  // 获取单条路线状态
  const f208Status = await service.getRoadStatus('F208');
  console.log('F208 状态:', f208Status);

  // 检查路线是否开放
  const isOpen = await service.isRoadOpen('F208');
  console.log('F208 是否开放:', isOpen);

  // 批量获取所有 F-road 状态
  const allStatuses = await service.getAllRoadStatuses();
  allStatuses.forEach((status, roadId) => {
    console.log(`${roadId}: ${status.currentStatus}`);
  });
}
