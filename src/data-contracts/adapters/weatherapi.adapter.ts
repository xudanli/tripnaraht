// src/data-contracts/adapters/weatherapi.adapter.ts

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeatherAdapter } from './weather.adapter.interface';
import { WeatherData, WeatherQuery, WeatherAlert } from '../interfaces/weather.interface';
import { BaseAdapter } from './base.adapter';
import { HttpClientFactory } from '../../common/utils/http-client.factory';
import { AdapterMapper } from '../../common/utils/adapter-mapper.util';

/**
 * WeatherAPI.com 适配器
 * 
 * 使用 WeatherAPI.com 作为天气数据源
 * 支持全球所有国家，提供实时天气和预报数据
 * 
 * API 文档: https://www.weatherapi.com/docs/
 */
@Injectable()
export class WeatherApiAdapter extends BaseAdapter implements WeatherAdapter {
  private readonly apiKey: string | undefined;

  constructor(@Optional() private configService?: ConfigService) {
    const apiKey = configService?.get<string>('WEATHERAPI_API_KEY');
    super(WeatherApiAdapter.name, {
      baseURL: 'http://api.weatherapi.com/v1',
      timeout: 10000,
    });
    this.apiKey = apiKey;
    
    // 重新创建带 API Key 的客户端（WeatherAPI 使用 'key' 作为参数名）
    this.httpClient = HttpClientFactory.create({
      baseURL: 'http://api.weatherapi.com/v1',
      timeout: 10000,
      params: {
        key: apiKey || '',
      },
    });
    
    // 禁用代理（axios 会自动使用环境变量中的 HTTP_PROXY/HTTPS_PROXY，但 WeatherAPI.com 不需要代理）
    // 如果代理服务器未运行，会导致 ECONNREFUSED 错误
    this.httpClient.defaults.proxy = false;
    // 同时禁用环境变量中的代理设置（仅针对此实例）
    if (this.httpClient.defaults.httpAgent) {
      delete this.httpClient.defaults.httpAgent;
    }
    if (this.httpClient.defaults.httpsAgent) {
      delete this.httpClient.defaults.httpsAgent;
    }
  }

  async getWeather(query: WeatherQuery): Promise<WeatherData> {
    try {
      if (!this.apiKey) {
        throw new Error('WEATHERAPI_API_KEY 未配置');
      }

      // 构建查询参数：使用坐标格式 "lat,lng"
      const q = `${query.lat},${query.lng}`;
      
      // 调用 WeatherAPI Current Weather API
      const response = await this.httpClient.get('/current.json', {
        params: {
          q,
          aqi: 'yes', // 包含空气质量数据
        },
      });

      const data = response.data;
      
      // 转换为标准格式
      const weatherData: WeatherData = {
        temperature: data.current?.temp_c || 0,
        feelsLikeTemperature: data.current?.feelslike_c,
        condition: this.mapWeatherCondition(data.current?.condition?.text),
        windSpeed: data.current?.wind_kph ? data.current.wind_kph / 3.6 : undefined, // 转换为米/秒
        windDirection: data.current?.wind_degree,
        humidity: data.current?.humidity,
        visibility: data.current?.vis_km ? data.current.vis_km * 1000 : undefined, // 转换为米
        alerts: this.extractAlerts(data),
        lastUpdated: new Date(data.current?.last_updated || Date.now()),
        source: 'weatherapi',
        metadata: {
          weatherapiLocation: data.location,
          uv: data.current?.uv,
          pressure: data.current?.pressure_mb,
          airQuality: data.current?.air_quality,
          conditionCode: data.current?.condition?.code,
          conditionIcon: data.current?.condition?.icon,
        },
      };

      return weatherData;
    } catch (error: any) {
      // 对于 403（API Key 无效/配额用尽）等错误，抛出异常以便路由器降级到其他适配器
      if (error.response?.status === 403 || error.response?.status === 401) {
        this.logger.warn(`WeatherAPI 认证失败 (${error.response?.status}): ${error.response?.data?.error?.message || error.message}，将降级到其他适配器`);
        throw new Error(`WeatherAPI 认证失败: ${error.response?.data?.error?.message || 'API Key 无效或配额用尽'}`);
      }
      
      // 对于其他错误，也抛出异常以便降级
      this.logger.error(`获取 WeatherAPI 天气数据失败: ${error.message}`);
      throw error;
    }
  }

  getSupportedCountries(): string[] {
    return ['*']; // WeatherAPI 支持全球所有国家
  }

