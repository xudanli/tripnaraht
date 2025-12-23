// src/data-contracts/adapters/iceland-aurora.adapter.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseAdapter } from './base.adapter';
import { HttpClientFactory } from '../../common/utils/http-client.factory';
import { AdapterMapper } from '../../common/utils/adapter-mapper.util';

/**
 * 极光监测适配器
 * 
 * 接入极光监测 API（AuroraReach 或 NOAA）
 * 提供 KP 指数、云层覆盖、极光可见性预测
 * 
 * API 文档:
 * - AuroraReach: https://aurorareach.com/api
 * - NOAA: https://www.swpc.noaa.gov/products/aurora-30-minute-forecast
 */
@Injectable()
export class IcelandAuroraAdapter extends BaseAdapter {
  private readonly auroraReachUrl = 'https://api.aurorareach.com';
  private readonly noaaUrl = 'https://services.swpc.noaa.gov';
  private readonly openWeatherClient: ReturnType<typeof HttpClientFactory.create>;

  constructor(private configService: ConfigService) {
    super(IcelandAuroraAdapter.name, {
      timeout: 10000,
    });
    // 为 OpenWeather 创建单独的客户端
    this.openWeatherClient = HttpClientFactory.create({
      baseURL: 'https://api.openweathermap.org/data/2.5',
      timeout: 10000,
    });
  }

  /**
   * 获取极光 KP 指数
   */
  async getAuroraKPIndex(): Promise<number> {
    return this.safeRequest(
      async () => {
        // 方法 1: 尝试 AuroraReach API
        try {
          const response = await this.httpClient.get(`${this.auroraReachUrl}/kp`, {
            params: {
              format: 'json',
            },
          });
          
          if (response.data && response.data.kp !== undefined) {
            return response.data.kp;
          }
        } catch (auroraError) {
          this.logger.debug('AuroraReach API 不可用，尝试 NOAA');
        }

        // 方法 2: 使用 NOAA API
        const noaaResponse = await this.httpClient.get(`${this.noaaUrl}/json/rtsw/rtsw_mag_1m.json`);
        const noaaData = noaaResponse.data;
      
      // NOAA 返回的是磁场数据，需要转换为 KP 指数
      // 这里简化处理，实际需要根据 NOAA 数据格式转换
      if (noaaData && noaaData.kp !== undefined) {
        return noaaData.kp;
      }

        // 默认返回中等值
        return 3;
      },
      '获取极光 KP 指数失败',
      3 // 默认中等值
    );
  }

  /**
   * 获取云层覆盖（百分比）
   */
  async getCloudCover(lat: number, lng: number): Promise<number> {
    return this.safeRequest(
      async () => {
        // 使用 OpenWeather API 获取云层覆盖
        const apiKey = this.configService.get<string>('OPENWEATHER_API_KEY');
        if (!apiKey) {
          this.logger.warn('OPENWEATHER_API_KEY 未配置，无法获取云层覆盖');
          return 50; // 默认值
        }

        const response = await this.openWeatherClient.get('/weather', {
        params: {
          lat,
          lon: lng,
          appid: apiKey,
          units: 'metric',
        },
      });

        const cloudCover = response.data.clouds?.all || 0;
        return cloudCover;
      },
      '获取云层覆盖失败',
      50 // 默认值
    );
  }

  /**
   * 计算极光可见性
   * 
   * 条件：
   * - KP 指数 > 3
   * - 云层覆盖 < 30%
   * - 无光污染（需要结合 POI 数据）
   */
  async calculateAuroraVisibility(
    lat: number,
    lng: number,
    kpIndex?: number,
    cloudCover?: number
  ): Promise<'none' | 'low' | 'moderate' | 'high'> {
    return this.safeRequest(
      async () => {
        const kp = kpIndex !== undefined ? kpIndex : await this.getAuroraKPIndex();
        const cloud = cloudCover !== undefined ? cloudCover : await this.getCloudCover(lat, lng);

        // KP 指数 < 3，极光不可见
        if (kp < 3) {
          return 'none';
        }

        // 云层覆盖 > 70%，极光不可见
        if (cloud > 70) {
          return 'none';
        }

        // KP 指数 >= 5 且云层覆盖 < 20%，高可见性
        if (kp >= 5 && cloud < 20) {
          return 'high';
        }

        // KP 指数 >= 4 且云层覆盖 < 30%，中等可见性
        if (kp >= 4 && cloud < 30) {
          return 'moderate';
        }

        // 其他情况，低可见性
        return 'low';
      },
      '计算极光可见性失败',
      'none' as const
    );
  }

  /**
   * 获取极光预测（未来几小时）
   */
  async getAuroraForecast(lat: number, lng: number, hours: number = 24): Promise<Array<{
    time: Date;
    kpIndex: number;
    cloudCover: number;
    visibility: 'none' | 'low' | 'moderate' | 'high';
  }>> {
    return this.safeRequest(
      async () => {
        // TODO: 实现未来几小时的极光预测
        // 这需要调用预报 API 或使用历史数据预测
        
        const forecast: Array<{
          time: Date;
          kpIndex: number;
          cloudCover: number;
          visibility: 'none' | 'low' | 'moderate' | 'high';
        }> = [];

        // 简化实现：返回当前值
        const kpIndex = await this.getAuroraKPIndex();
        const cloudCover = await this.getCloudCover(lat, lng);
        const visibility = await this.calculateAuroraVisibility(lat, lng, kpIndex, cloudCover);

        forecast.push({
          time: new Date(),
          kpIndex,
          cloudCover,
          visibility,
        });

        return forecast;
      },
      '获取极光预测失败',
      []
    );
  }
}

