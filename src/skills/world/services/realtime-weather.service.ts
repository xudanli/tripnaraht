/**
 * 实时天气服务
 * 
 * 负责获取和管理实时天气预警数据，包括：
 * - 集成OpenWeatherMap API（实时天气 + 预警）
 * - 存储到 realtime_weather_alerts 表
 * - 提供天气预警查询接口
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { WeatherAlert } from '../interfaces/unified-world-model.interface';
import { HttpClientFactory } from '../../../common/utils/http-client.factory';
import axios, { AxiosInstance } from 'axios';
// 使用WeatherSearchSkill替代直接API调用
import { WeatherSearchSkill } from '../../weather/weather-search.skill';
import { CountryConfigService } from './country-config.service';

@Injectable()
export class RealtimeWeatherService {
  private readonly logger = new Logger(RealtimeWeatherService.name);
  private readonly httpClient: AxiosInstance;
  private readonly apiKey: string | undefined;

  constructor(
    private prisma: PrismaService,
    @Optional() private configService?: ConfigService,
    // 使用WeatherSearchSkill替代直接API调用
    @Optional() private weatherSearchSkill?: WeatherSearchSkill,
    // Code Review P0修复：添加CountryConfigService用于地理编码
    @Optional() private countryConfigService?: CountryConfigService,
  ) {
    this.apiKey = configService?.get<string>('OPENWEATHER_API_KEY');
    
    // 创建HTTP客户端（OpenWeatherMap One Call API 3.0）
    this.httpClient = HttpClientFactory.create({
      baseURL: 'https://api.openweathermap.org/data/3.0',
      timeout: 10000,
    });

    // 禁用代理
    this.httpClient.defaults.proxy = false;
  }

  /**
   * 获取天气预警（按区域）
   */
  async getWeatherAlerts(
    region: string,
    dateRange?: { start: Date; end: Date },
  ): Promise<WeatherAlert[]> {
    this.logger.log(`[RealtimeWeather] 获取天气预警: region=${region}`);

    try {
      // 1. 先从数据库查询（最近15分钟内的预警）
      const recentAlerts = await this.getRecentAlertsFromDB(region, dateRange);
      
      if (recentAlerts.length > 0) {
        this.logger.debug(`[RealtimeWeather] 从数据库获取到 ${recentAlerts.length} 条预警`);
        return recentAlerts;
      }

      // 2. 如果数据库没有，从API获取
      const apiAlerts = await this.fetchAlertsFromAPI(region);
      
      // 3. 存储到数据库
      if (apiAlerts.length > 0) {
        await this.saveAlertsToDB(apiAlerts);
      }

      return apiAlerts;
    } catch (error: any) {
      this.logger.error(
        `[RealtimeWeather] 获取天气预警失败: ${error.message}`,
        error.stack,
      );
      // 降级策略：返回空数组
      return [];
    }
  }

  /**
   * 从数据库获取最近的预警
   */
  private async getRecentAlertsFromDB(
    region: string,
    dateRange?: { start: Date; end: Date },
  ): Promise<WeatherAlert[]> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    let query = `
      SELECT * FROM realtime_weather_alerts
      WHERE region = $1::varchar
        AND created_at >= $2::timestamp
    `;
    const params: any[] = [region, fifteenMinutesAgo];

    if (dateRange) {
      query += ` AND start_time <= $3::timestamp AND end_time >= $4::timestamp`;
      params.push(dateRange.end, dateRange.start);
    }

    query += ` ORDER BY severity DESC, start_time ASC`;

    const alerts = await this.prisma.$queryRawUnsafe(query, ...params) as any[];

    return alerts.map((alert) => ({
      region: alert.region,
      alertType: alert.alert_type as WeatherAlert['alertType'],
      severity: alert.severity as WeatherAlert['severity'],
      startTime: alert.start_time,
      endTime: alert.end_time,
      impact: alert.impact_description || '',
    }));
  }

  /**
   * 从API获取预警（使用WeatherSearchSkill）
   */
  private async fetchAlertsFromAPI(region: string): Promise<WeatherAlert[]> {
    // 优先使用WeatherSearchSkill（如果可用）
    if (this.weatherSearchSkill) {
      try {
        // Code Review P0修复：从region获取坐标（使用地理编码服务）
        let location: { lat: number; lng: number } | null = null;
        if (this.countryConfigService) {
          try {
            location = await this.countryConfigService.getGeocodingCoordinates(region);
          } catch (error: any) {
            this.logger.warn(
              `[RealtimeWeather] 获取地理编码坐标失败: ${error.message}，使用默认坐标`,
            );
          }
        }
        
        // 降级到默认坐标（冰岛）
        const defaultLocation = location || { lat: 64.9631, lng: -19.0208 };

        const weatherResult = await this.weatherSearchSkill.execute({
          lat: defaultLocation.lat,
          lng: defaultLocation.lng,
        });

        // 从WeatherData中提取预警
        const alerts: WeatherAlert[] = [];
        if (weatherResult.weather.alerts && weatherResult.weather.alerts.length > 0) {
          for (const alert of weatherResult.weather.alerts) {
            alerts.push({
              region,
              alertType: this.mapAlertType(alert.type),
              severity: alert.severity,
              startTime: alert.effectiveTime || new Date(),
              endTime: alert.expiryTime || new Date(),
              impact: alert.description || '',
            });
          }
        }

        this.logger.debug(
          `[RealtimeWeather] 使用WeatherSearchSkill获取到 ${alerts.length} 条预警`,
        );
        return alerts;
      } catch (error: any) {
        this.logger.warn(
          `[RealtimeWeather] WeatherSearchSkill调用失败: ${error.message}`,
        );
        // 继续尝试直接API调用
      }
    }

    // 降级策略：直接API调用
    if (!this.apiKey) {
      this.logger.warn(`[RealtimeWeather] OPENWEATHER_API_KEY 未配置，跳过API调用`);
      return [];
    }

    try {
      // Code Review P0-2修复：实现OpenWeatherMap One Call API 3.0调用
      // 注意：需要location坐标，这里使用region作为国家代码获取坐标
      let location: { lat: number; lng: number } | null = null;
      if (this.countryConfigService) {
        try {
          location = await this.countryConfigService.getGeocodingCoordinates(region);
        } catch (error: any) {
          this.logger.warn(
            `[RealtimeWeather] 获取地理编码坐标失败: ${error.message}`,
          );
        }
      }

      if (!location) {
        this.logger.warn(`[RealtimeWeather] 无法获取坐标，跳过API调用`);
        return [];
      }

      // 调用OpenWeatherMap One Call API 3.0
      // 注意：One Call API 3.0需要订阅，如果没有订阅，使用Current Weather API作为降级
      try {
        const response = await this.httpClient.get('/onecall', {
          params: {
            lat: location.lat,
            lon: location.lng,
            appid: this.apiKey,
            exclude: 'minutely,hourly,daily', // 只获取alerts
          },
        });

        const alerts: WeatherAlert[] = [];
        if (response.data?.alerts && Array.isArray(response.data.alerts)) {
          for (const alert of response.data.alerts) {
            alerts.push({
              id: alert.sender_name || `alert_${Date.now()}_${Math.random()}`,
              alertType: this.mapAlertType(alert.event || 'unknown'),
              severity: this.mapSeverity(alert.severity || 'unknown'),
              title: alert.event || 'Weather Alert',
              description: alert.description || '',
              region: region,
              startTime: new Date(alert.start * 1000),
              endTime: new Date(alert.end * 1000),
              source: 'openweather_api',
            });
          }
        }

        this.logger.debug(
          `[RealtimeWeather] OpenWeatherMap API返回 ${alerts.length} 条预警`,
        );
        return alerts;
      } catch (apiError: any) {
        // 如果One Call API不可用（需要订阅），降级到Current Weather API
        if (apiError.response?.status === 401 || apiError.response?.status === 403) {
          this.logger.warn(
            `[RealtimeWeather] One Call API不可用（可能需要订阅），降级到Current Weather API`,
          );
          // Current Weather API不提供alerts，返回空数组
          return [];
        }
        throw apiError;
      }
    } catch (error: any) {
      this.logger.error(
        `[RealtimeWeather] API调用失败: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * 映射Alert类型
   */
  private mapAlertType(type: string): WeatherAlert['alertType'] {
    const typeMap: Record<string, WeatherAlert['alertType']> = {
      storm: 'WIND',
      wind: 'WIND',
      snow: 'SNOW',
      flood: 'FLOOD',
      volcanic: 'VOLCANIC',
      rain: 'RAIN',
      fog: 'FOG',
      extreme: 'WIND',
    };

    return typeMap[type.toLowerCase()] || 'WIND';
  }

  /**
   * 映射严重程度
   */
  private mapSeverity(severity: string): WeatherAlert['severity'] {
    const severityMap: Record<string, WeatherAlert['severity']> = {
      minor: 'LOW',
      moderate: 'MEDIUM',
      severe: 'HIGH',
      extreme: 'CRITICAL',
    };

    return severityMap[severity.toLowerCase()] || 'MEDIUM';
  }

  /**
   * 保存预警到数据库
   */
  private async saveAlertsToDB(alerts: WeatherAlert[]): Promise<void> {
    for (const alert of alerts) {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO realtime_weather_alerts (
          region,
          alert_type,
          severity,
          start_time,
          end_time,
          impact_description,
          created_at,
          updated_at
        ) VALUES (
          $1::varchar,
          $2::varchar,
          $3::varchar,
          $4::timestamp,
          $5::timestamp,
          $6::text,
          NOW(),
          NOW()
        )
        ON CONFLICT DO NOTHING
      `,
        alert.region,
        alert.alertType,
        alert.severity,
        alert.startTime,
        alert.endTime,
        alert.impact,
      );
    }
  }

  /**
   * 更新天气预警（定时任务调用）
   */
  async updateWeatherAlerts(regions: string[]): Promise<void> {
    this.logger.log(`[RealtimeWeather] 更新天气预警: regions=${regions.join(', ')}`);

    for (const region of regions) {
      try {
        const alerts = await this.fetchAlertsFromAPI(region);
        if (alerts.length > 0) {
          await this.saveAlertsToDB(alerts);
          this.logger.log(`[RealtimeWeather] 已更新 ${alerts.length} 条预警: region=${region}`);
        }
      } catch (error: any) {
        this.logger.error(
          `[RealtimeWeather] 更新预警失败: region=${region}, error=${error.message}`,
        );
        // 继续处理下一个区域
      }
    }
  }
}
