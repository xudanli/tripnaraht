// src/data-contracts/adapters/iceland-weather.adapter.ts

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeatherAdapter } from './weather.adapter.interface';
import { WeatherData, WeatherQuery, ExtendedWeatherData, WeatherAlert } from '../interfaces/weather.interface';
import { BaseAdapter } from './base.adapter';
import { AdapterMapper } from '../../common/utils/adapter-mapper.util';

/**
 * 冰岛天气适配器
 * 
 * 接入 apis.is Weather API（冰岛官方开放数据）
 * 数据来源：Icelandic Meteorological Office (Vedur.is)
 * 提供实时天气观测数据、风速、阵风、气象预警等信息
 * 
 * API 文档: https://docs.apis.is/#endpoint-weather
 * 观测站列表: http://en.vedur.is/weather/stations/
 */
@Injectable()
export class IcelandWeatherAdapter extends BaseAdapter implements WeatherAdapter {
  // 主要观测站编号（根据坐标选择最近的）
  private readonly majorStations = [
    { id: '1', name: 'Reykjavík', lat: 64.1470, lng: -21.9408 },      // 雷克雅未克
    { id: '422', name: 'Akureyri', lat: 65.6839, lng: -18.1105 },      // 阿克雷里
    { id: '30', name: 'Egilsstaðir', lat: 65.2643, lng: -14.3948 },   // 埃伊尔斯塔济
    { id: '1480', name: 'Vestmannaeyjar', lat: 63.4427, lng: -20.2734 }, // 韦斯特曼纳群岛
    { id: '1479', name: 'Höfn', lat: 64.2539, lng: -15.2083 },        // 赫本
  ];

  constructor(@Optional() private configService?: ConfigService) {
    super(IcelandWeatherAdapter.name, {
      baseURL: 'http://apis.is',
      timeout: 15000,
    });
    
    // 禁用代理（apis.is 不需要代理，且代理服务器可能未运行）
    this.httpClient.defaults.proxy = false;
    if (this.httpClient.defaults.httpAgent) {
      delete this.httpClient.defaults.httpAgent;
    }
    if (this.httpClient.defaults.httpsAgent) {
      delete this.httpClient.defaults.httpsAgent;
    }
  }

