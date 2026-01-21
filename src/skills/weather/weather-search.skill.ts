// src/skills/weather/weather-search.skill.ts
/**
 * weather.search Skill
 * 
 * 查询指定地点的天气预报信息
 * 支持当前天气和未来预报
 * 自动根据国家选择合适的数据源适配器
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { DataSourceRouterService } from '../../data-contracts/services/data-source-router.service';
import { WeatherQuery, WeatherData, ExtendedWeatherData } from '../../data-contracts/interfaces/weather.interface';
import { IcelandComprehensiveService } from '../../data-contracts/services/iceland-comprehensive.service';

export interface WeatherSearchInput extends SkillInput {
  /** 地点坐标（必需） */
  lat: number;
  lng: number;
  
  /** 日期（可选，ISO 8601格式，用于查询未来天气） */
  date?: string;
  
  /** 时区（可选） */
  timezone?: string;
  
  /** 是否包含详细风速信息（冰岛特定） */
  includeWindDetails?: boolean;
  
  /** 是否包含极光信息（冰岛特定） */
  includeAuroraInfo?: boolean;
  
  /** 地点名称（可选，用于日志和输出） */
  locationName?: string;
}

export interface WeatherSearchOutput extends SkillOutput {
  /** 天气数据 */
  weather: WeatherData | ExtendedWeatherData;
  
  /** 证据ID（用于关联到evidence_registry） */
  evidence_id: string;
  
  /** 数据源标识 */
  source: string;
  
  /** 查询位置信息 */
  location: {
    lat: number;
    lng: number;
    name?: string;
  };
  
  /** 查询时间信息 */
  query: {
    date?: string;
    timezone?: string;
  };
  
  /** 影响评估（可选） */
  impact_assessment?: {
    outdoor_activities?: 'suitable' | 'moderate' | 'unsuitable';
    transportation?: 'normal' | 'delayed' | 'disrupted';
    safety_risks?: Array<{
      type: string;
      severity: 'info' | 'warning' | 'critical';
      description: string;
    }>;
  };
  
  /** 建议（可选） */
  recommendations?: string[];
}

