/**
 * iceland.routeFeasibility — 世界约束裁决器（组合 P0：日照、F-road、横风、天气运行语义）。
 * Segment-based：预设区域 + 可选 roadId / distanceKm，无 polyline 亦可闭环。
 */

import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Skill, SkillInput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import type {
  CrosswindRiskLevel,
  IcelandRouteFeasibilityOutput,
  IcelandRouteFeasibilitySegment,
  IcelandRouteFeasibilityVehicle,
  IcelandRouteRoadSurfaceAlertsSummary,
  IcelandRouteTunnelProtocolSummary,
  IcelandWeatherSeverityClassifierOutput,
  IcelandWindRiskOutput,
  TravelOperationalRisk,
} from './iceland-world-driving-contracts';
import { GRAVEL_PROTECTION_INSURANCE_CODE, VESTFJARDAR_TUNNEL_PROTOCOL_CODE } from './iceland-world-driving-contracts';
import { IcelandDaylightWindowSkill } from './iceland-daylight-window.skill';
import { IcelandFRoadStatusSkill } from './iceland-f-road-status.skill';
import { IcelandWindRiskSkill } from './iceland-wind-risk.skill';
import { IcelandWeatherSeverityClassifierSkill } from './iceland-weather-severity-classifier.skill';
import { IcelandTunnelProtocolSkill } from './iceland-tunnel-protocol.skill';
import { IcelandRoadSurfaceAlertsSkill } from './iceland-road-surface-alerts.skill';
import {
  collectFRoadIdsFromSegments,
  judgeRouteFeasibility,
} from './utils/iceland-route-feasibility-judge.util';
import {
  normalizeFeasibilityRegion,
  northernmostPresetRegion,
} from './utils/iceland-feasibility-regions.util';
import { estimateRouteEnergyDemand } from './utils/iceland-route-energy-estimate.util';
import { computeFeasibilityDistanceAndDuration } from './utils/iceland-route-feasibility-metrics.util';

export interface IcelandRouteFeasibilityInput extends SkillInput {
  request_id: string;
  /** ISO YYYY-MM-DD（冰岛日历日） */
  travelDate: string;
  segments: IcelandRouteFeasibilitySegment[];
  vehicle: IcelandRouteFeasibilityVehicle;
  /** 规划均速，默认 60 km/h */
  assumedAverageSpeedKmh?: number;
}

const WIND_ORDER: CrosswindRiskLevel[] = ['low', 'medium', 'high', 'extreme'];

const WEATHER_ORDER: TravelOperationalRisk[] = ['safe', 'caution', 'dangerous', 'avoid_nonessential'];

function maxWind(a: CrosswindRiskLevel, b: CrosswindRiskLevel): CrosswindRiskLevel {
  return WIND_ORDER.indexOf(a) >= WIND_ORDER.indexOf(b) ? a : b;
}

function maxWeather(a: TravelOperationalRisk, b: TravelOperationalRisk): TravelOperationalRisk {
  return WEATHER_ORDER.indexOf(a) >= WEATHER_ORDER.indexOf(b) ? a : b;
}

function mergeWindOutputs(parts: IcelandWindRiskOutput[]): IcelandWindRiskOutput {
  if (!parts.length) {
    return {
      region: 'none',
      crosswindRisk: 'medium',
      campervanWarning: true,
      dangerousSegments: [],
    };
  }
  let cross: CrosswindRiskLevel = 'low';
  let camper = false;
  const segs: string[] = [];
  let maxW = 0;
  for (const p of parts) {
    cross = maxWind(cross, p.crosswindRisk);
    camper = camper || p.campervanWarning;
    segs.push(...(p.dangerousSegments || []));
    if (typeof p.maxWindMps === 'number') maxW = Math.max(maxW, p.maxWindMps);
  }
  return {
    region: 'aggregated',
    crosswindRisk: cross,
    campervanWarning: camper,
    dangerousSegments: Array.from(new Set(segs)).slice(0, 12),
    maxWindMps: maxW > 0 ? maxW : undefined,
  };
}

