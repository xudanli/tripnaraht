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

      // 解析 Google Routes API 响应
      return this.parseGoogleRoutesResponse(response.data, travelMode);
    } catch (error: any) {
      this.logger.error(
        `Google Routes API 调用失败: ${error.message}`,
        error.stack
      );
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

