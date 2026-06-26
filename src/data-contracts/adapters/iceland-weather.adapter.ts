// src/data-contracts/adapters/iceland-weather.adapter.ts

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';
import { WeatherAdapter } from './weather.adapter.interface';
import { WeatherData, WeatherQuery, ExtendedWeatherData, WeatherAlert } from '../interfaces/weather.interface';
import { BaseAdapter } from './base.adapter';
import { AdapterMapper } from '../../common/utils/adapter-mapper.util';

/**
 * 冰岛天气适配器
 * 
 * 接入 Icelandic Meteorological Office (Vedur.is) 官方 XML Weather API。
 * 提供实时天气观测数据、风速、阵风、气象预警等信息
 * 
 * API: https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=en&view=xml&ids=<stationId>
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
  private readonly xmlParser = new DOMParser();

  constructor(@Optional() private configService?: ConfigService) {
    super(IcelandWeatherAdapter.name, {
      baseURL: 'https://xmlweather.vedur.is',
      timeout: 15000,
      headers: {
        'User-Agent': 'TripNARA/1.0 (+https://tripnara.com)',
        Accept: 'application/xml,text/xml,*/*',
      },
    });
    
    // 官方 IMO 接口不需要代理；避免环境代理不可用导致 ECONNREFUSED。
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
      
      // 调用 Icelandic Meteorological Office 官方观测 XML。
      const response = await this.httpClient.get('/', {
        params: {
          op_w: 'xml',
          type: 'obs',
          lang: 'en',
          view: 'xml',
          ids: stationId,
        },
        responseType: 'text',
        transformResponse: [(data) => data],
      });

      const observation = this.extractObservation(response.data, stationId);
      
      // 转换为标准格式
      const weatherData = await this.mapToWeatherData(observation, query);
      
      return weatherData;
    } catch (error: any) {
      if (error.code === 'CERT_HAS_EXPIRED' || error.message?.includes('certificate')) {
        this.logger.warn(`Vedur.is SSL 证书错误: ${error.message}，将降级到其他适配器`);
        throw new Error(`Vedur.is SSL 证书错误: ${error.message}`);
      }
      
      // 对于其他错误，也抛出异常以便降级
      this.logger.error(`获取 Vedur.is 冰岛官方天气失败: ${error.message}`);
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
    return 'Icelandic Meteorological Office (Vedur.is)';
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

  private extractObservation(xml: string, stationId: string): any {
    if (typeof xml !== 'string' || xml.trim().length === 0) {
      throw new Error('Vedur.is 返回空响应');
    }

    const parsed = this.xmlParser.parseFromString(xml, 'application/xml');
    const parseError = parsed.getElementsByTagName('parsererror')[0];
    if (parseError) {
      throw new Error(`Vedur.is XML 解析失败: ${parseError.textContent || 'Invalid XML'}`);
    }

    const stations = Array.from(parsed.getElementsByTagName('station'));
    if (stations.length === 0) {
      throw new Error('Vedur.is 未返回观测站数据');
    }

    const station = stations.find((item) => item.getAttribute('id') === String(stationId)) ?? stations[0];
    const observation = this.stationElementToRecord(station);
    if (observation.err) {
      throw new Error(`Vedur.is 观测站错误: ${observation.err}`);
    }
    return observation;
  }

  private stationElementToRecord(station: XmlElement): Record<string, unknown> {
    const record: Record<string, unknown> = {
      id: station.getAttribute('id') ?? undefined,
      valid: station.getAttribute('valid') ?? undefined,
    };
    for (let i = 0; i < station.childNodes.length; i += 1) {
      const node = station.childNodes.item(i);
      if (!node || node.nodeType !== 1) {
        continue;
      }
      const element = node as XmlElement;
      record[element.tagName] = element.textContent?.trim() ?? '';
    }
    return record;
  }

  private parseNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private parseObservationDate(value: unknown): Date {
    if (!value) {
      return new Date();
    }
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  /**
   * 将 Vedur.is Weather XML 响应映射为标准 WeatherData 格式
   * 
   * Vedur.is 观测字段说明：
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
    const temperature = this.parseNumber(observation.T) ?? 0;
    const humidity = this.parseNumber(observation.RH);
    const visibilityKm = this.parseNumber(observation.V);
    const windSpeed = this.parseNumber(observation.F);
    const windGust = this.parseNumber(observation.FG);
    const maxWindSpeed = this.parseNumber(observation.FX);
    const cloudCover = this.parseNumber(observation.N);
    const pressure = this.parseNumber(observation.P);
    const dewPoint = this.parseNumber(observation.TD);
    const precipitation = this.parseNumber(observation.R);

    const weatherData: ExtendedWeatherData = {
      temperature,
      condition: this.mapWeatherCondition(observation.W),
      windSpeed,
      windDirection: windDirection,
      humidity,
      visibility: visibilityKm !== undefined ? visibilityKm * 1000 : undefined,
      alerts: this.extractAlerts(observation),
      lastUpdated: this.parseObservationDate(observation.time),
      source: 'vedur.is',
      metadata: {
        stationName: observation.name,
        stationId: observation.id,
        sourceAuthority: 'official',
        providerName: 'Icelandic Meteorological Office',
        endpoint: 'https://xmlweather.vedur.is',
        windGust,
        maxWindSpeed,
        pressure,
        cloudCover,
        dewPoint,
        precipitation,
        rawData: observation,
        query: query,
      },
    };

    // 冰岛特定字段：阵风（重要！）
    if (query.includeWindDetails || windGust !== undefined) {
      weatherData.windGust = windGust;
      weatherData.cloudCover = cloudCover;
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

    return directionMap[direction.toUpperCase()] ?? this.parseNumber(direction);
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
   * Vedur.is 的观测数据不包含警报信息
   * 可以根据风速、能见度等条件生成警告
   */
  private extractAlerts(observation: any): WeatherAlert[] {
    const alerts: WeatherAlert[] = [];

    // 根据阵风速度生成警告（冰岛车门被吹掉的主因）
    const windGust = this.parseNumber(observation.FG) ?? 0;
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
    const visibility = this.parseNumber(observation.V);
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
    const temperature = this.parseNumber(observation.T) ?? 0;
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
