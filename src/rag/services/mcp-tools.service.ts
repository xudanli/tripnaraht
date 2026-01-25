/**
 * MCP Tools Service
 *
 * 用于 RAG 架构调用外部 MCP 工具（Web Browse, Google Places 等）
 *
 * 设计原则：
 * 1. 统一封装 MCP 工具调用
 * 2. 错误处理和降级
 * 3. 结果缓存
 * 4. 调用日志
 *
 * Phase 4 更新：集成真实 Skills
 * - Weather Skill (weather.search)
 * - Opening Hours Skill (opening_hours.get)
 * - POI Search Skill (poi.search)
 *
 * Phase 5.2 更新：性能优化
 * - 替换内存缓存为 HybridCacheService（Redis + Memory）
 * - 集成 RetryHelperService（指数退避重试）
 * - 错误处理优化
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { WeatherSearchSkill } from '../../skills/weather/weather-search.skill';
import { OpeningHoursGetSkill } from '../../skills/places/opening-hours-get.skill';
import { PoiSearchSkill } from '../../skills/places/poi-search.skill';
import { WebBrowseSkill } from '../../skills/web/web-browse.skill';
import { HybridCacheService } from './hybrid-cache.service';
import { RetryHelperService } from './retry-helper.service';

export interface McpToolCall {
  tool_name: string;
  input: any;
  output_summary?: string;
  output?: any;
  success: boolean;
  latency_ms: number;
  error?: string;
}

export interface WebBrowseResult {
  url: string;
  content: string;
  title?: string;
  success: boolean;
  cached?: boolean;
}

export interface GooglePlacesResult {
  place_id: string;
  name: string;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
    periods?: Array<{
      open: { day: number; time: string };
      close: { day: number; time: string };
    }>;
  };
  success: boolean;
  cached?: boolean;
}

export interface RoadStatusResult {
  road_id: string;
  status: 'OPEN' | 'CLOSED' | 'DIFFICULT' | 'IMPASSABLE';
  conditions?: string[];
  last_updated: string;
  success: boolean;
  cached?: boolean;
}

export interface WeatherResult {
  location: string;
  timestamp: string;
  temperature?: number;
  conditions?: string;
  wind_speed?: number;
  visibility?: number;
  warnings?: string[];
  success: boolean;
  cached?: boolean;
}

@Injectable()
export class McpToolsService {
  private readonly logger = new Logger(McpToolsService.name);

  constructor(
    @Optional() private readonly weatherSkill?: WeatherSearchSkill,
    @Optional() private readonly openingHoursSkill?: OpeningHoursGetSkill,
    @Optional() private readonly poiSearchSkill?: PoiSearchSkill,
    @Optional() private readonly webBrowseSkill?: WebBrowseSkill,
    @Optional() private readonly cacheService?: HybridCacheService,
    @Optional() private readonly retryHelper?: RetryHelperService,
  ) {
    this.logger.log('[McpToolsService] 初始化完成');
    if (this.weatherSkill) {
      this.logger.log('[McpToolsService] ✓ WeatherSearchSkill 已注入');
    }
    if (this.openingHoursSkill) {
      this.logger.log('[McpToolsService] ✓ OpeningHoursGetSkill 已注入');
    }
    if (this.poiSearchSkill) {
      this.logger.log('[McpToolsService] ✓ PoiSearchSkill 已注入');
    }
    if (this.webBrowseSkill) {
      this.logger.log('[McpToolsService] ✓ WebBrowseSkill 已注入');
    }
    if (this.cacheService) {
      this.logger.log('[McpToolsService] ✓ HybridCacheService 已注入');
    }
    if (this.retryHelper) {
      this.logger.log('[McpToolsService] ✓ RetryHelperService 已注入');
    }
  }

  /**
   * Web Browse - 浏览网页获取实时信息
   *
   * 用于 Level 4 降级策略
   * Phase 4.4: 集成真实的 web.browse Skill
   * Phase 5.2: 添加缓存和重试机制
   */
  async webBrowse(params: {
    url: string;
    query?: string;
    cacheTtlMinutes?: number;
  }): Promise<WebBrowseResult> {
    const startTime = Date.now();
    const cacheKey = `web_browse:${params.url}:${params.query || ''}`;

    try {
      // 检查缓存（Phase 5.2: 使用 HybridCacheService）
      if (this.cacheService) {
        const cached = await this.cacheService.get<WebBrowseResult>(cacheKey);
        if (cached) {
          this.logger.log(`[WebBrowse] Cache hit for ${params.url}`);
          return { ...cached, cached: true };
        }
      }

      // 使用 web.browse Skill（Phase 5.2: 添加重试机制）
      if (this.webBrowseSkill) {
        const operation = async () => {
          return await this.webBrowseSkill!.execute({
            url: params.url,
            query: params.query,
            disableCache: false, // 使用 Skill 内部缓存
            timeout: 15000,
          });
        };

        // 使用重试辅助器
        const retryResult = this.retryHelper
          ? await this.retryHelper.retryApiCall(operation, `web.browse:${params.url}`)
          : await operation().then(r => ({ result: r, success: true, attemptCount: 1, totalDuration: 0, lastError: undefined }));

        if (retryResult.success && retryResult.result) {
          const browseResult = retryResult.result;
          const result: WebBrowseResult = {
            url: browseResult.url,
            content: browseResult.content,
            title: browseResult.title,
            success: true, // ✅ 真实数据
            cached: browseResult.cached,
          };

          // 缓存结果（Phase 5.2: 使用 HybridCacheService）
          if (this.cacheService) {
            await this.cacheService.set(cacheKey, result, (params.cacheTtlMinutes || 60) * 60);
          }

          this.logger.log(
            `[WebBrowse] ✓ 成功浏览 ${params.url} (${browseResult.duration_ms}ms, 内容长度: ${browseResult.content.length}, 重试: ${retryResult.attemptCount - 1})`,
          );
          return result;
        } else {
          this.logger.warn(`[WebBrowse] web.browse 重试失败: ${retryResult.lastError?.message || 'Unknown error'}`);
        }
      }

      // 降级：返回失败结果
      this.logger.warn(
        `[WebBrowse] 无法获取网页内容，WebBrowseSkill 不可用或执行失败`,
      );

      return {
        url: params.url,
        content: '',
        success: false,
      };
    } catch (error: any) {
      this.logger.error(`[WebBrowse] Error: ${error.message}`, error.stack);
      return {
        url: params.url,
        content: '',
        success: false,
      };
    } finally {
      const latency = Date.now() - startTime;
      this.logger.log(`[WebBrowse] ${params.url} - ${latency}ms`);
    }
  }

  /**
   * Google Places - 获取 POI 详细信息（包括开放时间）
   *
   * Phase 4: 集成真实的 opening_hours.get 和 poi.search Skills
   * Phase 5.2: 添加缓存和重试机制
   */
  async getPlaceDetails(params: {
    place_id?: string;
    place_name?: string;
    location?: { lat: number; lng: number };
    fields?: string[];
    cacheTtlMinutes?: number;
  }): Promise<GooglePlacesResult> {
    const startTime = Date.now();
    const cacheKey = `google_places:${params.place_id || params.place_name}`;

    try {
      // 检查缓存（Phase 5.2: 使用 HybridCacheService）
      if (this.cacheService) {
        const cached = await this.cacheService.get<GooglePlacesResult>(cacheKey);
        if (cached) {
          this.logger.log(`[GooglePlaces] Cache hit for ${cacheKey}`);
          return { ...cached, cached: true };
        }
      }

      // 如果有 place_id，直接查询开放时间（Phase 5.2: 添加重试）
      if (params.place_id && this.openingHoursSkill) {
        const operation = async () => {
          return await this.openingHoursSkill!.execute({
            poi_ids: [params.place_id!],
          });
        };

        const retryResult = this.retryHelper
          ? await this.retryHelper.retryApiCall(operation, `opening_hours.get:${params.place_id}`)
          : await operation().then(r => ({ result: r, success: true, attemptCount: 1, totalDuration: 0, lastError: undefined }));

        if (retryResult.success && retryResult.result) {
          const openingHoursResult = retryResult.result;
          if (openingHoursResult.opening_hours && openingHoursResult.opening_hours.length > 0) {
            const poiData = openingHoursResult.opening_hours[0];
            const result: GooglePlacesResult = {
              place_id: params.place_id,
              name: params.place_name || params.place_id,
              opening_hours: this.convertToGooglePlacesFormat(poiData.opening_hours, poiData.is_open_now),
              success: true, // ✅ 真实数据
              cached: false,
            };

            // 缓存结果（Phase 5.2: 使用 HybridCacheService）
            if (this.cacheService) {
              await this.cacheService.set(cacheKey, result, (params.cacheTtlMinutes || 1440) * 60); // 24 小时
            }

            this.logger.log(`[GooglePlaces] ✓ 成功获取 place_id=${params.place_id} 的开放时间 (重试: ${retryResult.attemptCount - 1})`);
            return result;
          }
        } else {
          this.logger.warn(`[GooglePlaces] opening_hours.get 重试失败: ${retryResult.lastError?.message || 'Unknown error'}`);
        }
      }

      // 如果有 place_name，先搜索 POI，然后获取开放时间（Phase 5.2: 添加重试）
      if (params.place_name && this.poiSearchSkill && this.openingHoursSkill) {
        // 步骤1: 搜索 POI
        const searchOperation = async () => {
          return await this.poiSearchSkill!.execute({
            query: params.place_name!,
            lat: params.location?.lat,
            lng: params.location?.lng,
            limit: 1,
          });
        };

        const searchRetry = this.retryHelper
          ? await this.retryHelper.retryApiCall(searchOperation, `poi.search:${params.place_name}`)
          : await searchOperation().then(r => ({ result: r, success: true, attemptCount: 1, totalDuration: 0, lastError: undefined }));

        if (searchRetry.success && searchRetry.result) {
          const searchResult = searchRetry.result;
          if (searchResult.pois && searchResult.pois.length > 0) {
            const poi = searchResult.pois[0];

            // 步骤2: 获取开放时间
            const hoursOperation = async () => {
              return await this.openingHoursSkill!.execute({
                poi_ids: [poi.poi_id],
              });
            };

            const hoursRetry = this.retryHelper
              ? await this.retryHelper.retryApiCall(hoursOperation, `opening_hours.get:${poi.poi_id}`)
              : await hoursOperation().then(r => ({ result: r, success: true, attemptCount: 1, totalDuration: 0, lastError: undefined }));

            if (hoursRetry.success && hoursRetry.result) {
              const openingHoursResult = hoursRetry.result;
              if (openingHoursResult.opening_hours && openingHoursResult.opening_hours.length > 0) {
                const poiData = openingHoursResult.opening_hours[0];
                const result: GooglePlacesResult = {
                  place_id: poi.poi_id,
                  name: poi.name,
                  opening_hours: this.convertToGooglePlacesFormat(poiData.opening_hours, poiData.is_open_now),
                  success: true, // ✅ 真实数据
                  cached: false,
                };

                // 缓存结果（Phase 5.2: 使用 HybridCacheService）
                if (this.cacheService) {
                  await this.cacheService.set(cacheKey, result, (params.cacheTtlMinutes || 1440) * 60); // 24 小时
                }

                this.logger.log(`[GooglePlaces] ✓ 成功获取 ${poi.name} 的开放时间 (搜索重试: ${searchRetry.attemptCount - 1}, 开放时间重试: ${hoursRetry.attemptCount - 1})`);
                return result;
              }
            } else {
              this.logger.warn(`[GooglePlaces] opening_hours.get 重试失败: ${hoursRetry.lastError?.message || 'Unknown error'}`);
            }
          }
        } else {
          this.logger.warn(`[GooglePlaces] poi.search 重试失败: ${searchRetry.lastError?.message || 'Unknown error'}`);
        }
      }

      // 降级：返回失败结果
      this.logger.warn(
        `[GooglePlaces] 无法获取开放时间数据，Skills 不可用或查询失败`,
      );

      const fallbackResult: GooglePlacesResult = {
        place_id: params.place_id || '',
        name: params.place_name || '',
        success: false,
      };

      return fallbackResult;
    } catch (error: any) {
      this.logger.error(`[GooglePlaces] Error: ${error.message}`, error.stack);
      return {
        place_id: params.place_id || '',
        name: params.place_name || '',
        success: false,
      };
    } finally {
      const latency = Date.now() - startTime;
      this.logger.log(`[GooglePlaces] ${cacheKey} - ${latency}ms`);
    }
  }

  /**
   * 将内部开放时间格式转换为 Google Places 格式
   */
  private convertToGooglePlacesFormat(
    openingHours: any,
    isOpenNow?: boolean,
  ): GooglePlacesResult['opening_hours'] {
    if (!openingHours) return undefined;

    // 如果已经是正确的格式，直接返回
    if (openingHours.weekday_text || openingHours.periods) {
      return {
        open_now: isOpenNow,
        weekday_text: openingHours.weekday_text,
        periods: openingHours.periods,
      };
    }

    // 如果是简单的字符串，转换为 weekday_text 格式
    if (typeof openingHours === 'string') {
      return {
        open_now: isOpenNow,
        weekday_text: [openingHours],
      };
    }

    return undefined;
  }

  /**
   * Road Status - 获取道路状态（冰岛 road.is API）
   */
  async getRoadStatus(params: {
    road_id: string;
    cacheTtlMinutes?: number;
  }): Promise<RoadStatusResult> {
    const startTime = Date.now();
    const cacheKey = `road_status:${params.road_id}`;

    try {
      // 检查缓存
      const cached = await this.cacheService?.get<RoadStatusResult>(cacheKey);
      if (cached) {
        this.logger.log(`[RoadStatus] Cache hit for ${params.road_id}`);
        return { ...cached, cached: true };
      }

      // TODO: 集成真实的 road.is API
      // 目前返回模拟数据
      this.logger.warn(
        `[RoadStatus] API not yet integrated, returning mock data for ${params.road_id}`,
      );

      const mockResult: RoadStatusResult = {
        road_id: params.road_id,
        status: 'OPEN',
        conditions: ['Dry', 'Clear'],
        last_updated: new Date().toISOString(),
        success: false, // 标记为未成功，因为是 mock
      };

      // 缓存结果
      await this.cacheService?.set(cacheKey, mockResult, (params.cacheTtlMinutes || 60) * 60); // Convert minutes to seconds

      return mockResult;
    } catch (error: any) {
      this.logger.error(`[RoadStatus] Error: ${error.message}`, error.stack);
      return {
        road_id: params.road_id,
        status: 'OPEN',
        conditions: [],
        last_updated: new Date().toISOString(),
        success: false,
      };
    } finally {
      const latency = Date.now() - startTime;
      this.logger.log(`[RoadStatus] ${params.road_id} - ${latency}ms`);
    }
  }

  /**
   * Weather - 获取天气信息
   *
   * Phase 4: 集成真实的 weather.search Skill
   * Phase 5.2: 添加缓存和重试机制
   */
  async getWeather(params: {
    location: string;
    lat?: number;
    lng?: number;
    cacheTtlMinutes?: number;
  }): Promise<WeatherResult> {
    const startTime = Date.now();
    const cacheKey = `weather:${params.location}:${params.lat},${params.lng}`;

    try {
      // 检查缓存（Phase 5.2: 使用 HybridCacheService）
      if (this.cacheService) {
        const cached = await this.cacheService.get<WeatherResult>(cacheKey);
        if (cached) {
          this.logger.log(`[Weather] Cache hit for ${params.location}`);
          return { ...cached, cached: true };
        }
      }

      // 使用 weather.search Skill（Phase 5.2: 添加重试机制）
      if (this.weatherSkill && params.lat != null && params.lng != null) {
        const operation = async () => {
          return await this.weatherSkill!.execute({
            lat: params.lat!,
            lng: params.lng!,
            locationName: params.location,
            includeWindDetails: true, // 冰岛特定
            includeAuroraInfo: false,
          });
        };

        const retryResult = this.retryHelper
          ? await this.retryHelper.retryApiCall(operation, `weather.search:${params.location}`)
          : await operation().then(r => ({ result: r, success: true, attemptCount: 1, totalDuration: 0, lastError: undefined }));

        if (retryResult.success && retryResult.result) {
          const weatherResult = retryResult.result;
          const weather = weatherResult.weather;
          const result: WeatherResult = {
            location: params.location,
            timestamp: new Date().toISOString(),
            temperature: weather.temperature,
            conditions: weather.condition,
            wind_speed: weather.windSpeed,
            visibility: weather.visibility,
            warnings: weather.alerts?.map(a => a.description) || [],
            success: true, // ✅ 真实数据
            cached: false,
          };

          // 缓存结果（Phase 5.2: 使用 HybridCacheService）
          if (this.cacheService) {
            await this.cacheService.set(cacheKey, result, (params.cacheTtlMinutes || 30) * 60); // 30 分钟
          }

          this.logger.log(
            `[Weather] ✓ 成功获取 ${params.location} 的天气: ${weather.temperature}°C, ${weather.condition} (重试: ${retryResult.attemptCount - 1})`,
          );
          return result;
        } else {
          this.logger.warn(`[Weather] weather.search 重试失败: ${retryResult.lastError?.message || 'Unknown error'}`);
        }
      }

      // 降级：返回失败结果
      this.logger.warn(
        `[Weather] 无法获取天气数据，WeatherSkill 不可用或缺少坐标`,
      );

      const fallbackResult: WeatherResult = {
        location: params.location,
        timestamp: new Date().toISOString(),
        success: false,
      };

      return fallbackResult;
    } catch (error: any) {
      this.logger.error(`[Weather] Error: ${error.message}`, error.stack);
      return {
        location: params.location,
        timestamp: new Date().toISOString(),
        success: false,
      };
    } finally {
      const latency = Date.now() - startTime;
      this.logger.log(`[Weather] ${params.location} - ${latency}ms`);
    }
  }

  /**
   * 创建 McpToolCall 记录（用于决策日志）
   */
  createToolCallRecord(
    toolName: string,
    input: any,
    output: any,
    success: boolean,
    latencyMs: number,
    error?: string,
  ): McpToolCall {
    return {
      tool_name: toolName,
      input,
      output_summary:
        typeof output === 'string'
          ? output.substring(0, 200)
          : JSON.stringify(output).substring(0, 200),
      output,
      success,
      latency_ms: latencyMs,
      error,
    };
  }

  /**
   * 清理过期缓存（定期调用）
   * Phase 5.2: 委托给 HybridCacheService
   */
  clearExpiredCache(): void {
    if (this.cacheService) {
      const count = this.cacheService.cleanupExpired();
      this.logger.debug(`[McpToolsService] 清理了 ${count} 个过期缓存`);
    }
  }

  /**
   * 获取缓存统计信息（Phase 5.2 新增）
   */
  getCacheStats() {
    if (this.cacheService) {
      return this.cacheService.getStats();
    }
    return { memorySize: 0, redisConnected: false };
  }
}