@SkillDecorator({
  name: 'weather.search',
  description: '查询指定地点的天气预报信息（当前天气或未来预报）',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class WeatherSearchSkill implements Skill<WeatherSearchInput, WeatherSearchOutput> {
  private readonly logger = new Logger(WeatherSearchSkill.name);

  metadata = {
    name: 'weather.search',
    description: '查询指定地点的天气预报信息（当前天气或未来预报）',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['lat', 'lng'],
      typeChecks: {
        lat: { type: 'number' as const, min: -90, max: 90 },
        lng: { type: 'number' as const, min: -180, max: 180 },
        date: { type: 'string' as const, format: 'date' as const },
      },
    },
  };

  constructor(
    @Optional() private readonly dataSourceRouter?: DataSourceRouterService,
    @Optional() private readonly icelandComprehensiveService?: IcelandComprehensiveService,
  ) {
    this.logger.log(`[WeatherSearchSkill] 已初始化`);
  }

  async execute(input: WeatherSearchInput): Promise<WeatherSearchOutput> {
    this.logger.debug(
      `执行 weather.search: lat=${input.lat}, lng=${input.lng}, date=${input.date || 'current'}, location=${input.locationName || 'unknown'}`,
    );

    try {
      // 验证输入
      if (input.lat == null || input.lng == null) {
        throw new Error('必须提供 lat 和 lng 坐标');
      }

      if (input.lat < -90 || input.lat > 90) {
        throw new Error(`纬度必须在 -90 到 90 之间，当前值: ${input.lat}`);
      }

      if (input.lng < -180 || input.lng > 180) {
        throw new Error(`经度必须在 -180 到 180 之间，当前值: ${input.lng}`);
      }

      // 构建查询请求
      const weatherQuery: WeatherQuery = {
        lat: input.lat,
        lng: input.lng,
        date: input.date,
        timezone: input.timezone,
        includeWindDetails: input.includeWindDetails,
        includeAuroraInfo: input.includeAuroraInfo,
      };

      // 获取天气数据
      let weatherData: WeatherData | ExtendedWeatherData;

      // 如果请求包含冰岛特定信息，使用冰岛综合服务
      if (
        (input.includeWindDetails || input.includeAuroraInfo) &&
        this.icelandComprehensiveService
      ) {
        try {
          weatherData = await this.icelandComprehensiveService.getComprehensiveWeather(
            weatherQuery,
          );
          this.logger.debug(`使用冰岛综合服务获取天气数据: ${weatherData.source}`);
        } catch (error: any) {
          this.logger.warn(
            `冰岛综合服务失败: ${error?.message}，降级到标准天气服务`,
          );
          // 降级到标准服务
          if (!this.dataSourceRouter) {
            throw new Error('DataSourceRouterService 不可用');
          }
          weatherData = await this.dataSourceRouter.getWeather(weatherQuery);
        }
      } else {
        // 使用标准天气服务（自动选择适配器）
        if (!this.dataSourceRouter) {
          throw new Error('DataSourceRouterService 不可用');
        }
        weatherData = await this.dataSourceRouter.getWeather(weatherQuery);
      }

      // 生成证据ID
      const evidenceId = `weather_${input.lat}_${input.lng}_${input.date || 'current'}_${Date.now()}`;

      // 评估天气对行程的影响
      const impactAssessment = this.assessWeatherImpact(weatherData);

      // 生成建议
      const recommendations = this.generateRecommendations(weatherData, impactAssessment);

      // 构建输出
      const output: WeatherSearchOutput = {
        weather: weatherData,
        evidence_id: evidenceId,
        source: weatherData.source,
        location: {
          lat: input.lat,
          lng: input.lng,
          name: input.locationName,
        },
        query: {
          date: input.date,
          timezone: input.timezone,
        },
        impact_assessment: impactAssessment,
        recommendations,
      };

      this.logger.debug(
        `weather.search 成功: source=${weatherData.source}, temperature=${weatherData.temperature}°C, condition=${weatherData.condition}`,
      );

      return output;
    } catch (error: any) {
      this.logger.error(`weather.search 失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * 评估天气对行程的影响
   */
  private assessWeatherImpact(
    weather: WeatherData | ExtendedWeatherData,
  ): WeatherSearchOutput['impact_assessment'] {
    const assessment: WeatherSearchOutput['impact_assessment'] = {
      outdoor_activities: 'suitable',
      transportation: 'normal',
      safety_risks: [],
    };

    // 评估户外活动适宜性
    if (weather.condition === 'rainy' || weather.condition === 'snowy') {
      assessment.outdoor_activities = 'moderate';
    } else if (weather.condition === 'storm' || weather.condition === 'extreme') {
      assessment.outdoor_activities = 'unsuitable';
    }

    // 评估交通影响
    if (weather.windSpeed && weather.windSpeed > 15) {
      // 风速超过15m/s可能影响交通
      assessment.transportation = 'delayed';
    }

    if (weather.visibility && weather.visibility < 1) {
      // 能见度低于1公里
      assessment.transportation = 'disrupted';
    }

    // 提取安全风险
    if (weather.alerts && weather.alerts.length > 0) {
      assessment.safety_risks = weather.alerts.map((alert) => ({
        type: alert.type,
        severity: alert.severity,
        description: alert.description,
      }));

      // 如果有严重警报，更新户外活动评估
      const hasCriticalAlert = weather.alerts.some((a) => a.severity === 'critical');
      if (hasCriticalAlert) {
        assessment.outdoor_activities = 'unsuitable';
        assessment.transportation = 'disrupted';
      }
    }

    // 冰岛特定：检查风速
    if ('windGust' in weather && weather.windGust && weather.windGust > 20) {
      assessment.safety_risks?.push({
        type: 'wind',
        severity: 'warning',
        description: `强阵风警告：阵风速度 ${weather.windGust} m/s，可能影响户外活动安全`,
      });
      assessment.outdoor_activities = 'moderate';
    }

    return assessment;
  }

  /**
   * 生成基于天气的建议
   */
  private generateRecommendations(
    weather: WeatherData | ExtendedWeatherData,
    impact: WeatherSearchOutput['impact_assessment'],
  ): string[] {
    const recommendations: string[] = [];

    // 基于天气状况的建议
    if (weather.condition === 'rainy' || weather.condition === 'snowy') {
      recommendations.push('建议携带雨具或防雪装备');
    }

    if (weather.condition === 'sunny' && weather.temperature > 25) {
      recommendations.push('天气炎热，建议携带防晒用品和充足饮水');
    }

    if (weather.condition === 'sunny' && weather.temperature < 5) {
      recommendations.push('天气寒冷，建议穿着保暖衣物');
    }

    // 基于风速的建议
    if (weather.windSpeed && weather.windSpeed > 10) {
      recommendations.push('风速较大，建议注意防风保暖');
    }

    if ('windGust' in weather && weather.windGust && weather.windGust > 20) {
      recommendations.push('强阵风警告，户外活动需格外小心');
    }

    // 基于能见度的建议
    if (weather.visibility && weather.visibility < 2) {
      recommendations.push('能见度较低，自驾需谨慎，建议减速慢行');
    }

    // 基于影响评估的建议
    if (impact?.outdoor_activities === 'unsuitable') {
      recommendations.push('当前天气不适合户外活动，建议改为室内活动或调整行程');
    }

    if (impact?.transportation === 'disrupted') {
      recommendations.push('天气可能影响交通，建议提前查询交通状况并预留充足时间');
    }

    // 基于警报的建议
    if (weather.alerts && weather.alerts.length > 0) {
      const criticalAlerts = weather.alerts.filter((a) => a.severity === 'critical');
      if (criticalAlerts.length > 0) {
        recommendations.push(
          `严重天气警报：${criticalAlerts.map((a) => a.title).join('、')}，建议密切关注天气变化`,
        );
      }
    }

    // 冰岛特定：极光建议
    if ('auroraVisibility' in weather && weather.auroraVisibility === 'high') {
      recommendations.push('极光可见性高，适合观赏极光');
    }

    return recommendations;
  }
}
