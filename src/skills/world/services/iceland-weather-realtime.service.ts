/**
 * Iceland Weather Realtime Service
 *
 * 用途: 获取冰岛实时天气预报和告警
 * API: Open-Meteo (免费, 无需 API key)
 * 缓存: 6 小时 (天气数据更新频率)
 *
 * 使用示例:
 * const service = new IcelandWeatherRealtimeService();
 * const weather = await service.getWeatherByLocation(64.1466, -21.9426);
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import axios, { AxiosInstance } from 'axios';

/**
 * Open-Meteo API 响应格式
 */
interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current_weather?: {
    time: string;
    temperature: number;
    windspeed: number;
    winddirection: number;
    weathercode: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    windspeed_10m: number[];
    winddirection_10m: number[];
    precipitation: number[];
    visibility: number[];
    weathercode: number[];
  };
}

/**
 * TripNARA 天气预报格式
 */
export interface WeatherForecast {
  regionKey: string;
  regionName: string;
  location: { lat: number; lng: number };
  forecastTime: Date;
  validFrom: Date;
  validUntil: Date;
  temperature?: number;
  windSpeed?: number; // m/s
  windDirection?: number; // degrees
  precipitation?: number; // mm
  visibility?: number; // meters
  conditions?: string;
  weatherCode?: string;
  warnings: WeatherWarning[];
  hazards: WeatherHazard[];
  dataSource: string;
  apiResponse?: any;
  confidence: number;
}

/**
 * 天气告警
 */
export interface WeatherWarning {
  type: 'HIGH_WIND' | 'LOW_VISIBILITY' | 'HEAVY_PRECIPITATION' | 'SEVERE_WEATHER';
  severity: 'low' | 'medium' | 'high' | 'very_high';
  message: string;
  validFrom: Date;
  validUntil: Date;
}

/**
 * 天气风险
 */
export interface WeatherHazard {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'very_high';
  description: string;
}

/**
 * 冰岛重要区域（用于预报）
 */
const ICELAND_REGIONS = {
  reykjavik: { lat: 64.1466, lng: -21.9426, name: 'Reykjavík' },
  akureyri: { lat: 65.6835, lng: -18.1123, name: 'Akureyri' },
  hofn: { lat: 64.2539, lng: -15.2081, name: 'Höfn' },
  egilsstadir: { lat: 65.2637, lng: -14.3944, name: 'Egilsstaðir' },
  vik: { lat: 63.4186, lng: -19.0059, name: 'Vík í Mýrdal' },
  isafjordur: { lat: 66.0749, lng: -23.1339, name: 'Ísafjörður' },
  highlands_center: { lat: 64.7500, lng: -18.0000, name: 'Highlands Center' }, // F-roads 中心区域
} as const;

/**
 * WMO Weather Code 映射
 * 参考: https://open-meteo.com/en/docs
 */
const WMO_WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

@Injectable()
export class IcelandWeatherRealtimeService {
  private readonly logger = new Logger('IcelandWeatherRealtimeService');
  private readonly OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';
  private readonly CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时
  private readonly REQUEST_TIMEOUT_MS = 10000; // 10 秒超时
  private readonly httpClient: AxiosInstance;
  private readonly prisma: PrismaService | PrismaClient;

  constructor(@Optional() prisma?: PrismaService | PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
    this.httpClient = axios.create({
      timeout: this.REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
    });
    this.logger.log('✅ IcelandWeatherRealtimeService 已初始化 (使用数据库缓存)');
  }

