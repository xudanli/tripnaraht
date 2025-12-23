// src/data-contracts/adapters/default-weather.adapter.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeatherAdapter } from './weather.adapter.interface';
import { WeatherData, WeatherQuery, WeatherAlert } from '../interfaces/weather.interface';
import { BaseAdapter } from './base.adapter';
import { HttpClientFactory } from '../../common/utils/http-client.factory';
import { AdapterMapper } from '../../common/utils/adapter-mapper.util';

/**
 * 默认天气适配器（使用 OpenWeather API）
 * 
 * 支持所有国家，作为通用天气数据源
 */
@Injectable()
export class DefaultWeatherAdapter extends BaseAdapter implements WeatherAdapter {
  private readonly apiKey: string | undefined;

  constructor(private configService: ConfigService) {
    const apiKey = configService.get<string>('OPENWEATHER_API_KEY');
    super(DefaultWeatherAdapter.name, {
      baseURL: 'https://api.openweathermap.org/data/2.5',
      timeout: 10000,
    });
    this.apiKey = apiKey;
    // 重新创建带 API Key 的客户端
    this.httpClient = HttpClientFactory.createWithApiKey(apiKey, {
      baseURL: 'https://api.openweathermap.org/data/2.5',
      timeout: 10000,
      paramName: 'appid',
      additionalParams: { units: 'metric' },
    });
  }

  async getWeather(query: WeatherQuery): Promise<WeatherData> {
    return this.safeRequest(
      async () => {
        // 调用 OpenWeather Current Weather API
        const response = await this.httpClient.get('/weather', {
        params: {
          lat: query.lat,
          lon: query.lng,
        },
      });

      const data = response.data;
      
      // 转换为标准格式
      const weatherData: WeatherData = {
        temperature: data.main?.temp || 0,
        condition: this.mapWeatherCondition(data.weather?.[0]?.main),
        windSpeed: data.wind?.speed,
        windDirection: data.wind?.deg,
        humidity: data.main?.humidity,
        visibility: data.visibility ? data.visibility / 1000 : undefined, // 转换为公里
        alerts: this.extractAlerts(data),
        lastUpdated: new Date(),
        source: 'openweather',
        metadata: {
          openweatherId: data.id,
          timezone: data.timezone,
        },
      };

        return weatherData;
      },
      '获取天气数据失败',
      AdapterMapper.createDefaultErrorResponse<WeatherData>(
        'openweather',
        new Error('Unknown error'),
        {
          temperature: 0,
          condition: 'unknown',
        }
      )
    );
  }

  getSupportedCountries(): string[] {
    return ['*']; // 支持所有国家
  }

  getPriority(): number {
    return 100; // 默认适配器优先级较低
  }

  getName(): string {
    return 'OpenWeather (Default)';
  }

  /**
   * 映射 OpenWeather 天气条件到标准格式
   */
  private mapWeatherCondition(condition: string): string {
    return AdapterMapper.mapWeatherCondition(condition);
  }

  /**
   * 提取天气警报
   * 
   * OpenWeather 的免费 API 不包含警报信息
   * 这里返回空数组，实际可以使用 One Call API 3.0 获取警报
   */
  private extractAlerts(data: any): WeatherAlert[] {
    // TODO: 如果使用 One Call API，可以从 data.alerts 提取
    return [];
  }
}