function mergeWeatherOutputs(parts: IcelandWeatherSeverityClassifierOutput[]): IcelandWeatherSeverityClassifierOutput {
  if (!parts.length) {
    return { travelRisk: 'caution', drivingRecommendation: ['无区域级预报：保守降级。'] };
  }
  let t: TravelOperationalRisk = 'safe';
  const rec: string[] = [];
  for (const p of parts) {
    t = maxWeather(t, p.travelRisk);
    rec.push(...(p.drivingRecommendation || []));
  }
  return { travelRisk: t, drivingRecommendation: Array.from(new Set(rec)).slice(0, 8) };
}

@SkillDecorator({
  name: 'iceland.routeFeasibility',
  description:
    '冰岛路线可行性裁决：F-road/车型硬挡、民用晨昏驾驶窗 vs 预估驾驶时长、横风+天气运行语义；组合 P0 skills，无新外部 API。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandRouteFeasibilitySkill implements Skill<IcelandRouteFeasibilityInput, IcelandRouteFeasibilityOutput> {
  metadata = {
    name: 'iceland.routeFeasibility',
    description: 'Segment-based 冰岛驾驶 OS 约束裁决器（组合 iceland.* P0）。',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['request_id', 'travelDate', 'segments', 'vehicle'],
      typeChecks: {
        request_id: { type: 'string' as const },
        travelDate: { type: 'string' as const },
        segments: { type: 'array' as const, min: 1 },
      },
    },
  };

  constructor(
    private readonly daylightWindow: IcelandDaylightWindowSkill,
    private readonly fRoadStatus: IcelandFRoadStatusSkill,
    private readonly windRisk: IcelandWindRiskSkill,
    private readonly weatherClassifier: IcelandWeatherSeverityClassifierSkill,
    private readonly tunnelProtocol: IcelandTunnelProtocolSkill,
    private readonly roadSurfaceAlerts: IcelandRoadSurfaceAlertsSkill,
  ) {}

  async execute(input: IcelandRouteFeasibilityInput): Promise<IcelandRouteFeasibilityOutput> {
    const p0SkillsInvoked: string[] = [];
    const assumedKmh = typeof input.assumedAverageSpeedKmh === 'number' && input.assumedAverageSpeedKmh > 0
      ? input.assumedAverageSpeedKmh
      : 60;

    if (!input.segments?.length) {
      throw new Error('iceland.routeFeasibility requires at least one segment');
    }

    const regionKeys = new Set<string>();
    for (const s of input.segments) {
      const a = normalizeFeasibilityRegion(s.from_region);
      const b = normalizeFeasibilityRegion(s.to_region);
      if (a) regionKeys.add(a);
      if (b) regionKeys.add(b);
    }
    const weatherRegionsAssessed = Array.from(regionKeys);
    const anchor = northernmostPresetRegion(weatherRegionsAssessed) ?? 'reykjavik';

    const fRoadIds = collectFRoadIdsFromSegments(input.segments);

    const { totalKm, estimatedDrivingHours, usedDistanceHeuristic } = computeFeasibilityDistanceAndDuration(
      input.segments,
      assumedKmh,
    );

    const daylightPromise = (async () => {
      p0SkillsInvoked.push('iceland.daylightWindow');
      return this.daylightWindow.execute({
        date: input.travelDate,
        region: anchor as any,
      });
    })();

    const fRoadPromise = (async () => {
      if (!fRoadIds.length) {
        return { roads: [], sources: [], dataGaps: [] as string[] };
      }
      p0SkillsInvoked.push('iceland.fRoadStatus');
      return this.fRoadStatus.execute({
        request_id: input.request_id,
        roadIds: fRoadIds,
      });
    })();

    const regionsForWeather =
      weatherRegionsAssessed.length > 0 ? weatherRegionsAssessed : [anchor];

    const perRegionPromise = Promise.all(
      regionsForWeather.map(async (region) => {
        p0SkillsInvoked.push('iceland.windRisk');
        p0SkillsInvoked.push('iceland.weatherSeverityClassifier');
        const [wind, wx] = await Promise.all([
          this.windRisk.execute({ request_id: input.request_id, region: region as any }),
          this.weatherClassifier.execute({ request_id: input.request_id, region: region as any }),
        ]);
        return { wind, wx };
      }),
    );

    const [daylight, fRoadPack, perRegion] = await Promise.all([
      daylightPromise,
      fRoadPromise,
      perRegionPromise,
    ]);

    const windAgg = mergeWindOutputs(perRegion.map((p) => p.wind));
    const wxAgg = mergeWeatherOutputs(perRegion.map((p) => p.wx));

    const start = DateTime.fromISO(daylight.safeDrivingWindow.start, { zone: 'Atlantic/Reykjavik' });
    const end = DateTime.fromISO(daylight.safeDrivingWindow.end, { zone: 'Atlantic/Reykjavik' });
    const safeDrivingWindowHours =
      start.isValid && end.isValid ? Math.max(0, end.diff(start, 'hours').hours) : daylight.daylightHours;

    const judge = judgeRouteFeasibility(input.segments, input.vehicle, {
      fRoadStatuses: fRoadPack.roads,
      weather: wxAgg,
      wind: windAgg,
      estimatedDrivingHours,
      safeDrivingWindowHours,
      usedDistanceHeuristic,
      temporalMileageUnbounded: daylight.temporalMileageUnbounded,
      polarNightCompact: daylight.daylightRegime === 'polar_night' && daylight.daylightHours < 4,
    });

    const tunnel = await this.tunnelProtocol.execute({
      request_id: input.request_id,
      segments: input.segments,
    });
    if (tunnel.triggered) {
      p0SkillsInvoked.push('iceland.tunnelProtocol');
    }
    const gravelSurf = await this.roadSurfaceAlerts.execute({
      request_id: input.request_id,
      segments: input.segments,
    });
    if (gravelSurf.triggered) {
      p0SkillsInvoked.push('iceland.roadSurfaceAlerts');
    }
    const recommendedAdjustments = Array.from(
      new Set([
        ...judge.recommendedAdjustments,
        ...tunnel.recommendedAdjustments,
        ...gravelSurf.recommendedAdjustments,
      ]),
    );

    const uniqueP0 = Array.from(new Set(p0SkillsInvoked));
    const energyDemandEstimate = estimateRouteEnergyDemand(totalKm, input.vehicle, input.segments);
    const rawSafeHoursRounded = Math.round(safeDrivingWindowHours * 100) / 100;

    const tunnelProtocol: IcelandRouteTunnelProtocolSummary = {
      triggered: tunnel.triggered,
      ...(tunnel.triggered ? { protocolCode: VESTFJARDAR_TUNNEL_PROTOCOL_CODE } : {}),
      drivingNotes: tunnel.drivingNotes,
      affectedSegments: tunnel.affectedSegments,
    };

    const roadSurfaceAlerts: IcelandRouteRoadSurfaceAlertsSummary = {
      triggered: gravelSurf.triggered,
      ...(gravelSurf.triggered ? { protocolCode: GRAVEL_PROTECTION_INSURANCE_CODE } : {}),
      drivingNotes: gravelSurf.drivingNotes,
      affectedSegments: gravelSurf.affectedSegments,
    };

    return {
      feasible: judge.feasible,
      riskLevel: judge.riskLevel,
      blockedReasons: judge.blockedReasons,
      recommendedAdjustments,
      daylightSummary: {
        regime: daylight.daylightRegime,
        daylightRisk: daylight.daylightRisk,
        temporalMileageUnbounded: daylight.temporalMileageUnbounded,
        civilTwilightHours: daylight.civilTwilightHours,
        daylightHours: daylight.daylightHours,
      },
      constraints: {
        mustLeaveBy: daylight.safeDrivingWindow.start,
        safeDrivingWindowEnd: daylight.safeDrivingWindow.end,
        safeDrivingWindowHours: rawSafeHoursRounded,
        estimatedDrivingHours: Math.round(estimatedDrivingHours * 100) / 100,
        effectiveSafeDrivingWindowHours: daylight.temporalMileageUnbounded ? null : rawSafeHoursRounded,
        daylightAnchorRegion: anchor,
        weatherRegionsAssessed: regionsForWeather,
        assumedAverageSpeedKmh: assumedKmh,
      },
      energyDemandEstimate,
      tunnelProtocol,
      roadSurfaceAlerts,
      usedDistanceHeuristic,
      p0SkillsInvoked: uniqueP0,
    };
  }
}
