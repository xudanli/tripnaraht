// src/transport/services/google-routes.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { TransportOption, TransportMode } from '../interfaces/transport.interface';

/**
 * Google Routes API 服务
 * 
 * 功能：
 * 1. 调用 Google Routes API (v2) 获取真实路线数据
 * 2. 支持多种交通模式（TRANSIT, WALKING, DRIVING）
 * 3. 处理 API 错误和降级策略
 * 
 * API 文档：https://routes.googleapis.com/directions/v2:computeRoutes
 */
@Injectable()
export class GoogleRoutesService {
  private readonly logger = new Logger(GoogleRoutesService.name);
  private readonly apiKey: string | undefined;
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';
  
  // Circuit breaker: 如果连续失败超过阈值，暂时禁用 API
  private consecutiveFailures = 0;
  private readonly maxConsecutiveFailures = 3;
  private isCircuitOpen = false;
  private circuitOpenUntil: number | null = null;
  private readonly circuitResetMs = 5 * 60 * 1000; // 5分钟后重试

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_ROUTES_API_KEY');
    
    this.axiosInstance = axios.create({
      timeout: 10000, // 10 秒超时
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey || '',
      },
    });
  }

  /**
   * 查询路线（使用 Google Routes API）
   * 
   * @param fromLat 起点纬度
   * @param fromLng 起点经度
   * @param toLat 终点纬度
   * @param toLng 终点经度
   * @param travelMode 交通模式
   * @param preferences 偏好设置（如 LESS_WALKING）
   * @returns 交通选项列表
   */
  async getRoutes(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING' = 'TRANSIT',
    preferences?: {
      lessWalking?: boolean; // 少步行（适合老人）
      avoidHighways?: boolean;
      avoidTolls?: boolean;
    }
  ): Promise<TransportOption[]> {
    // 如果没有 API Key，返回空数组（使用估算）
    if (!this.apiKey) {
      this.logger.debug('Google Routes API Key 未配置，使用估算数据');
      return [];
    }

    // 检查熔断器状态
    if (this.isCircuitOpen) {
      if (this.circuitOpenUntil && Date.now() < this.circuitOpenUntil) {
        this.logger.debug('Google Routes API 熔断器开启，使用估算数据');
        return [];
      } else {
        // 熔断器超时，尝试重置
        this.logger.debug('Google Routes API 熔断器超时，尝试重置');
        this.isCircuitOpen = false;
        this.circuitOpenUntil = null;
        this.consecutiveFailures = 0;
      }
    }

    try {
      const requestBody = {
        origin: {
          location: {
            latLng: {
              latitude: fromLat,
              longitude: fromLng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: toLat,
              longitude: toLng,
            },
          },
        },
        travelMode: travelMode,
        routingPreference: 'TRAFFIC_AWARE', // 考虑实时路况
        computeAlternativeRoutes: false,
        ...(travelMode === 'TRANSIT' && {
          transitPreferences: {
            routingPreference: preferences?.lessWalking ? 'LESS_WALKING' : 'DEFAULT',
          },
        }),
        ...(travelMode === 'DRIVING' && {
          drivingOptions: {
            ...(preferences?.avoidHighways && { avoidHighways: true }),
            ...(preferences?.avoidTolls && { avoidTolls: true }),
          },
        }),
      };

      const response = await this.axiosInstance.post(this.baseUrl, requestBody);

      // 成功：重置失败计数
      this.consecutiveFailures = 0;
      this.isCircuitOpen = false;
      this.circuitOpenUntil = null;

      // 解析 Google Routes API 响应
      return this.parseGoogleRoutesResponse(response.data, travelMode);
    } catch (error: any) {
      // 增加失败计数
      this.consecutiveFailures++;
      
      // 检查是否是 403 错误（权限问题）
      const is403 = error.response?.status === 403;
      const is401 = error.response?.status === 401;
      
      if (is403 || is401) {
        const errorDetails = error.response?.data || {};
        const errorMessage = errorDetails.error?.message || error.message;
        
        this.logger.warn(
          `Google Routes API 认证失败 (${error.response?.status}): ${errorMessage}`,
          {
            apiKeyPresent: !!this.apiKey,
            apiKeyLength: this.apiKey?.length || 0,
            errorCode: errorDetails.error?.code,
            errorStatus: errorDetails.error?.status,
            consecutiveFailures: this.consecutiveFailures,
          }
        );
        
        // 如果是认证错误，立即打开熔断器（不需要等待多次失败）
        if (this.consecutiveFailures >= 1) {
          this.isCircuitOpen = true;
          this.circuitOpenUntil = Date.now() + this.circuitResetMs;
          this.logger.warn(
            `Google Routes API 因认证错误被暂时禁用，将在 ${this.circuitResetMs / 1000 / 60} 分钟后重试。` +
            `请检查：1) API Key 是否正确 2) Routes API 是否已启用 3) 计费是否已开启 4) API Key 是否有 Routes API 权限`
          );
        }
      } else {
        // 其他错误（网络、超时等）
        this.logger.debug(
          `Google Routes API 调用失败: ${error.message}`,
          {
            status: error.response?.status,
            consecutiveFailures: this.consecutiveFailures,
          }
        );
        
        // 如果连续失败超过阈值，打开熔断器
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          this.isCircuitOpen = true;
          this.circuitOpenUntil = Date.now() + this.circuitResetMs;
          this.logger.warn(
            `Google Routes API 因连续失败被暂时禁用，将在 ${this.circuitResetMs / 1000 / 60} 分钟后重试`
          );
        }
      }
      
      // 返回空数组，让系统使用估算数据
      return [];
    }
  }

  /**
   * 解析 Google Routes API 响应
   */
  private parseGoogleRoutesResponse(
    data: any,
    travelMode: string
  ): TransportOption[] {
    const options: TransportOption[] = [];

    if (!data.routes || data.routes.length === 0) {
      return options;
    }

    for (const route of data.routes) {
      const leg = route.legs?.[0];
      if (!leg) continue;

      // 计算总时长（秒转分钟）
      const durationSeconds = leg.duration?.value || 0;
      const durationMinutes = Math.round(durationSeconds / 60);

      // 计算步行距离（米）
      const walkDistance = leg.steps
        ?.filter((step: any) => step.travelMode === 'WALK')
        .reduce((sum: number, step: any) => sum + (step.distance?.value || 0), 0) || 0;

      // 计算换乘次数（仅公共交通）
      const transfers = travelMode === 'TRANSIT'
        ? (route.legs?.[0]?.steps?.filter((step: any) => step.travelMode === 'TRANSIT').length || 0) - 1
        : 0;

      // 估算费用（Google API 不直接提供费用，需要根据地区估算）
      const cost = this.estimateCostFromRoute(route, travelMode);

      // 映射交通模式
      let mode: TransportMode;
      if (travelMode === 'WALKING') {
        mode = TransportMode.WALKING;
      } else if (travelMode === 'DRIVING') {
        mode = TransportMode.TAXI; // 驾驶模式视为打车
      } else {
        mode = TransportMode.TRANSIT;
      }

      options.push({
        mode,
        durationMinutes,
        cost,
        walkDistance,
        transfers: transfers > 0 ? transfers : undefined,
        description: this.generateDescription(route, travelMode),
      });
    }

    return options;
  }

  /**
   * 根据路线估算费用
   */
  private estimateCostFromRoute(route: any, travelMode: string): number {
    const distanceMeters = route.legs?.[0]?.distance?.value || 0;

    if (travelMode === 'WALKING') {
      return 0;
    } else if (travelMode === 'DRIVING') {
      // 打车费用：起步 15 元，每公里 3 元
      const distanceKm = distanceMeters / 1000;
      return Math.round(15 + distanceKm * 3);
    } else {
      // 公共交通费用：起步 3 元，每 5 公里 +2 元
      if (distanceMeters < 5000) {
        return 3;
      }
      return 3 + Math.floor((distanceMeters - 5000) / 5000) * 2;
    }
  }

  /**
   * 生成路线描述
   */
  private generateDescription(route: any, travelMode: string): string {
    if (travelMode === 'WALKING') {
      return '步行：免费，距离较近';
    } else if (travelMode === 'DRIVING') {
      return '打车：门到门，最方便';
    } else {
      const transfers = route.legs?.[0]?.steps?.filter(
        (step: any) => step.travelMode === 'TRANSIT'
      ).length || 0;
      return transfers > 1
        ? `公共交通：需要换乘 ${transfers - 1} 次`
        : '公共交通：经济实惠';
    }
  }
}

