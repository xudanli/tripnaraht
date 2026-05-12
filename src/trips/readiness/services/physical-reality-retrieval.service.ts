// src/trips/readiness/services/physical-reality-retrieval.service.ts

/**
 * Physical Reality 数据检索服务
 * 
 * 从RAG系统中检索Physical Reality数据（道路状态、渡轮时刻表、天气窗口）
 * 用于地理分析和决策流程
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ChunkRetrievalService,
  type ChunkRetrievalParams,
} from '../../../rag/services/chunk-retrieval.service';
import { RagRealityPolicyGateService } from '../../../rag/services/rag-reality-policy-gate.service';
import type { RagSoftWorldScope } from '../../../rag/reality-policy/rag-soft-world-policy';
import { getBoundDecisionContext } from '../../reality-kernel/reality-context.storage';
import { PhysicalRealityQualityMonitorService } from './physical-reality-quality-monitor.service';

export interface RoadStateInfo {
  roadId: string;
  roadName: string;
  status: 'OPEN' | 'CLOSED' | 'SEASONAL' | 'RESTRICTED';
  seasonOpenFrom?: number;
  seasonOpenTo?: number;
  requires4x4?: boolean;
  hazards?: Array<{
    type: string;
    severity: string;
    description: string;
  }>;
  coordinates?: {
    start: { lat: number; lng: number; name?: string };
    end: { lat: number; lng: number; name?: string };
  };
  metadata?: any;
}

export interface FerryStateInfo {
  routeId: string;
  routeName: string;
  from: { name: string; coordinates: { lat: number; lng: number } };
  to: { name: string; coordinates: { lat: number; lng: number } };
  status: 'RUNNING' | 'CANCELLED' | 'SEASONAL';
  seasonOpenFrom?: number;
  seasonOpenTo?: number;
  schedule?: {
    summer?: { frequency: string; sailings: any[] };
    winter?: { frequency: string; sailings: any[] };
  };
  booking?: {
    required: boolean;
    recommended: boolean;
  };
  metadata?: any;
}

export interface WeatherWindowInfo {
  regionId: string;
  regionName: string;
  bestWindows?: Array<{
    months: number[];
    period: string;
    description: string;
    temperature?: { avg: number; min: number; max: number };
    precipitation?: { avg: number };
    wind?: { avg: number; max: number };
  }>;
  riskLevels?: Array<{
    month: number;
    riskLevel: string;
    risks: string[];
    recommendation: string;
  }>;
  extremeEvents?: Array<{
    type: string;
    severity: string;
    description: string;
    typicalMonths: number[];
  }>;
  coordinates?: {
    center: { lat: number; lng: number };
    bounds?: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
  };
  metadata?: any;
}

export interface PhysicalRealityData {
  roadStates: RoadStateInfo[];
  ferryStates: FerryStateInfo[];
  weatherWindows: WeatherWindowInfo[];
}

@Injectable()
export class PhysicalRealityRetrievalService {
  private readonly logger = new Logger(PhysicalRealityRetrievalService.name);

  constructor(
    private readonly chunkRetrievalService: ChunkRetrievalService,
    private readonly ragRealityPolicyGate: RagRealityPolicyGateService,
    @Optional() private readonly qualityMonitor?: PhysicalRealityQualityMonitorService,
  ) {}

  /**
   * 检索指定区域的Physical Reality数据
   * 
   * @param region 区域标识（如 'iceland', 'alps', 'greenland'）
   * @param lat 纬度（可选，用于空间检索）
   * @param lng 经度（可选，用于空间检索）
   * @param month 月份（1-12，用于过滤季节性数据）
   * @param options 检索选项
   */
  async retrievePhysicalRealityData(
    region: string,
    options?: {
      lat?: number;
      lng?: number;
      month?: number;
      limit?: number;
    }
  ): Promise<PhysicalRealityData> {
    const decisionContext = getBoundDecisionContext();
    const { scope } = this.ragRealityPolicyGate.resolve(decisionContext);
    const ragScope: RagSoftWorldScope = scope;
    if (ragScope === 'blocked') {
      return {
        roadStates: [],
        ferryStates: [],
        weatherWindows: [],
      };
    }
    const mergeRagParams = (p: ChunkRetrievalParams): ChunkRetrievalParams =>
      this.ragRealityPolicyGate.mergeChunkRetrievalParams(p, ragScope);

    const limit = options?.limit || 20;
    const month = options?.month;

    // 构建查询
    const queries = this.buildQueries(region, month);

    // 并行检索三类数据
    const [roadResults, ferryResults, weatherResults] = await Promise.all([
      this.retrieveRoadStates(region, queries.roadQuery, limit, mergeRagParams),
      this.retrieveFerryStates(region, queries.ferryQuery, limit, mergeRagParams),
      this.retrieveWeatherWindows(region, queries.weatherQuery, limit, mergeRagParams),
    ]);

    return {
      roadStates: roadResults,
      ferryStates: ferryResults,
      weatherWindows: weatherResults,
    };
  }

  /**
   * 构建检索查询
   */
  private buildQueries(region: string, month?: number): {
    roadQuery: string;
    ferryQuery: string;
    weatherQuery: string;
  } {
    const regionNames: Record<string, string> = {
      iceland: '冰岛',
      alps: '阿尔卑斯',
      greenland: '格陵兰',
      svalbard: '斯瓦尔巴',
      'faroe-islands': '法罗群岛',
      argentina: '阿根廷',
      lofoten: '罗弗敦群岛',
      'new-zealand-south-island': '新西兰南岛',
    };

    const regionName = regionNames[region] || region;

    let roadQuery = `${regionName} 道路状态 F-road 开放 季节性`;
    let ferryQuery = `${regionName} 渡轮 时刻表 班次`;
    let weatherQuery = `${regionName} 天气 最佳旅行时间 天气窗口`;

    if (month) {
      const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
      const monthName = monthNames[month];
      roadQuery += ` ${monthName}`;
      ferryQuery += ` ${monthName}`;
      weatherQuery += ` ${monthName}`;
    }

    return { roadQuery, ferryQuery, weatherQuery };
  }

  /**
   * 检索道路状态数据
   */
  private async retrieveRoadStates(
    region: string,
    query: string,
    limit: number,
    mergeRagParams: (p: ChunkRetrievalParams) => ChunkRetrievalParams,
  ): Promise<RoadStateInfo[]> {
    const startTime = Date.now();
    try {
      const results = await this.chunkRetrievalService.retrieve(
        mergeRagParams({
          query,
          limit,
          type: 'road_status',
          useHybridSearch: true,
          useReranking: false,
        }),
      );

      const latency = Date.now() - startTime;
      this.qualityMonitor?.recordRetrieval(latency, true);

      return results
        .map((result) => this.parseRoadState(result))
        .filter((state): state is RoadStateInfo => state !== null);
    } catch (error) {
      const latency = Date.now() - startTime;
      this.qualityMonitor?.recordRetrieval(latency, false);
      this.logger.error(`Failed to retrieve road states for ${region}:`, error);
      return [];
    }
  }

  /**
   * 检索渡轮状态数据
   */
  private async retrieveFerryStates(
    region: string,
    query: string,
    limit: number,
    mergeRagParams: (p: ChunkRetrievalParams) => ChunkRetrievalParams,
  ): Promise<FerryStateInfo[]> {
    const startTime = Date.now();
    try {
      const results = await this.chunkRetrievalService.retrieve(
        mergeRagParams({
          query,
          limit,
          type: 'ferry_schedules',
          useHybridSearch: true,
          useReranking: false,
        }),
      );

      const latency = Date.now() - startTime;
      this.qualityMonitor?.recordRetrieval(latency, true);

      return results
        .map((result) => this.parseFerryState(result))
        .filter((state): state is FerryStateInfo => state !== null);
    } catch (error) {
      const latency = Date.now() - startTime;
      this.qualityMonitor?.recordRetrieval(latency, false);
      this.logger.error(`Failed to retrieve ferry states for ${region}:`, error);
      return [];
    }
  }

  /**
   * 检索天气窗口数据
   */
  private async retrieveWeatherWindows(
    region: string,
    query: string,
    limit: number,
    mergeRagParams: (p: ChunkRetrievalParams) => ChunkRetrievalParams,
  ): Promise<WeatherWindowInfo[]> {
    const startTime = Date.now();
    try {
      const results = await this.chunkRetrievalService.retrieve(
        mergeRagParams({
          query,
          limit,
          type: 'weather_windows',
          useHybridSearch: true,
          useReranking: false,
        }),
      );

      const latency = Date.now() - startTime;
      this.qualityMonitor?.recordRetrieval(latency, true);

      return results
        .map((result) => this.parseWeatherWindow(result))
        .filter((window): window is WeatherWindowInfo => window !== null);
    } catch (error) {
      const latency = Date.now() - startTime;
      this.qualityMonitor?.recordRetrieval(latency, false);
      this.logger.error(`Failed to retrieve weather windows for ${region}:`, error);
      return [];
    }
  }

  /**
   * 解析道路状态数据
   */
  private parseRoadState(result: any): RoadStateInfo | null {
    try {
      const metadata = result.metadata || {};
      const content = result.content || '';

      // 优先从metadata中提取roadId（索引时已存储）
      const roadId = metadata.roadId;
      if (!roadId) {
        // 如果metadata中没有，尝试从content中提取
        const extractedId = this.extractRoadId(content);
        if (!extractedId) {
          this.logger.debug(`Skipping road state: no roadId found in metadata or content`);
          return null;
        }
      }

      // 从content中提取道路名称
      const roadName = this.extractRoadName(content) || roadId;

      // 解析状态（优先从content中提取，因为content包含更详细的状态信息）
      const status = this.extractRoadStatus(content, metadata);

      // 解析开放季节（从content中提取月份）
      const seasonMonths = this.extractSeasonMonths(content);
      const seasonOpenFrom = seasonMonths?.from || metadata.seasonOpenFrom;
      const seasonOpenTo = seasonMonths?.to || metadata.seasonOpenTo;

      // 解析4x4要求（从content中提取）
      const requires4x4 = this.extractRequires4x4(content, metadata);

      // 解析危险信息（从content中提取）
      const hazards = this.extractHazards(content, metadata);

      // 解析坐标（优先从metadata中提取，如果没有则从content中提取）
      const coordinatesRaw = metadata.coordinates || this.extractCoordinates(content, metadata);
      // 确保coordinates格式正确（道路状态需要start/end格式）
      const coordinates = coordinatesRaw && 'start' in coordinatesRaw
        ? coordinatesRaw
        : coordinatesRaw && 'center' in coordinatesRaw
        ? undefined // 天气窗口格式，道路状态不支持，返回undefined
        : undefined;

      return {
        roadId: roadId || this.extractRoadId(content)!,
        roadName,
        status,
        seasonOpenFrom,
        seasonOpenTo,
        requires4x4,
        hazards,
        coordinates,
        metadata: {
          ...metadata,
          sourceFile: result.sourceFile,
          similarity: result.similarity,
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to parse road state:`, error);
      return null;
    }
  }

  /**
   * 解析渡轮状态数据
   */
  private parseFerryState(result: any): FerryStateInfo | null {
    try {
      const metadata = result.metadata || {};
      const content = result.content || '';

      const routeId = metadata.routeId || this.extractRouteId(content);
      const routeName = this.extractRouteName(content);

      if (!routeId) {
        return null;
      }

      return {
        routeId,
        routeName: routeName || routeId,
        from: this.extractFromPort(content, metadata),
        to: this.extractToPort(content, metadata),
        status: this.extractFerryStatus(content, metadata),
        seasonOpenFrom: this.extractSeasonOpenFrom(content, metadata),
        seasonOpenTo: this.extractSeasonOpenTo(content, metadata),
        schedule: this.extractSchedule(content, metadata),
        booking: this.extractBooking(content, metadata),
        metadata: {
          ...metadata,
          sourceFile: result.sourceFile,
          similarity: result.similarity,
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to parse ferry state:`, error);
      return null;
    }
  }

  /**
   * 解析天气窗口数据
   */
  private parseWeatherWindow(result: any): WeatherWindowInfo | null {
    try {
      const metadata = result.metadata || {};
      const content = result.content || '';

      const regionId = metadata.regionId || this.extractRegionId(content);
      const regionName = this.extractRegionName(content);

      if (!regionId) {
        return null;
      }

      const coordinatesRaw = this.extractCoordinates(content, metadata);
      // 确保coordinates格式正确（天气窗口需要center格式）
      const weatherCoordinates: { center: { lat: number; lng: number }; bounds?: { north: number; south: number; east: number; west: number } } | undefined = 
        coordinatesRaw && 'center' in coordinatesRaw 
          ? coordinatesRaw 
          : coordinatesRaw && 'start' in coordinatesRaw
          ? { center: { lat: (coordinatesRaw.start.lat + coordinatesRaw.end.lat) / 2, lng: (coordinatesRaw.start.lng + coordinatesRaw.end.lng) / 2 } }
          : undefined;

      return {
        regionId,
        regionName: regionName || regionId,
        bestWindows: this.extractBestWindows(content, metadata),
        riskLevels: this.extractRiskLevels(content, metadata),
        extremeEvents: this.extractExtremeEvents(content, metadata),
        coordinates: weatherCoordinates,
        metadata: {
          ...metadata,
          sourceFile: result.sourceFile,
          similarity: result.similarity,
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to parse weather window:`, error);
      return null;
    }
  }

  // 辅助解析方法（改进版：优先从metadata提取，从content补充）
  private extractRoadId(content: string): string | null {
    // 尝试多种格式
    const patterns = [
      /道路ID[:\s]+([^\n]+)/i,
      /roadId[:\s]+([^\n\s]+)/i,
      /F-?(\d+)/i, // F208, F-208
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractRoadName(content: string): string | null {
    const patterns = [
      /道路名称[:\s]+([^\n]+)/i,
      /道路名称（英文）[:\s]+([^\n]+)/i,
      /roadName[:\s]+([^\n]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractRoadStatus(content: string, _metadata: any): 'OPEN' | 'CLOSED' | 'SEASONAL' | 'RESTRICTED' {
    const statusLower = content.toLowerCase();
    
    // 检查当前状态
    if (statusLower.includes('当前状态: closed') || statusLower.includes('currentstatus: closed')) {
      return 'CLOSED';
    }
    if (statusLower.includes('当前状态: open') || statusLower.includes('currentstatus: open')) {
      // 如果有季节性信息，返回SEASONAL
      if (statusLower.includes('seasonal') || statusLower.includes('季节性') || statusLower.includes('开放季节')) {
        return 'SEASONAL';
      }
      return 'OPEN';
    }
    
    // 检查状态字段
    if (statusLower.includes('状态: closed') || statusLower.includes('status: closed')) {
      return 'CLOSED';
    }
    if (statusLower.includes('状态: seasonal') || statusLower.includes('状态: 季节性')) {
      return 'SEASONAL';
    }
    if (statusLower.includes('状态: restricted') || statusLower.includes('状态: 限制')) {
      return 'RESTRICTED';
    }
    if (statusLower.includes('状态: open') || statusLower.includes('状态: 开放')) {
      return 'OPEN';
    }
    
    // 默认推断
    if (statusLower.includes('closed') || statusLower.includes('关闭')) return 'CLOSED';
    if (statusLower.includes('seasonal') || statusLower.includes('季节性') || statusLower.includes('开放季节')) return 'SEASONAL';
    if (statusLower.includes('restricted') || statusLower.includes('限制')) return 'RESTRICTED';
    
    return 'OPEN';
  }

  private extractSeasonMonths(content: string): { from: number; to: number } | null {
    // 匹配格式：开放季节: 夏季（6-9月）或 openMonths: [6, 7, 8, 9]
    const patterns = [
      /开放季节[:\s]+[^（]*（(\d+)[-–](\d+)月）/i,
      /openMonths[:\s]*\[[\s]*(\d+)[\s,]*[\s,]*(\d+)/i,
      /开放月份[:\s]*(\d+)[-–](\d+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const from = parseInt(match[1]);
        const to = parseInt(match[2]);
        if (from >= 1 && from <= 12 && to >= 1 && to <= 12) {
          return { from, to };
        }
      }
    }
    
    // 尝试提取月份数组
    const monthArrayMatch = content.match(/\[[\s]*(\d+)[\s,]+(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (monthArrayMatch) {
      const months = [
        parseInt(monthArrayMatch[1]),
        parseInt(monthArrayMatch[2]),
        parseInt(monthArrayMatch[3]),
        parseInt(monthArrayMatch[4]),
      ].filter(m => m >= 1 && m <= 12);
      if (months.length >= 2) {
        return { from: Math.min(...months), to: Math.max(...months) };
      }
    }
    
    return null;
  }

  private extractSeasonOpenFrom(content: string, metadata: any): number | undefined {
    const seasonMonths = this.extractSeasonMonths(content);
    return seasonMonths?.from || metadata.seasonOpenFrom;
  }

  private extractSeasonOpenTo(content: string, metadata: any): number | undefined {
    const seasonMonths = this.extractSeasonMonths(content);
    return seasonMonths?.to || metadata.seasonOpenTo;
  }

  private extractRequires4x4(content: string, _metadata: any): boolean {
    const contentLower = content.toLowerCase();
    return (
      contentLower.includes('4x4') ||
      contentLower.includes('四驱') ||
      contentLower.includes('越野') ||
      contentLower.includes('需要4x4') ||
      contentLower.includes('必须4x4') ||
      contentLower.includes('vehicletype: 4x4') ||
      contentLower.includes('车辆类型: 4x4')
    );
  }

  private extractHazards(content: string, metadata: any): Array<{ type: string; severity: string; description: string }> | undefined {
    // 尝试从metadata中提取
    if (metadata.hazards && Array.isArray(metadata.hazards)) {
      return metadata.hazards.map((h: any) => ({
        type: h.type || 'unknown',
        severity: h.severity || 'medium',
        description: h.description || '',
      }));
    }
    
    // 从content中提取危险信息
    const hazards: Array<{ type: string; severity: string; description: string }> = [];
    const hazardLines = content.match(/危险[:\s]*\n((?:  [^\n]+\n?)+)/i);
    
    if (hazardLines) {
      const lines = hazardLines[1].split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          // 解析格式：type: description 或 type: severity
          const parts = trimmed.split(':');
          if (parts.length >= 2) {
            hazards.push({
              type: parts[0].trim(),
              severity: parts[1].includes('high') || parts[1].includes('高') ? 'high' : 'medium',
              description: parts.slice(1).join(':').trim(),
            });
          }
        }
      }
    }
    
    return hazards.length > 0 ? hazards : undefined;
  }

  private extractCoordinates(content: string, metadata: any): 
    | { start: { lat: number; lng: number; name?: string }; end: { lat: number; lng: number; name?: string } }
    | { center: { lat: number; lng: number }; bounds?: { north: number; south: number; east: number; west: number } }
    | undefined {
    // 优先从metadata中提取
    if (metadata.coordinates) {
      // 检查格式：如果是道路状态，返回start/end格式；如果是天气窗口，返回center格式
      if (metadata.coordinates.start && metadata.coordinates.end) {
        return metadata.coordinates as { start: { lat: number; lng: number; name?: string }; end: { lat: number; lng: number; name?: string } };
      }
      if (metadata.coordinates.center) {
        return metadata.coordinates as { center: { lat: number; lng: number }; bounds?: { north: number; south: number; east: number; west: number } };
      }
    }
    
    // 从content中提取坐标（简化实现）
    // 实际数据中坐标通常在metadata中，这里作为fallback
    return undefined;
  }

  private extractRouteId(content: string): string | null {
    const patterns = [
      /路线ID[:\s]+([^\n]+)/i,
      /routeId[:\s]+([^\n\s]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractRouteName(content: string): string | null {
    const patterns = [
      /路线名称[:\s]+([^\n]+)/i,
      /路线名称（英文）[:\s]+([^\n]+)/i,
      /routeName[:\s]+([^\n]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractFromPort(content: string, metadata: any): { name: string; coordinates: { lat: number; lng: number } } {
    // 优先从metadata中提取
    if (metadata.from) {
      return {
        name: metadata.from.name || '',
        coordinates: metadata.from.coordinates || { lat: 0, lng: 0 },
      };
    }
    
    // 从content中提取
    const fromMatch = content.match(/出发港口[:\s]+([^\n]+)/i);
    const name = fromMatch ? fromMatch[1].trim() : '';
    
    return {
      name,
      coordinates: { lat: 0, lng: 0 }, // 坐标通常在metadata中
    };
  }

  private extractToPort(content: string, metadata: any): { name: string; coordinates: { lat: number; lng: number } } {
    // 优先从metadata中提取
    if (metadata.to) {
      return {
        name: metadata.to.name || '',
        coordinates: metadata.to.coordinates || { lat: 0, lng: 0 },
      };
    }
    
    // 从content中提取
    const toMatch = content.match(/到达港口[:\s]+([^\n]+)/i);
    const name = toMatch ? toMatch[1].trim() : '';
    
    return {
      name,
      coordinates: { lat: 0, lng: 0 }, // 坐标通常在metadata中
    };
  }

  private extractFerryStatus(content: string, _metadata: any): 'RUNNING' | 'CANCELLED' | 'SEASONAL' {
    const contentLower = content.toLowerCase();
    
    if (contentLower.includes('cancelled') || contentLower.includes('取消') || contentLower.includes('停运')) {
      return 'CANCELLED';
    }
    if (contentLower.includes('seasonal') || contentLower.includes('季节性') || contentLower.includes('夏季时刻表') || contentLower.includes('冬季时刻表')) {
      return 'SEASONAL';
    }
    return 'RUNNING';
  }

  private extractSchedule(content: string, metadata: any): { summer?: { frequency: string; sailings: any[] }; winter?: { frequency: string; sailings: any[] } } | undefined {
    // 优先从metadata中提取
    if (metadata.schedule) {
      return metadata.schedule;
    }
    
    // 从content中提取
    const schedule: { summer?: { frequency: string; sailings: any[] }; winter?: { frequency: string; sailings: any[] } } = {};
    
    const summerMatch = content.match(/夏季时刻表[:\s]+([^\n]+)/i);
    if (summerMatch) {
      schedule.summer = {
        frequency: summerMatch[1].trim(),
        sailings: [],
      };
    }
    
    const winterMatch = content.match(/冬季时刻表[:\s]+([^\n]+)/i);
    if (winterMatch) {
      schedule.winter = {
        frequency: winterMatch[1].trim(),
        sailings: [],
      };
    }
    
    return Object.keys(schedule).length > 0 ? schedule : undefined;
  }

  private extractBooking(content: string, metadata: any): { required: boolean; recommended: boolean } | undefined {
    // 优先从metadata中提取
    if (metadata.booking) {
      return {
        required: metadata.booking.required || false,
        recommended: metadata.booking.recommended || false,
      };
    }
    
    // 从content中提取
    const contentLower = content.toLowerCase();
    const required = contentLower.includes('需要预订: 是') || contentLower.includes('required: true');
    const recommended = contentLower.includes('建议预订: 是') || contentLower.includes('recommended: true');
    
    if (required || recommended) {
      return { required, recommended };
    }
    
    return undefined;
  }

  private extractRegionId(content: string): string | null {
    const patterns = [
      /区域ID[:\s]+([^\n]+)/i,
      /regionId[:\s]+([^\n\s]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractRegionName(content: string): string | null {
    const patterns = [
      /区域名称[:\s]+([^\n]+)/i,
      /区域名称（英文）[:\s]+([^\n]+)/i,
      /regionName[:\s]+([^\n]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractBestWindows(content: string, metadata: any): Array<{ months: number[]; period: string; description: string }> | undefined {
    // 优先从metadata中提取
    if (metadata.bestWindows && Array.isArray(metadata.bestWindows)) {
      return metadata.bestWindows;
    }
    
    // 从content中提取最佳窗口（简化实现）
    const windows: Array<{ months: number[]; period: string; description: string }> = [];
    const windowMatches = content.match(/最佳旅行窗口[:\s]*\n((?:  [^\n]+\n?)+)/i);
    
    if (windowMatches) {
      // 解析格式：夏季（6-8月）: 描述
      const lines = windowMatches[1].split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          const periodMatch = trimmed.match(/([^（]+)（(\d+)[-–](\d+)月）[:\s]+(.+)/);
          if (periodMatch) {
            const from = parseInt(periodMatch[2]);
            const to = parseInt(periodMatch[3]);
            const months: number[] = [];
            for (let m = from; m <= to; m++) {
              months.push(m);
            }
            windows.push({
              months,
              period: periodMatch[1].trim(),
              description: periodMatch[4].trim(),
            });
          }
        }
      }
    }
    
    return windows.length > 0 ? windows : undefined;
  }

  private extractRiskLevels(content: string, metadata: any): Array<{ month: number; riskLevel: string; risks: string[]; recommendation: string }> | undefined {
    // 优先从metadata中提取
    if (metadata.riskLevels && Array.isArray(metadata.riskLevels)) {
      return metadata.riskLevels;
    }
    
    // 从content中提取风险等级（简化实现）
    return undefined;
  }

  private extractExtremeEvents(content: string, metadata: any): Array<{ type: string; severity: string; description: string; typicalMonths: number[] }> | undefined {
    // 优先从metadata中提取
    if (metadata.extremeEvents && Array.isArray(metadata.extremeEvents)) {
      return metadata.extremeEvents;
    }
    
    // 从content中提取极端事件（简化实现）
    return undefined;
  }
}
