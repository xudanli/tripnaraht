// src/transport/services/amap-routes.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { TransportOption, TransportMode } from '../interfaces/transport.interface';

/**
 * 高德地图路线规划服务
 * 
 * 功能：
 * 1. 调用高德地图 API 获取真实路线数据
 * 2. 支持多种交通模式（公交、步行、驾车）
 * 3. 处理 API 错误和降级策略
 * 
 * API 文档：https://lbs.amap.com/api/webservice/guide/api/direction
 */
@Injectable()
export class AmapRoutesService {
  private readonly logger = new Logger(AmapRoutesService.name);
  private readonly apiKey: string | undefined;
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://restapi.amap.com/v3/direction';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('AMAP_API_KEY');
    
    this.axiosInstance = axios.create({
      timeout: 10000, // 10 秒超时
      params: {
        key: this.apiKey || '',
      },
    });
  }

  /**
   * 查询路线（使用高德地图 API）
   * 
   * @param fromLat 起点纬度
   * @param fromLng 起点经度
   * @param toLat 终点纬度
   * @param toLng 终点经度
   * @param travelMode 交通模式
   * @param preferences 偏好设置
   * @returns 交通选项列表
   */
  async getRoutes(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: 'transit' | 'walking' | 'driving' = 'transit',
    preferences?: {
      lessWalking?: boolean; // 少步行（适合老人）
      avoidHighways?: boolean;
      avoidTolls?: boolean;
    }
  ): Promise<TransportOption[]> {
    // 如果没有 API Key，返回空数组（使用估算）
    if (!this.apiKey) {
      this.logger.debug('高德地图 API Key 未配置，使用估算数据');
      return [];
    }

    try {
      let apiPath: string;
      let params: Record<string, any> = {
        origin: `${fromLng},${fromLat}`, // 高德使用 经度,纬度 格式
        destination: `${toLng},${toLat}`,
      };

      // 根据交通模式选择不同的 API 端点
      switch (travelMode) {
        case 'transit':
          apiPath = '/transit/integrated';
          params.extensions = 'all'; // 返回详细信息
          if (preferences?.lessWalking) {
            params.strategy = '2'; // 少换乘
          }
          break;
        case 'walking':
          apiPath = '/walking';
          break;
        case 'driving':
          apiPath = '/driving';
          if (preferences?.avoidHighways) {
            params.strategy = '2'; // 不走高速
          }
          if (preferences?.avoidTolls) {
            params.strategy = '3'; // 不走高速且避免收费
          }
          break;
        default:
          apiPath = '/transit/integrated';
      }

      const response = await this.axiosInstance.get(this.baseUrl + apiPath, { params });

      // 解析高德地图 API 响应
      return this.parseAmapResponse(response.data, travelMode);
    } catch (error: any) {
      this.logger.error(
        `高德地图 API 调用失败: ${error.message}`,
        error.stack
      );
      // 返回空数组，让系统使用估算数据
      return [];
    }
  }

  /**
   * 解析高德地图 API 响应
   */
  private parseAmapResponse(
    data: any,
    travelMode: string
  ): TransportOption[] {
    const options: TransportOption[] = [];

    if (!data || data.status !== '1') {
      this.logger.warn(`高德地图 API 返回错误: ${data?.info || '未知错误'}`);
      return options;
    }

    // 公交路线
    if (travelMode === 'transit' && data.route?.transits) {
      for (const transit of data.route.transits.slice(0, 3)) { // 最多返回 3 个方案
        // 高德 API 返回的 duration 和 cost 可能是字符串，需要转换
        const durationSeconds = typeof transit.duration === 'string' 
          ? parseInt(transit.duration, 10) 
          : (transit.duration || 0);
        const duration = Math.round(durationSeconds / 60); // 秒转分钟
        const distance = typeof transit.distance === 'string'
          ? parseInt(transit.distance, 10)
          : (transit.distance || 0);
        const cost = typeof transit.cost === 'string'
          ? parseFloat(transit.cost)
          : (transit.cost || 0);

        // 计算步行距离（使用 walking_distance 字段，如果没有则从 segments 计算）
        let walkDistance = parseInt(transit.walking_distance || '0', 10);
        if (walkDistance === 0 && transit.segments) {
          for (const segment of transit.segments) {
            if (segment.walking) {
              const segDistance = typeof segment.walking.distance === 'string'
                ? parseInt(segment.walking.distance, 10)
                : (segment.walking.distance || 0);
              walkDistance += segDistance;
            }
          }
        }

        // 计算换乘次数
        // 高德 API 中，segments 数组包含 walking、bus、railway 等
        // 换乘次数 = 交通段数（bus/railway/subway）- 1
        const transitSegments = transit.segments?.filter(
          (seg: any) => seg.bus || seg.railway || seg.subway
        ) || [];
        const transfers = Math.max(0, transitSegments.length - 1);

        this.logger.debug(
          `高德公交路线: 时长=${duration}分钟, 费用=${cost}元, 步行=${walkDistance}米, 换乘=${transfers}次`
        );

        options.push({
          mode: TransportMode.TRANSIT,
          durationMinutes: duration,
          cost: Math.round(cost * 100), // 转换为分
          walkDistance,
          transfers: transfers > 0 ? transfers : undefined,
          description: this.generateTransitDescription(transit, transfers),
        });
      }
    }
    // 步行路线
    else if (travelMode === 'walking' && data.route?.paths) {
      const path = data.route.paths[0];
      if (path) {
        const duration = Math.round((path.duration || 0) / 60);
        const distance = path.distance || 0;

        options.push({
          mode: TransportMode.WALKING,
          durationMinutes: duration,
          cost: 0,
          walkDistance: distance,
          description: `步行：约 ${Math.round(distance / 1000 * 10) / 10} 公里`,
        });
      }
    }
    // 驾车路线
    else if (travelMode === 'driving' && data.route?.paths) {
      const path = data.route.paths[0];
      if (path) {
        const duration = Math.round((path.duration || 0) / 60);
        const distance = path.distance || 0;
        const tolls = path.tolls || 0; // 过路费（元）
        const tollDistance = path.toll_distance || 0; // 收费路段距离（米）

        // 估算打车费用：起步价 + 里程费
        const estimatedCost = this.estimateTaxiCost(distance, duration);

        options.push({
          mode: TransportMode.TAXI,
          durationMinutes: duration,
          cost: Math.round(estimatedCost * 100), // 转换为分
          walkDistance: 0,
          description: `打车：约 ${Math.round(distance / 1000 * 10) / 10} 公里，${tolls > 0 ? `过路费 ${tolls} 元` : '无过路费'}`,
        });
      }
    }

    return options;
  }

  /**
   * 生成公交路线描述
   */
  private generateTransitDescription(transit: any, transfers: number): string {
    if (transfers === 0) {
      return '公共交通：直达，无需换乘';
    } else if (transfers === 1) {
      return '公共交通：需要换乘 1 次';
    } else {
      return `公共交通：需要换乘 ${transfers} 次`;
    }
  }

  /**
   * 估算打车费用
   * 
   * 根据城市不同，起步价和里程费不同
   * 这里使用通用估算：起步价 13 元，每公里 2.5 元
   */
  private estimateTaxiCost(distanceMeters: number, durationMinutes: number): number {
    const distanceKm = distanceMeters / 1000;
    
    // 起步价 13 元（3 公里内）
    if (distanceKm <= 3) {
      return 13;
    }
    
    // 超过 3 公里：起步价 + (距离 - 3) * 每公里价格
    return 13 + (distanceKm - 3) * 2.5;
  }
}
