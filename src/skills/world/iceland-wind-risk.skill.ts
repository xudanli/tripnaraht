/**
 * iceland.windRisk — 横风 / 车身暴露度（房车、高底盘）驾驶风险层。
 * 输入来自 Open-Meteo 管线（IcelandWeatherRealtimeService）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { IcelandWeatherRealtimeService } from './services/iceland-weather-realtime.service';
import type { IcelandWindRiskOutput } from './iceland-world-driving-contracts';

export interface IcelandWindRiskInput extends SkillInput {
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
}

const REGION: Record<NonNullable<IcelandWindRiskInput['region']>, { lat: number; lng: number; label: string }> = {
  reykjavik: { lat: 64.1466, lng: -21.9426, label: 'Capital region' },
  akureyri: { lat: 65.6835, lng: -18.1123, label: 'North — Eyjafjörður corridor' },
  vik: { lat: 63.4186, lng: -19.0059, label: 'South coast — Mýrdalur wind exposure' },
  hofn: { lat: 64.2539, lng: -15.2081, label: 'South-east — open coast' },
  egilsstadir: { lat: 65.2637, lng: -14.3944, label: 'East — fjord gaps' },
  isafjordur: { lat: 66.0749, lng: -23.1339, label: 'Westfjords — fjord crosswinds' },
  patreksfjordur: { lat: 65.5953, lng: -23.9789, label: 'Southern Westfjords — coastal gusts' },
  holmavik: { lat: 65.7065, lng: -21.6876, label: 'Strandir — exposed fjord fetch' },
  highlands_center: { lat: 64.75, lng: -18.0, label: 'Interior highlands' },
  keflavik: { lat: 63.985, lng: -22.6056, label: 'Reykjanes — coastal jet' },
};

function crosswindLevel(
  windMps: number,
  exposure: 'low' | 'medium' | 'high',
): IcelandWindRiskOutput['crosswindRisk'] {
  const thrExtreme = exposure === 'high' ? 18 : exposure === 'medium' ? 20 : 22;
  const thrHigh = exposure === 'high' ? 14 : exposure === 'medium' ? 16 : 18;
  const thrMed = exposure === 'high' ? 10 : exposure === 'medium' ? 12 : 14;
  if (windMps >= thrExtreme) return 'extreme';
  if (windMps >= thrHigh) return 'high';
  if (windMps >= thrMed) return 'medium';
  return 'low';
}

function exposureForRegion(region?: string): 'low' | 'medium' | 'high' {
  if (!region) return 'medium';
  if (
    region === 'vik' ||
    region === 'keflavik' ||
    region === 'isafjordur' ||
    region === 'patreksfjordur' ||
    region === 'holmavik' ||
    region === 'hofn'
  ) {
    return 'high';
  }
  if (region === 'egilsstadir' || region === 'highlands_center') return 'medium';
  return 'low';
}

function dangerousSegmentsFor(region?: string): string[] {
  switch (region) {
    case 'vik':
      return ['Route 1 — Dyrhólaey to Kirkjubæjarklaustur exposed embankments', 'Single-lane bridges — crosswind yaw'];
    case 'keflavik':
      return ['Route 41 — Keflavík–Reykjavík coastal fetch', 'Bridge approaches on Reykjanes'];
    case 'isafjordur':
      return ['Westfjords mountain passes — gust corridors', 'Fjord side roads — abrupt wind shear'];
    case 'patreksfjordur':
    case 'holmavik':
      return ['Westfjords gravel / cliff edges — crosswind yaw', 'Single-lane bridges — gust shear'];
    case 'hofn':
      return ['Route 1 east — long open littoral'];
    default:
      return [];
  }
}

@SkillDecorator({
  name: 'iceland.windRisk',
  description:
    '冰岛横风风险：海岸/峡湾暴露启发式 + 实时风速；房车与高车身告警与危险路段提示。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandWindRiskSkill implements Skill<IcelandWindRiskInput, IcelandWindRiskOutput> {
  private readonly logger = new Logger(IcelandWindRiskSkill.name);

  metadata = {
    name: 'iceland.windRisk',
    description: '冰岛横风驾驶风险（结合区域暴露度与 Open-Meteo 风速）。',
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

  async execute(input: IcelandWindRiskInput): Promise<IcelandWindRiskOutput> {
    let lat = input.lat;
    let lng = input.lng;
    let regionLabel = 'custom';
    const regKey = input.region;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      const pack = regKey && REGION[regKey];
      if (!pack) {
        throw new Error('iceland.windRisk requires region or lat/lng');
      }
      lat = pack.lat;
      lng = pack.lng;
      regionLabel = pack.label;
    } else {
      regionLabel = regKey && REGION[regKey] ? REGION[regKey].label : `latlng:${lat.toFixed(2)},${lng.toFixed(2)}`;
    }

    if (!this.weather) {
      this.logger.warn('[iceland.windRisk] IcelandWeatherRealtimeService unavailable');
      return {
        region: regionLabel,
        crosswindRisk: 'medium',
        campervanWarning: true,
        dangerousSegments: dangerousSegmentsFor(regKey),
        maxWindMps: undefined,
      };
    }

    const forecast =
      (await (this.weather as any).getWeatherByLocation?.(lat, lng)) ??
      (await (this.weather as any).getNearestWeatherStation?.(lat, lng));

    const wind = typeof forecast?.windSpeed === 'number' ? forecast.windSpeed : 0;
    const exp = exposureForRegion(regKey);
    const crosswindRisk = crosswindLevel(wind, exp);
    const campervanWarning = wind >= 12 || crosswindRisk === 'high' || crosswindRisk === 'extreme';

    return {
      region: regionLabel,
      crosswindRisk,
      campervanWarning,
      dangerousSegments: dangerousSegmentsFor(regKey),
      maxWindMps: wind,
    };
  }
}
