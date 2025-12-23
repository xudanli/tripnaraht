// src/data-contracts/adapters/iceland-weather.adapter.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeatherAdapter } from './weather.adapter.interface';
import { WeatherData, WeatherQuery, ExtendedWeatherData, WeatherAlert } from '../interfaces/weather.interface';
import { BaseAdapter } from './base.adapter';
import { AdapterMapper } from '../../common/utils/adapter-mapper.util';

/**
 * 冰岛天气适配器
 * 
 * 接入 Vedur.is API（冰岛气象局）
 * 提供实时天气、风速、阵风、气象预警等信息
 * 
 * API 文档: https://vedur.is/
 */
@Injectable()
export class IcelandWeatherAdapter extends BaseAdapter implements WeatherAdapter {
  constructor(private configService: ConfigService) {
    super(IcelandWeatherAdapter.name, {
      baseURL: 'https://vedur.is',
      timeout: 15000,
    });
  }

  async getWeather(query: WeatherQuery): Promise<WeatherData> {
    return this.safeRequest(
      async () => {
        // 调用 Vedur.is API
        // 注意：实际 API 端点可能需要根据文档调整
        const response = await this.httpClient.get('/api/weather', {
        params: {
          lat: query.lat,
          lon: query.lng,
        },
      });

      const data = response.data;
      
      // 转换为标准格式
      const weatherData = await this.mapToWeatherData(data, query);
      
        return weatherData;
      },
      '获取冰岛天气失败',
      AdapterMapper.createDefaultErrorResponse<WeatherData>(
        'vedur.is',
        new Error('Unknown error'),
        {
          temperature: 0,
          condition: 'unknown',
        }
      )
    );
  }

  getSupportedCountries(): string[] {
    return ['IS']; // 仅支持冰岛
  }

  getPriority(): number {
    return 10; // 冰岛特定适配器优先级高
  }

  getName(): string {
    return 'Iceland Vedur.is';
  }

  /**
   * 将 Vedur.is API 响应映射为标准 WeatherData 格式
   * 
   * 关键字段：
   * - wind_speed: 平均风速（米/秒）
   * - wind_gust: 最大阵风（米/秒）- 冰岛车门被吹掉的主因
   * - alerts: Yellow/Orange/Red Alert
   */
  private async mapToWeatherData(data: any, query: WeatherQuery): Promise<ExtendedWeatherData> {
    const weatherData: ExtendedWeatherData = {
      temperature: data.temperature || data.temp || 0,
      condition: this.mapWeatherCondition(data.condition || data.weather),
      windSpeed: data.wind_speed || data.windSpeed,
      windDirection: data.wind_direction || data.windDirection,
      humidity: data.humidity,
      visibility: data.visibility,
      alerts: this.extractAlerts(data),
      lastUpdated: new Date(),
      source: 'vedur.is',
      metadata: {
        rawData: data,
        query: query,
      },
    };

    // 冰岛特定字段
    if (query.includeWindDetails) {
      weatherData.windGust = data.wind_gust || data.windGust;
    }

    // 如果需要极光信息
    if (query.includeAuroraInfo) {
      // TODO: 调用极光 API
      // weatherData.auroraKPIndex = await this.getAuroraKPIndex(query);
      // weatherData.cloudCover = await this.getCloudCover(query);
      // weatherData.auroraVisibility = this.calculateAuroraVisibility(weatherData.auroraKPIndex, weatherData.cloudCover);
    }

    return weatherData;
  }

  /**
   * 映射天气状况
   */
  private mapWeatherCondition(condition: string): string {
    return AdapterMapper.mapWeatherCondition(condition);
  }

  /**
   * 提取天气警报
   * 
   * Vedur.is 提供 Yellow/Orange/Red Alert
   */
  private extractAlerts(data: any): WeatherAlert[] {
    const alerts: WeatherAlert[] = [];

    if (data.alerts && Array.isArray(data.alerts)) {
      for (const alert of data.alerts) {
        alerts.push({
          type: alert.type || 'weather',
          severity: this.mapSeverity(alert.severity || alert.level),
          title: alert.title || alert.headline,
          description: alert.description || alert.text,
          effectiveTime: alert.effectiveTime ? new Date(alert.effectiveTime) : new Date(),
          expiryTime: alert.expiryTime ? new Date(alert.expiryTime) : undefined,
        });
      }
    }

    // 处理单个警报对象
    if (data.alert && !Array.isArray(data.alerts)) {
      alerts.push({
        type: data.alert.type || 'weather',
        severity: this.mapSeverity(data.alert.severity || data.alert.level),
        title: data.alert.title || data.alert.headline,
        description: data.alert.description || data.alert.text,
        effectiveTime: data.alert.effectiveTime ? new Date(data.alert.effectiveTime) : new Date(),
        expiryTime: data.alert.expiryTime ? new Date(data.alert.expiryTime) : undefined,
      });
    }

    return alerts;
  }

  /**
   * 映射严重程度
   */
  private mapSeverity(severity: string): 'info' | 'warning' | 'critical' {
    return AdapterMapper.mapSeverity(severity);
  }
}

