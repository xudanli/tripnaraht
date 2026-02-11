/**
 * 天气预测服务
 * 
 * 负责获取和管理天气预测数据，包括：
 * - 集成OpenWeatherMap Forecast API（7-14天预测）
 * - 存储到 weather_prediction 表
 * - 提供天气预测查询接口
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { WeatherPrediction } from '../interfaces/unified-world-model.interface';
import { HttpClientFactory } from '../../../common/utils/http-client.factory';
import axios, { AxiosInstance } from 'axios';
// 使用WeatherSearchSkill替代直接API调用
import { WeatherSearchSkill } from '../../weather/weather-search.skill';
import { CountryConfigService } from './country-config.service';

@Injectable()
export class WeatherPredictionService {
  private readonly logger = new Logger(WeatherPredictionService.name);
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
    
    // 创建HTTP客户端（OpenWeatherMap Forecast API）
    this.httpClient = HttpClientFactory.create({
      baseURL: 'https://api.openweathermap.org/data/2.5',
      timeout: 10000,
    });

    // 禁用代理
    this.httpClient.defaults.proxy = false;
  }

  /**
   * 预测天气（按区域和日期范围）
   */
  async predictWeather(
    region: string,
    dateRange: { start: Date; end: Date },
  ): Promise<WeatherPrediction[]> {
    this.logger.log(
      `[WeatherPrediction] 预测天气: region=${region}, start=${dateRange.start}, end=${dateRange.end}`,
    );

    try {
      // 1. 先从数据库查询（最近24小时内的预测）
      const recentPredictions = await this.getRecentPredictionsFromDB(region, dateRange);
      
      if (recentPredictions.length > 0) {
        this.logger.debug(`[WeatherPrediction] 从数据库获取到 ${recentPredictions.length} 条预测`);
        return recentPredictions;
      }

      // 2. 如果数据库没有，从API获取
      // Code Review P0修复：从region获取location坐标（使用地理编码服务）
      let location: { lat: number; lng: number } | null = null;
      if (this.countryConfigService) {
        try {
          location = await this.countryConfigService.getGeocodingCoordinates(region);
        } catch (error: any) {
          this.logger.warn(
            `[WeatherPrediction] 获取地理编码坐标失败: ${error.message}，使用默认坐标`,
          );
        }
      }
      // 降级到默认坐标（冰岛）
      const defaultLocation = location || { lat: 64.9631, lng: -19.0208 };
      const apiPredictions = await this.fetchPredictionsFromAPI(region, dateRange, defaultLocation);
      
      // 3. 存储到数据库
      if (apiPredictions.length > 0) {
        await this.savePredictionsToDB(apiPredictions);
      }

      return apiPredictions;
    } catch (error: any) {
      this.logger.error(
        `[WeatherPrediction] 预测天气失败: ${error.message}`,
        error.stack,
      );
      // 降级策略：返回空数组
      return [];
    }
  }

  /**
   * 从数据库获取最近的预测
   */
  private async getRecentPredictionsFromDB(
    region: string,
    dateRange: { start: Date; end: Date },
  ): Promise<WeatherPrediction[]> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const predictions = await this.prisma.$queryRawUnsafe(`
      SELECT * FROM weather_prediction
      WHERE region = $1::varchar
        AND prediction_date >= $2::date
        AND prediction_date <= $3::date
        AND created_at >= $4::timestamp
      ORDER BY prediction_date ASC
    `, region, dateRange.start, dateRange.end, twentyFourHoursAgo) as any[];

    return predictions.map((p) => ({
      date: p.prediction_date,
      temperature: p.predicted_weather?.temperature || 0,
      windSpeed: p.predicted_weather?.windSpeed || 0,
      precipitation: p.predicted_weather?.precipitation || 0,
      visibility: p.predicted_weather?.visibility || 0,
      accessibilityScore: p.accessibility_score || 0.5,
      riskFactors: p.risk_factors || [],
      confidence: {
        lower: 0.7,
        upper: 0.9,
        level: 'MEDIUM' as const,
      },
    }));
  }

  /**
   * 从API获取预测（使用WeatherSearchSkill）
   */
  private async fetchPredictionsFromAPI(
    region: string,
    dateRange: { start: Date; end: Date },
    location?: { lat: number; lng: number },
  ): Promise<WeatherPrediction[]> {
    // 优先使用WeatherSearchSkill（如果可用）
    if (this.weatherSearchSkill && location) {
      try {
        const predictions: WeatherPrediction[] = [];
        const days = Math.ceil(
          (dateRange.end.getTime() - dateRange.start.getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;

        // 为每一天获取天气预报
        for (let day = 0; day < Math.min(days, 7); day++) {
          const date = new Date(dateRange.start);
          date.setDate(date.getDate() + day);

          try {
            const weatherResult = await this.weatherSearchSkill.execute({
              lat: location.lat,
              lng: location.lng,
              date: date.toISOString().split('T')[0],
            });

            const weather = weatherResult.weather;
            const prediction: WeatherPrediction = {
              date,
              temperature: weather.temperature || 0,
              windSpeed: (weather.windSpeed || 0) * 3.6, // 转换为km/h
              precipitation: 0, // TODO: 从weather数据中提取
              visibility: (weather.visibility || 10000) / 1000, // 转换为km
              accessibilityScore: this.calculateAccessibilityScore(weather),
              riskFactors: this.extractRiskFactors(weather),
              confidence: {
                lower: 0.7,
                upper: 0.9,
                level: 'MEDIUM' as const,
              },
            };

            predictions.push(prediction);
          } catch (error: any) {
            this.logger.warn(
              `获取第${day + 1}天天气预报失败: ${error.message}`,
            );
            // 继续处理下一天
          }
        }

        this.logger.debug(
          `[WeatherPrediction] 使用WeatherSearchSkill获取到 ${predictions.length} 条预测`,
        );
        return predictions;
      } catch (error: any) {
        this.logger.warn(
          `[WeatherPrediction] WeatherSearchSkill调用失败: ${error.message}`,
        );
        // 继续尝试直接API调用
      }
    }

    // 降级策略：直接API调用
    if (!this.apiKey) {
      this.logger.warn(`[WeatherPrediction] OPENWEATHER_API_KEY 未配置，跳过API调用`);
      return [];
    }

    try {
      // Code Review P0-2修复：实现OpenWeatherMap Forecast API调用
      // 注意：需要location坐标，这里使用region作为国家代码获取坐标
      let location: { lat: number; lng: number } | null = null;
      if (this.countryConfigService) {
        try {
          location = await this.countryConfigService.getGeocodingCoordinates(region);
        } catch (error: any) {
          this.logger.warn(
            `[WeatherPrediction] 获取地理编码坐标失败: ${error.message}`,
          );
        }
      }

      if (!location) {
        this.logger.warn(`[WeatherPrediction] 无法获取坐标，跳过API调用`);
        return [];
      }

      // 调用OpenWeatherMap Forecast API（5天/3小时预测）
      const response = await this.httpClient.get('/forecast', {
        params: {
          lat: location.lat,
          lon: location.lng,
          appid: this.apiKey,
          units: 'metric',
        },
      });

      const predictions: WeatherPrediction[] = [];
      if (response.data?.list && Array.isArray(response.data.list)) {
        for (const item of response.data.list) {
          const forecastDate = new Date(item.dt * 1000);
          
          // 只包含在日期范围内的预测
          if (forecastDate >= dateRange.start && forecastDate <= dateRange.end) {
            predictions.push({
              id: `pred_${item.dt}_${Math.random().toString(36).substr(2, 9)}`,
              date: forecastDate,
              region: region,
              temperature: item.main?.temp || 0,
              condition: this.mapWeatherCondition(item.weather?.[0]?.main || 'unknown'),
              windSpeed: item.wind?.speed || 0,
              windDirection: item.wind?.deg || 0,
              humidity: item.main?.humidity || 0,
              visibility: item.visibility ? item.visibility / 1000 : undefined,
              precipitation: item.rain?.['3h'] || item.snow?.['3h'] || 0,
              confidence: 0.8, // Forecast API的置信度
              source: 'openweather_api',
            });
          }
        }
      }

      this.logger.debug(
        `[WeatherPrediction] OpenWeatherMap API返回 ${predictions.length} 条预测`,
      );
      return predictions;
    } catch (error: any) {
      this.logger.error(
        `[WeatherPrediction] API调用失败: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * 映射天气条件
   */
  private mapWeatherCondition(condition: string): WeatherPrediction['condition'] {
    const conditionMap: Record<string, WeatherPrediction['condition']> = {
      clear: 'SUNNY',
      clouds: 'CLOUDY',
      rain: 'RAINY',
      drizzle: 'RAINY',
      snow: 'SNOWY',
      thunderstorm: 'STORMY',
      mist: 'FOGGY',
      fog: 'FOGGY',
      haze: 'HAZY',
      dust: 'HAZY',
      sand: 'HAZY',
      ash: 'HAZY',
      squall: 'WINDY',
      tornado: 'STORMY',
    };

    return conditionMap[condition.toLowerCase()] || 'CLOUDY';
  }

  /**
   * 计算可达性评分
   */
  private calculateAccessibilityScore(weather: any): number {
    let score = 1.0;

    // 风速影响
    const windSpeedKmh = (weather.windSpeed || 0) * 3.6;
    if (windSpeedKmh > 20) {
      score -= 0.3;
    } else if (windSpeedKmh > 15) {
      score -= 0.15;
    }

    // 能见度影响
    const visibilityKm = (weather.visibility || 10000) / 1000;
    if (visibilityKm < 1) {
      score -= 0.4;
    } else if (visibilityKm < 5) {
      score -= 0.2;
    }

    // 温度影响
    if (weather.temperature < 0) {
      score -= 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 提取风险因素
   */
  private extractRiskFactors(weather: any): string[] {
    const factors: string[] = [];

    const windSpeedKmh = (weather.windSpeed || 0) * 3.6;
    if (windSpeedKmh > 20) {
      factors.push('high_wind');
    }

    const visibilityKm = (weather.visibility || 10000) / 1000;
    if (visibilityKm < 1) {
      factors.push('low_visibility');
    }

    if (weather.temperature < 0) {
      factors.push('freezing');
    }

    if (weather.alerts && weather.alerts.length > 0) {
      factors.push('weather_alerts');
    }

    return factors;
  }

  /**
   * 保存预测到数据库
   */
  private async savePredictionsToDB(predictions: WeatherPrediction[]): Promise<void> {
    for (const prediction of predictions) {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO weather_prediction (
          region,
          prediction_date,
          predicted_weather,
          accessibility_score,
          risk_factors,
          created_at,
          updated_at
        ) VALUES (
          $1::varchar,
          $2::date,
          $3::jsonb,
          $4::double precision,
          $5::text[],
          NOW(),
          NOW()
        )
        ON CONFLICT DO NOTHING
      `,
        'IS', // TODO: 从region获取实际国家代码
        prediction.date,
        JSON.stringify({
          temperature: prediction.temperature,
          windSpeed: prediction.windSpeed,
          precipitation: prediction.precipitation,
          visibility: prediction.visibility,
        }),
        prediction.accessibilityScore,
        prediction.riskFactors,
      );
    }
  }

  /**
   * 计算可达性评分（基于天气预测，公开方法）
   */
  calculateAccessibilityScoreFromPrediction(prediction: WeatherPrediction): number {
    let score = 1.0;

    // 风速影响（>20m/s 降低可达性）
    if (prediction.windSpeed > 20) {
      score -= 0.3;
    } else if (prediction.windSpeed > 15) {
      score -= 0.15;
    }

    // 降水影响（>10mm 降低可达性）
    if (prediction.precipitation > 10) {
      score -= 0.3;
    } else if (prediction.precipitation > 5) {
      score -= 0.15;
    }

    // 能见度影响（<1km 降低可达性）
    if (prediction.visibility < 1000) {
      score -= 0.4;
    } else if (prediction.visibility < 5000) {
      score -= 0.2;
    }

    // 温度影响（<0°C 降低可达性）
    if (prediction.temperature < 0) {
      score -= 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }
}
