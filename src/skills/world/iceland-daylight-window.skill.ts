/**
 * iceland.daylightWindow — 日照与安全驾驶时间窗（冰岛冬季密度约束的基础设施）。
 */

import { Injectable } from '@nestjs/common';
import SunCalc from 'suncalc';
import { DateTime } from 'luxon';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import type {
  IcelandDaylightRegime,
  IcelandDaylightRiskBand,
  IcelandDaylightWindowOutput,
} from './iceland-world-driving-contracts';

export interface IcelandDaylightWindowInput extends SkillInput {
  /** ISO 日期 YYYY-MM-DD（冰岛日历日） */
  date: string;
  /** 区域预设；与 lat/lng 二选一优先使用显式坐标 */
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

const REGION_COORDS: Record<NonNullable<IcelandDaylightWindowInput['region']>, { lat: number; lng: number }> = {
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

function icelandNoonUtcDate(isoDate: string): Date {
  const dt = DateTime.fromISO(isoDate, { zone: 'Atlantic/Reykjavik' });
  if (!dt.isValid) {
    throw new Error(`invalid_date:${isoDate}`);
  }
  const noon = dt.set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
  return noon.toUTC().toJSDate();
}

function nightRiskFromDaylightHours(h: number): IcelandDaylightWindowOutput['nightDrivingRisk'] {
  if (h < 5) return 'high';
  if (h < 8) return 'medium';
  return 'low';
}

@SkillDecorator({
  name: 'iceland.daylightWindow',
  description:
    '根据日期与纬度计算机冰岛日照时长、民用晨昏蒙影安全驾驶窗、夜驾风险；可选黄金时刻。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandDaylightWindowSkill implements Skill<IcelandDaylightWindowInput, IcelandDaylightWindowOutput> {
  metadata = {
    name: 'iceland.daylightWindow',
    description: '计算 iceland 日照与安全驾驶 daylight 时间窗（suncalc + Atlantic/Reykjavik）。在 planning/readiness 需判断可驾驶时段或 polar night 风险时调用。',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['date'],
      typeChecks: {
        date: { type: 'string' as const, format: 'date' as const },
      },
    },
  };

  async execute(input: IcelandDaylightWindowInput): Promise<IcelandDaylightWindowOutput> {
    let lat = input.lat;
    let lng = input.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      const reg = input.region && REGION_COORDS[input.region];
      if (!reg) {
        throw new Error('iceland.daylightWindow requires region or lat/lng');
      }
      lat = reg.lat;
      lng = reg.lng;
    }

    const base = icelandNoonUtcDate(input.date);
    const times = SunCalc.getTimes(base, lat, lng);
    const sunrise = times.sunrise;
    const sunset = times.sunset;
    const dawn = times.dawn;
    const dusk = times.dusk;
    const ghStart = times.goldenHour;
    const ghEnd = times.goldenHourEnd;

    const daylightMs = Math.max(0, sunset.getTime() - sunrise.getTime());
    const daylightHours = Math.round((daylightMs / 3_600_000) * 100) / 100;

    const zone = 'Atlantic/Reykjavik';
    const iso = (d: Date) => DateTime.fromJSDate(d, { zone: 'UTC' }).setZone(zone).toISO()!;

    const civilMs = Math.max(0, dusk.getTime() - dawn.getTime());
    const civilTwilightHours = Math.round((civilMs / 3_600_000) * 100) / 100;

    let daylightRegime: IcelandDaylightRegime = 'normal';
    if (daylightHours < 4) {
      daylightRegime = 'polar_night';
    } else if (civilTwilightHours >= 19.5 || daylightHours >= 17.5) {
      daylightRegime = 'midnight_sun';
    }

    const temporalMileageUnbounded = daylightRegime === 'midnight_sun';

    const nr = nightRiskFromDaylightHours(daylightHours);
    let daylightRisk: IcelandDaylightRiskBand = 'LOW';
    if (temporalMileageUnbounded) {
      daylightRisk = 'NONE';
    } else if (daylightRegime === 'polar_night') {
      daylightRisk = 'HIGH';
    } else if (nr === 'high') {
      daylightRisk = 'HIGH';
    } else if (nr === 'medium') {
      daylightRisk = 'MEDIUM';
    } else {
      daylightRisk = 'LOW';
    }

    return {
      daylightHours,
      civilTwilightHours,
      safeDrivingWindow: {
        start: iso(dawn),
        end: iso(dusk),
      },
      nightDrivingRisk: nr,
      daylightRegime,
      temporalMileageUnbounded,
      daylightRisk,
      sunrise: iso(sunrise),
      sunset: iso(sunset),
      goldenHourStart: ghStart ? iso(ghStart) : undefined,
      goldenHourEnd: ghEnd ? iso(ghEnd) : undefined,
    };
  }
}
