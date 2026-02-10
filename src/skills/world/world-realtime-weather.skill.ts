/**
 * world.realtimeWeather Skill
 * 
 * 获取实时天气预警数据
 * 使用WeatherSearchSkill获取天气数据，然后提取预警信息
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { RealtimeWeatherService } from './services/realtime-weather.service';
import { WeatherSearchSkill } from '../weather/weather-search.skill';
import { WeatherAlert } from './interfaces/unified-world-model.interface';

export interface WorldRealtimeWeatherInput extends SkillInput {
  /** 区域代码（如 'IS'） */
  region: string;
  
  /** 日期范围（可选） */
  dateRange?: {
    start: Date;
    end: Date;
  };
  
  /** 坐标（可选，用于获取天气数据） */
  location?: {
    lat: number;
    lng: number;
  };
}

export interface WorldRealtimeWeatherOutput extends SkillOutput {
  /** 天气预警列表 */
  alerts: WeatherAlert[];
  
  /** 证据ID */
  evidence_id: string;
  
  /** 数据源 */
  source: string;
  
  /** 查询区域 */
  region: string;
}

@SkillDecorator({
  name: 'world.realtimeWeather',
  description: '获取实时天气预警数据（使用weather.search Skill）',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class WorldRealtimeWeatherSkill implements Skill<WorldRealtimeWeatherInput, WorldRealtimeWeatherOutput> {
  private readonly logger = new Logger(WorldRealtimeWeatherSkill.name);

  metadata = {
    name: 'world.realtimeWeather',
    description: '获取实时天气预警数据（使用weather.search Skill）',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['region'],
      typeChecks: {
        region: { type: 'string' as const },
      },
    },
  };

  constructor(
    @Optional() private realtimeWeatherService?: RealtimeWeatherService,
    @Optional() private weatherSearchSkill?: WeatherSearchSkill,
  ) {
    this.logger.log(`[WorldRealtimeWeatherSkill] 已初始化`);
  }

  async execute(input: WorldRealtimeWeatherInput): Promise<WorldRealtimeWeatherOutput> {
    this.logger.log(
      `执行 world.realtimeWeather: region=${input.region}`,
    );

    try {
      // 1. 优先使用RealtimeWeatherService（如果可用）
      if (this.realtimeWeatherService) {
        const alerts = await this.realtimeWeatherService.getWeatherAlerts(
          input.region,
          input.dateRange,
        );

        return {
          alerts,
          evidence_id: `world_realtime_weather_${Date.now()}`,
          source: 'RealtimeWeatherService',
          region: input.region,
        };
      }

      // 2. 降级策略：使用WeatherSearchSkill获取天气数据，然后提取预警
      if (this.weatherSearchSkill && input.location) {
        const weatherResult = await this.weatherSearchSkill.execute({
          lat: input.location.lat,
          lng: input.location.lng,
          date: input.dateRange?.start.toISOString().split('T')[0],
        });

        // 从WeatherData中提取预警
        const alerts: WeatherAlert[] = [];
        if (weatherResult.weather.alerts && weatherResult.weather.alerts.length > 0) {
          for (const alert of weatherResult.weather.alerts) {
            alerts.push({
              region: input.region,
              alertType: this.mapAlertType(alert.type),
              severity: alert.severity,
              startTime: alert.effectiveTime || new Date(),
              endTime: alert.expiryTime || new Date(),
              impact: alert.description || '',
            });
          }
        }

        return {
          alerts,
          evidence_id: weatherResult.evidence_id,
          source: weatherResult.source,
          region: input.region,
        };
      }

      // 3. 最终降级：返回空数组
      this.logger.warn(`[WorldRealtimeWeatherSkill] 无可用服务，返回空预警列表`);
      return {
        alerts: [],
        evidence_id: `world_realtime_weather_fallback_${Date.now()}`,
        source: 'fallback',
        region: input.region,
      };
    } catch (error: any) {
      this.logger.error(
        `world.realtimeWeather 失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
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
    };

    return typeMap[type.toLowerCase()] || 'WIND';
  }
}