  getPriority(): number {
    return 50; // 优先级高于默认适配器（100），低于特定国家适配器（如冰岛 10）
  }

  getName(): string {
    return 'WeatherAPI.com';
  }

  /**
   * 映射 WeatherAPI 天气条件到标准格式
   * 
   * WeatherAPI 返回的 condition.text 是描述性文本（如 "Partly cloudy"）
   * 需要映射到标准格式（如 "cloudy"）
   */
  private mapWeatherCondition(conditionText: string | undefined): string {
    if (!conditionText) {
      return 'unknown';
    }

    const text = conditionText.toLowerCase();
    
    // WeatherAPI 条件映射
    const conditionMap: Record<string, string> = {
      'sunny': 'sunny',
      'clear': 'sunny',
      'partly cloudy': 'cloudy',
      'cloudy': 'cloudy',
      'overcast': 'cloudy',
      'mist': 'foggy',
      'fog': 'foggy',
      'patchy rain possible': 'rainy',
      'patchy light rain': 'rainy',
      'light rain': 'rainy',
      'moderate rain': 'rainy',
      'heavy rain': 'rainy',
      'moderate or heavy rain shower': 'rainy',
      'torrential rain shower': 'rainy',
      'patchy light snow': 'snowy',
      'light snow': 'snowy',
      'moderate snow': 'snowy',
      'heavy snow': 'snowy',
      'blizzard': 'snowy',
      'patchy light snow with thunder': 'stormy',
      'moderate or heavy snow with thunder': 'stormy',
      'thundery outbreaks possible': 'stormy',
      'moderate or heavy rain with thunder': 'stormy',
      'haze': 'hazy',
      'windy': 'windy',
    };

    // 精确匹配
    if (conditionMap[text]) {
      return conditionMap[text];
    }

    // 模糊匹配
    if (text.includes('rain')) {
      return 'rainy';
    }
    if (text.includes('snow')) {
      return 'snowy';
    }
    if (text.includes('cloud')) {
      return 'cloudy';
    }
    if (text.includes('thunder') || text.includes('storm')) {
      return 'stormy';
    }
    if (text.includes('fog') || text.includes('mist')) {
      return 'foggy';
    }
    if (text.includes('sun') || text.includes('clear')) {
      return 'sunny';
    }
    if (text.includes('wind')) {
      return 'windy';
    }

    // 默认使用 AdapterMapper 的映射
    return AdapterMapper.mapWeatherCondition(conditionText);
  }

  /**
   * 提取天气警报
   * 
   * WeatherAPI 的 current.json 不包含警报信息
   * 如果需要警报，可以使用 forecast.json 或 alerts API
   */
  private extractAlerts(data: any): WeatherAlert[] {
    // WeatherAPI 的 current.json 不包含警报
    // 如果需要警报，可以：
    // 1. 调用 /forecast.json 获取预报数据
    // 2. 使用 /alerts.json（如果订阅了相应计划）
    // 3. 根据天气条件生成警告（如极端温度、强风等）
    
    const alerts: WeatherAlert[] = [];
    const current = data.current;

    if (!current) {
      return alerts;
    }

    // 根据天气条件生成警告
    if (current.temp_c > 35) {
      alerts.push({
        type: 'heat',
        severity: 'warning',
        title: '高温警告',
        description: `温度高达 ${current.temp_c}°C，请注意防暑降温`,
        effectiveTime: new Date(),
      });
    }

    if (current.temp_c < -10) {
      alerts.push({
        type: 'cold',
        severity: 'warning',
        title: '低温警告',
        description: `温度低至 ${current.temp_c}°C，请注意保暖`,
        effectiveTime: new Date(),
      });
    }

    const windSpeedMs = current.wind_kph ? current.wind_kph / 3.6 : 0;
    if (windSpeedMs > 15) {
      alerts.push({
        type: 'wind',
        severity: windSpeedMs > 25 ? 'critical' : 'warning',
        title: '强风警告',
        description: `风速 ${current.wind_kph} km/h，请注意安全`,
        effectiveTime: new Date(),
      });
    }

    if (current.vis_km && current.vis_km < 1) {
      alerts.push({
        type: 'visibility',
        severity: 'warning',
        title: '低能见度警告',
        description: `能见度仅 ${current.vis_km} km，请注意行车安全`,
        effectiveTime: new Date(),
      });
    }

    return alerts;
  }
}
