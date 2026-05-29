/**
 * iceland.weatherSeverityClassifier — 天气 → 运行语义（驾驶 OS 输入）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { IcelandWeatherRealtimeService, type WeatherForecast } from './services/iceland-weather-realtime.service';
import type { IcelandWeatherSeverityClassifierOutput } from './iceland-world-driving-contracts';
import { classifyWeatherOperationalSeverity } from './utils/iceland-weather-operational-classifier.util';

export interface IcelandWeatherSeverityClassifierInput extends SkillInput {
  request_id: string;
  region?:
    | 'reykjavik'
    | 'akureyri'
    | 'vik'
    | 'hofn'
    | 'egilsstadir'
    | 'isafjordur'
    | 'patreksfjordur'
    | 'holmavik'
    | 'highlands_center'
    | 'keflavik';
  lat?: number;
  lng?: number;
  /** 若 orchestrator 已有预报对象，可直接传入跳过拉取 */
  forecast?: Pick<
    WeatherForecast,
    'windSpeed' | 'visibility' | 'precipitation' | 'weatherCode' | 'warnings' | 'hazards'
  >;
}

const REGION_COORDS: Record<NonNullable<IcelandWeatherSeverityClassifierInput['region']>, { lat: number; lng: number }> =
  {
    reykjavik: { lat: 64.1466, lng: -21.9426 },
    akureyri: { lat: 65.6835, lng: -18.1123 },
    vik: { lat: 63.4186, lng: -19.0059 },
    hofn: { lat: 64.2539, lng: -15.2081 },
    egilsstadir: { lat: 65.2637, lng: -14.3944 },
    isafjordur: { lat: 66.0749, lng: -23.1339 },
    patreksfjordur: { lat: 65.5953, lng: -23.9789 },
    holmavik: { lat: 65.7065, lng: -21.6876 },
    highlands_center: { lat: 64.75, lng: -18.0 },
    keflavik: { lat: 63.985, lng: -22.6056 },
  };

@SkillDecorator({
  name: 'iceland.weatherSeverityClassifier',
  description: '将冰岛实时/预报天气映射为出行风险档位与可执行驾驶建议（非展示型天气）。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandWeatherSeverityClassifierSkill
  implements Skill<IcelandWeatherSeverityClassifierInput, IcelandWeatherSeverityClassifierOutput>
{
  private readonly logger = new Logger(IcelandWeatherSeverityClassifierSkill.name);

  metadata = {
    name: 'iceland.weatherSeverityClassifier',
    description: '分类 iceland 天气运行风险档位（safe/caution/dangerous/avoid_nonessential）。在 worldState 或 readiness 需可执行天气语义时调用。',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['request_id'],
      typeChecks: {
        request_id: { type: 'string' as const },
      },
    },
  };

  constructor(@Optional() private readonly weather?: IcelandWeatherRealtimeService) {}

  async execute(input: IcelandWeatherSeverityClassifierInput): Promise<IcelandWeatherSeverityClassifierOutput> {
    if (input.forecast) {
      return classifyWeatherOperationalSeverity(input.forecast);
    }
    if (!this.weather) {
      this.logger.warn('[iceland.weatherSeverityClassifier] no forecast and no weather service');
      return {
        travelRisk: 'caution',
        drivingRecommendation: ['无法拉取实时天气：请降级为人工查看 vedur.is 与 CAP 预警。'],
      };
    }

    let lat = input.lat;
    let lng = input.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      const rc = input.region && REGION_COORDS[input.region];
      if (!rc) {
        throw new Error('iceland.weatherSeverityClassifier requires region, lat/lng, or forecast');
      }
      lat = rc.lat;
      lng = rc.lng;
    }

    const forecast =
      (await (this.weather as any).getWeatherByLocation?.(lat, lng)) ??
      (await (this.weather as any).getNearestWeatherStation?.(lat, lng));

    if (!forecast) {
      return {
        travelRisk: 'caution',
        drivingRecommendation: ['该点无可用预报数据：使用邻近站点或国家级 CAP 预警。'],
      };
    }

    return classifyWeatherOperationalSeverity(forecast);
  }
}