  async getWeather(query: WeatherQuery): Promise<WeatherData> {
    try {
      // 根据坐标选择最近的观测站
      const stationId = this.findNearestStation(query.lat, query.lng);
      
      // 调用 apis.is Weather Observations API
      const response = await this.httpClient.get('/weather/observations/en', {
        params: {
          stations: stationId,
          time: '1h',      // 每小时更新的自动观测站数据
          anytime: '0',     // 如果当前数据不可用则返回错误
        },
      });

      const data = response.data;
      
      // 检查响应格式
      if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
        throw new Error('未找到观测站数据');
      }

      // 使用第一个结果（应该只有一个，因为我们只查询一个观测站）
      const observation = data.results[0];
      
      // 转换为标准格式
      const weatherData = await this.mapToWeatherData(observation, query);
      
      return weatherData;
    } catch (error: any) {
      // 对于证书过期等错误，抛出异常以便路由器降级到其他适配器
      if (error.code === 'CERT_HAS_EXPIRED' || error.message?.includes('certificate')) {
        this.logger.warn(`apis.is SSL 证书错误: ${error.message}，将降级到其他适配器`);
        throw new Error(`apis.is SSL 证书错误: ${error.message}`);
      }
      
      // 对于其他错误，也抛出异常以便降级
      this.logger.error(`获取冰岛天气失败: ${error.message}`);
      throw error;
    }
  }

  getSupportedCountries(): string[] {
    return ['IS']; // 仅支持冰岛
  }

  getPriority(): number {
    return 10; // 冰岛特定适配器优先级高
  }

  getName(): string {
    return 'Iceland apis.is (Vedur.is)';
  }

  /**
   * 根据坐标找到最近的观测站
   */
  private findNearestStation(lat: number, lng: number): string {
    let minDistance = Infinity;
    let nearestStation = this.majorStations[0]; // 默认使用雷克雅未克

    for (const station of this.majorStations) {
      const distance = this.calculateDistance(lat, lng, station.lat, station.lng);
      if (distance < minDistance) {
        minDistance = distance;
        nearestStation = station;
      }
    }

    this.logger.debug(`选择观测站: ${nearestStation.name} (${nearestStation.id}), 距离: ${minDistance.toFixed(2)} km`);
    return nearestStation.id;
  }

  /**
   * 计算两点之间的距离（公里）
   * 使用 Haversine 公式
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * 将 apis.is Weather API 响应映射为标准 WeatherData 格式
   * 
   * apis.is 响应字段说明：
   * - T: 温度 (°C)
   * - F: 风速 (m/s)
   * - FX: 最大风速 (m/s)
   * - FG: 最大阵风 (m/s) - 冰岛车门被吹掉的主因
   * - D: 风向（如 N, NNE, NE）
   * - W: 天气描述
   * - V: 能见度 (km)
   * - N: 云层覆盖 (%)
   * - P: 气压 (hPa)
   * - RH: 湿度 (%)
   * - TD: 露点 (°C)
   * - R: 降水量 (mm/h)
   */
  private async mapToWeatherData(observation: any, query: WeatherQuery): Promise<ExtendedWeatherData> {
    // 解析风向（字符串如 "N", "NNE", "NE"）转换为度数
    const windDirection = this.parseWindDirection(observation.D);

    const weatherData: ExtendedWeatherData = {
      temperature: parseFloat(observation.T) || 0,
      condition: this.mapWeatherCondition(observation.W),
      windSpeed: parseFloat(observation.F) || undefined,
      windDirection: windDirection,
      humidity: observation.RH ? parseFloat(observation.RH) : undefined,
      visibility: observation.V ? parseFloat(observation.V) * 1000 : undefined, // 转换为米
      alerts: this.extractAlerts(observation),
      lastUpdated: observation.time ? new Date(observation.time) : new Date(),
      source: 'apis.is',
      metadata: {
        stationName: observation.name,
        stationId: observation.id,
        windGust: observation.FG ? parseFloat(observation.FG) : undefined,
        maxWindSpeed: observation.FX ? parseFloat(observation.FX) : undefined,
        pressure: observation.P ? parseFloat(observation.P) : undefined,
        cloudCover: observation.N ? parseFloat(observation.N) : undefined,
        dewPoint: observation.TD ? parseFloat(observation.TD) : undefined,
        precipitation: observation.R ? parseFloat(observation.R) : undefined,
        rawData: observation,
        query: query,
      },
    };

    // 冰岛特定字段：阵风（重要！）
    if (query.includeWindDetails || observation.FG) {
      weatherData.windGust = observation.FG ? parseFloat(observation.FG) : undefined;
      weatherData.cloudCover = observation.N ? parseFloat(observation.N) : undefined;
    }

    // 如果需要极光信息
    if (query.includeAuroraInfo) {
      // TODO: 调用极光 API
      // weatherData.auroraKPIndex = await this.getAuroraKPIndex(query);
      // weatherData.cloudCover = observation.N ? parseFloat(observation.N) : undefined;
      // weatherData.auroraVisibility = this.calculateAuroraVisibility(weatherData.auroraKPIndex, weatherData.cloudCover);
    }

    return weatherData;
  }

  /**
   * 解析风向字符串为度数
   * N=0°, NNE=22.5°, NE=45°, ENE=67.5°, E=90°, ...
   */
  private parseWindDirection(direction: string | undefined): number | undefined {
    if (!direction) {
      return undefined;
    }

    const directionMap: Record<string, number> = {
      'N': 0,
      'NNE': 22.5,
      'NE': 45,
      'ENE': 67.5,
      'E': 90,
      'ESE': 112.5,
      'SE': 135,
      'SSE': 157.5,
      'S': 180,
      'SSW': 202.5,
      'SW': 225,
      'WSW': 247.5,
      'W': 270,
      'WNW': 292.5,
      'NW': 315,
      'NNW': 337.5,
      'Calm': 0,
    };

    return directionMap[direction.toUpperCase()] ?? undefined;
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
   * apis.is 的观测数据不包含警报信息
   * 可以根据风速、能见度等条件生成警告
   */
  private extractAlerts(observation: any): WeatherAlert[] {
    const alerts: WeatherAlert[] = [];

    // 根据阵风速度生成警告（冰岛车门被吹掉的主因）
    const windGust = observation.FG ? parseFloat(observation.FG) : 0;
    if (windGust > 25) {
      alerts.push({
        type: 'wind',
        severity: 'critical',
        title: '极端强风警告',
        description: `阵风速度高达 ${windGust} m/s，请避免在户外活动，特别注意车门安全`,
        effectiveTime: observation.time ? new Date(observation.time) : new Date(),
      });
    } else if (windGust > 18) {
      alerts.push({
        type: 'wind',
        severity: 'warning',
        title: '强风警告',
        description: `阵风速度 ${windGust} m/s，请注意安全，小心车门被风吹开`,
        effectiveTime: observation.time ? new Date(observation.time) : new Date(),
      });
    }

    // 根据能见度生成警告
    const visibility = observation.V ? parseFloat(observation.V) : undefined;
    if (visibility !== undefined && visibility < 1) {
      alerts.push({
        type: 'visibility',
        severity: 'warning',
        title: '低能见度警告',
        description: `能见度仅 ${visibility} km，请注意行车安全`,
        effectiveTime: observation.time ? new Date(observation.time) : new Date(),
      });
    }

    // 根据温度生成警告
    const temperature = parseFloat(observation.T) || 0;
    if (temperature < -10) {
      alerts.push({
        type: 'cold',
        severity: 'warning',
        title: '低温警告',
        description: `温度低至 ${temperature}°C，请注意保暖`,
        effectiveTime: observation.time ? new Date(observation.time) : new Date(),
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