  /**
   * 根据位置获取天气预报
   */
  async getWeatherByLocation(lat: number, lng: number): Promise<WeatherForecast | null> {
    const regionKey = this.getRegionKey(lat, lng);

    // 1. 查询数据库缓存（6 小时内）
    const cached = await this.getFromDatabase(regionKey);
    if (cached) {
      this.logger.debug(`[DB Cache Hit] ${regionKey}`);
      return cached;
    }

    // 2. 查询 API
    try {
      this.logger.debug(`[API Query] ${regionKey} (${lat}, ${lng})`);

      const response = await this.httpClient.get<OpenMeteoResponse>(this.OPEN_METEO_API, {
        params: {
          latitude: lat,
          longitude: lng,
          hourly: 'temperature_2m,windspeed_10m,winddirection_10m,precipitation,visibility,weathercode',
          current_weather: true,
          timezone: 'UTC',
          forecast_days: 3,
        },
      });

      if (response.status !== 200) {
        this.logger.warn(`API 返回错误状态码: ${response.status}`);
        return null;
      }

      if (!response.data?.hourly) {
        this.logger.warn(`API 未返回预报数据`);
        return null;
      }

      // 3. 转换为 TripNARA 格式
      const forecast = this.mapToTripNARAFormat(response.data, regionKey);

      // 4. 写入数据库
      await this.saveToDatabase(forecast);

      this.logger.log(
        `[API Success] ${regionKey}: ${forecast.temperature}°C, wind ${forecast.windSpeed}m/s`
      );

      return forecast;
    } catch (error) {
      this.logger.error(`获取天气失败:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * 获取所有关键区域的天气预报
   */
  async getAllRegionsWeather(): Promise<Map<string, WeatherForecast>> {
    const forecasts = new Map<string, WeatherForecast>();

    this.logger.log(`开始获取 ${Object.keys(ICELAND_REGIONS).length} 个区域的天气预报...`);

    for (const [key, region] of Object.entries(ICELAND_REGIONS)) {
      try {
        const forecast = await this.getWeatherByLocation(region.lat, region.lng);
        if (forecast) {
          forecasts.set(key, forecast);
        }
        // 延迟避免频繁请求
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.error(`获取 ${key} 天气失败:`, error);
      }
    }

    this.logger.log(`成功获取 ${forecasts.size}/${Object.keys(ICELAND_REGIONS).length} 个区域天气`);
    return forecasts;
  }

  /**
   * 检查特定位置是否有恶劣天气
   */
  async hasHazardousWeather(lat: number, lng: number): Promise<boolean> {
    const forecast = await this.getWeatherByLocation(lat, lng);
    if (!forecast) return false;

    return (
      forecast.hazards.some(h => h.severity === 'high' || h.severity === 'very_high') ||
      forecast.warnings.length > 0
    );
  }

  /**
   * 获取最近的气象站预报
   */
  async getNearestWeatherStation(lat: number, lng: number): Promise<WeatherForecast | null> {
    // 简化版：返回最近的预定义区域
    let minDistance = Infinity;
    type Region = (typeof ICELAND_REGIONS)[keyof typeof ICELAND_REGIONS];
    let nearestRegion: Region = ICELAND_REGIONS.reykjavik;

    for (const region of Object.values(ICELAND_REGIONS) as Region[]) {
      const distance = this.calculateDistance(lat, lng, region.lat, region.lng);
      if (distance < minDistance) {
        minDistance = distance;
        nearestRegion = region;
      }
    }

    this.logger.debug(`最近的气象站: ${nearestRegion.name} (距离 ${minDistance.toFixed(1)}km)`);
    return await this.getWeatherByLocation(nearestRegion.lat, nearestRegion.lng);
  }

  // ============ Private Methods ============

  /**
   * 从数据库获取（6 小时内的缓存）
   */
  private async getFromDatabase(regionKey: string): Promise<WeatherForecast | null> {
    try {
      const record = await this.prisma.weatherForecastRealtime.findFirst({
        where: {
          regionKey,
          forecastTime: {
            gte: new Date(Date.now() - this.CACHE_TTL_MS),
          },
        },
        orderBy: { forecastTime: 'desc' },
      });

      if (!record) return null;

      return this.dbRecordToWeatherForecast(record);
    } catch (error) {
      this.logger.error(`[DB Query Error] ${regionKey}:`, error);
      return null;
    }
  }

  /**
   * 写入数据库
   */
  private async saveToDatabase(forecast: WeatherForecast): Promise<void> {
    try {
      await this.prisma.weatherForecastRealtime.create({
        data: {
          regionKey: forecast.regionKey,
          regionName: forecast.regionName,
          forecastTime: forecast.forecastTime,
          validFrom: forecast.validFrom,
          validUntil: forecast.validUntil,
          temperature: forecast.temperature || null,
          windSpeed: forecast.windSpeed || null,
          windDirection: forecast.windDirection || null,
          precipitation: forecast.precipitation || null,
          visibility: forecast.visibility || null,
          conditions: forecast.conditions || null,
          weatherCode: forecast.weatherCode || null,
          warnings: forecast.warnings as unknown as Prisma.InputJsonValue,
          hazards: forecast.hazards as unknown as Prisma.InputJsonValue,
          dataSource: forecast.dataSource,
          apiResponse: forecast.apiResponse || null,
          confidence: forecast.confidence,
        },
      });
      this.logger.debug(`[DB Write] ${forecast.regionKey} saved`);
    } catch (error) {
      this.logger.error(`[DB Write Error] ${forecast.regionKey}:`, error);
    }
  }

  /**
   * 数据库记录转换为 WeatherForecast
   */
  private dbRecordToWeatherForecast(record: any): WeatherForecast {
    return {
      regionKey: record.regionKey,
      regionName: record.regionName,
      location: { lat: 0, lng: 0 }, // PostGIS geography 需要特殊处理
      forecastTime: record.forecastTime,
      validFrom: record.validFrom,
      validUntil: record.validUntil,
      temperature: record.temperature || undefined,
      windSpeed: record.windSpeed || undefined,
      windDirection: record.windDirection || undefined,
      precipitation: record.precipitation || undefined,
      visibility: record.visibility || undefined,
      conditions: record.conditions || undefined,
      weatherCode: record.weatherCode || undefined,
      warnings: Array.isArray(record.warnings) ? record.warnings : [],
      hazards: Array.isArray(record.hazards) ? record.hazards : [],
      dataSource: record.dataSource,
      apiResponse: record.apiResponse || undefined,
      confidence: record.confidence,
    };
  }

  /**
   * 转换 API 响应为 TripNARA 格式
   */
  private mapToTripNARAFormat(apiData: OpenMeteoResponse, regionKey: string): WeatherForecast {
    const now = new Date();
    const currentHour = new Date(apiData.hourly.time[0]);
    const endTime = new Date(apiData.hourly.time[apiData.hourly.time.length - 1]);

    // 获取当前小时的预报数据（索引 0）
    const currentTemp = apiData.hourly.temperature_2m[0];
    const currentWind = apiData.hourly.windspeed_10m[0];
    const currentWindDir = apiData.hourly.winddirection_10m[0];
    const currentPrecip = apiData.hourly.precipitation[0];
    const currentVis = apiData.hourly.visibility[0];
    const currentCode = apiData.hourly.weathercode[0];

    // 生成告警和风险
    const warnings: WeatherWarning[] = [];
    const hazards: WeatherHazard[] = [];

    // 风速告警（10m/s = 36 km/h）
    const windMs = currentWind / 3.6; // 转换 km/h 为 m/s
    if (windMs > 20) {
      warnings.push({
        type: 'HIGH_WIND',
        severity: 'very_high',
        message: `Extreme wind: ${windMs.toFixed(1)} m/s (${currentWind.toFixed(0)} km/h)`,
        validFrom: currentHour,
        validUntil: new Date(currentHour.getTime() + 6 * 60 * 60 * 1000),
      });
      hazards.push({
        type: 'EXTREME_WIND',
        severity: 'very_high',
        description: 'Travel not recommended. Risk of vehicle instability.',
      });
    } else if (windMs > 15) {
      warnings.push({
        type: 'HIGH_WIND',
        severity: 'high',
        message: `Strong wind: ${windMs.toFixed(1)} m/s (${currentWind.toFixed(0)} km/h)`,
        validFrom: currentHour,
        validUntil: new Date(currentHour.getTime() + 6 * 60 * 60 * 1000),
      });
      hazards.push({
        type: 'HIGH_WIND',
        severity: 'high',
        description: 'Difficult driving conditions. Use caution.',
      });
    } else if (windMs > 10) {
      hazards.push({
        type: 'MODERATE_WIND',
        severity: 'medium',
        description: 'Moderate wind. Be prepared for gusts.',
      });
    }

    // 能见度告警
    if (currentVis < 1000) {
      warnings.push({
        type: 'LOW_VISIBILITY',
        severity: 'very_high',
        message: `Very low visibility: ${currentVis}m`,
        validFrom: currentHour,
        validUntil: new Date(currentHour.getTime() + 3 * 60 * 60 * 1000),
      });
      hazards.push({
        type: 'ZERO_VISIBILITY',
        severity: 'very_high',
        description: 'Travel not advised. Cannot see road ahead.',
      });
    } else if (currentVis < 5000) {
      hazards.push({
        type: 'LOW_VISIBILITY',
        severity: 'high',
        description: 'Reduced visibility. Drive slowly with headlights on.',
      });
    }

    // 降水告警
    if (currentPrecip > 5) {
      warnings.push({
        type: 'HEAVY_PRECIPITATION',
        severity: 'high',
        message: `Heavy precipitation: ${currentPrecip}mm/h`,
        validFrom: currentHour,
        validUntil: new Date(currentHour.getTime() + 3 * 60 * 60 * 1000),
      });
      hazards.push({
        type: 'HEAVY_RAIN_SNOW',
        severity: 'high',
        description: 'Heavy precipitation. Road may be slippery or flooded.',
      });
    }

    // 严重天气告警
    if (currentCode >= 95) {
      warnings.push({
        type: 'SEVERE_WEATHER',
        severity: 'very_high',
        message: WMO_WEATHER_CODES[currentCode] || 'Severe weather',
        validFrom: currentHour,
        validUntil: new Date(currentHour.getTime() + 6 * 60 * 60 * 1000),
      });
      hazards.push({
        type: 'THUNDERSTORM',
        severity: 'very_high',
        description: 'Severe weather. Seek shelter immediately.',
      });
    }

    const regionName = this.getRegionName(regionKey);

    return {
      regionKey,
      regionName,
      location: { lat: apiData.latitude, lng: apiData.longitude },
      forecastTime: now,
      validFrom: currentHour,
      validUntil: endTime,
      temperature: currentTemp,
      windSpeed: windMs,
      windDirection: currentWindDir,
      precipitation: currentPrecip,
      visibility: currentVis,
      conditions: WMO_WEATHER_CODES[currentCode] || 'Unknown',
      weatherCode: currentCode.toString(),
      warnings,
      hazards,
      dataSource: 'open-meteo',
      apiResponse: apiData,
      confidence: 0.85, // Open-Meteo 置信度
    };
  }

  /**
   * 获取区域 key
   */
  private getRegionKey(lat: number, lng: number): string {
    for (const [key, region] of Object.entries(ICELAND_REGIONS)) {
      const distance = this.calculateDistance(lat, lng, region.lat, region.lng);
      if (distance < 50) {
        // 50km 范围内
        return key;
      }
    }
    return `custom_${lat.toFixed(2)}_${lng.toFixed(2)}`;
  }

  /**
   * 获取区域名称
   */
  private getRegionName(regionKey: string): string {
    const region = Object.values(ICELAND_REGIONS).find(
      r => this.getRegionKey(r.lat, r.lng) === regionKey
    );
    return region?.name || 'Custom Location';
  }

  /**
   * 计算两点距离（km）
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // 地球半径 (km)
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 角度转弧度
   */
  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}

/**
 * 使用示例
 */
export async function exampleUsage() {
  const service = new IcelandWeatherRealtimeService();

  // 获取特定位置天气
  const reykjavikWeather = await service.getWeatherByLocation(64.1466, -21.9426);
  console.log('Reykjavík 天气:', reykjavikWeather);

  // 检查是否有恶劣天气
  const hasHazard = await service.hasHazardousWeather(64.1466, -21.9426);
  console.log('是否有恶劣天气:', hasHazard);

  // 获取所有区域天气
  const allWeather = await service.getAllRegionsWeather();
  allWeather.forEach((weather, region) => {
    console.log(`${region}: ${weather.temperature}°C, wind ${weather.windSpeed}m/s`);
  });
}
