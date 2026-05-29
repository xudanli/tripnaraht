/**
 * world.weatherPrediction Skill
 * 
 * 获取天气预测数据
 * 使用WeatherSearchSkill获取天气预报，然后转换为预测格式
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { WeatherPredictionService } from './services/weather-prediction.service';
import { WeatherSearchSkill } from '../weather/weather-search.skill';
import { WeatherPrediction } from './interfaces/unified-world-model.interface';
import { markWorldSkillDegraded } from './utils/world-skill-degraded.util';

export interface WorldWeatherPredictionInput extends SkillInput {
  /** 区域代码（如 'IS'） */
  region: string;
  
  /** 日期范围 */
  dateRange: {
    start: Date;
    end: Date;
  };
  
  /** 坐标（用于获取天气数据） */
  location: {
    lat: number;
    lng: number;
  };
}

export interface WorldWeatherPredictionOutput extends SkillOutput {
  /** 天气预测列表 */
  predictions: WeatherPrediction[];
  
  /** 证据ID */
  evidence_id: string;
  
  /** 数据源 */
  source: string;
  
  /** 查询区域 */
  region: string;

  degraded?: boolean;
  degradedReason?: string;
}

@SkillDecorator({
  name: 'world.weatherPrediction',
  description: '获取 world 天气预报摘要（委托 weather.search）。在 planning 阶段评估未来窗口风险或 failureRisk 输入时调用。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class WorldWeatherPredictionSkill implements Skill<WorldWeatherPredictionInput, WorldWeatherPredictionOutput> {
  private readonly logger = new Logger(WorldWeatherPredictionSkill.name);

  metadata = {
    name: 'world.weatherPrediction',
    description: '获取 world 天气预报摘要（委托 weather.search）。在 planning 阶段评估未来窗口风险或 failureRisk 输入时调用。',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['region', 'dateRange', 'location'],
      typeChecks: {
        region: { type: 'string' as const },
      },
    },
  };

  constructor(
    @Optional() private weatherPredictionService?: WeatherPredictionService,
    @Optional() private weatherSearchSkill?: WeatherSearchSkill,
  ) {
    this.logger.log(`[WorldWeatherPredictionSkill] 已初始化`);
  }

  async execute(input: WorldWeatherPredictionInput): Promise<WorldWeatherPredictionOutput> {
    this.logger.log(
      `执行 world.weatherPrediction: region=${input.region}, start=${input.dateRange.start}, end=${input.dateRange.end}`,
    );

    try {
      // 1. 优先使用WeatherPredictionService（如果可用）
      if (this.weatherPredictionService) {
        const predictions = await this.weatherPredictionService.predictWeather(
          input.region,
          input.dateRange,
        );

        return {
          predictions,
          evidence_id: `world_weather_prediction_${Date.now()}`,
          source: 'WeatherPredictionService',
          region: input.region,
        };
      }

      // 2. 降级策略：使用WeatherSearchSkill获取天气预报
      if (this.weatherSearchSkill) {
        const predictions: WeatherPrediction[] = [];
        const days = Math.ceil(
          (input.dateRange.end.getTime() - input.dateRange.start.getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;

        // 为每一天获取天气预报
        for (let day = 0; day < Math.min(days, 7); day++) {
          const date = new Date(input.dateRange.start);
          date.setDate(date.getDate() + day);

          try {
            const weatherResult = await this.weatherSearchSkill.execute({
              lat: input.location.lat,
              lng: input.location.lng,
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

        return {
          predictions,
          evidence_id: `world_weather_prediction_weathersearch_${Date.now()}`,
          source: 'WeatherSearchSkill',
          region: input.region,
        };
      }

      // 3. 最终降级：返回空数组（显式 degraded）
      this.logger.warn(`[WorldWeatherPredictionSkill] 无可用服务，返回空预测列表`);
      return markWorldSkillDegraded(
        {
          predictions: [],
          evidence_id: `world_weather_prediction_fallback_${Date.now()}`,
          source: 'fallback',
          region: input.region,
        },
        'WeatherPredictionService and WeatherSearchSkill unavailable',
      );
    } catch (error: any) {
      this.logger.error(
        `world.weatherPrediction 失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
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
}
