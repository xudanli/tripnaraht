/**
 * 冰岛 C 级 POI — 拥堵预测基线（无预约，停车即容量）
 *
 * 信号来源：MODEL + TRAFFIC（Umferðin 车流可进一步校准）
 */

import type { PoiCrowdingSnapshot } from '../interfaces/poi-access-capacity.interface';

export const ICELAND_C_TIER_POI_SLUGS = {
  GULLFOSS: 'is.gullfoss',
  GEYSIR: 'is.geysir',
  SELJALANDSFOSS: 'is.seljalandsfoss',
  SKOGAFOSS: 'is.skogafoss',
  JOKULSARLON: 'is.jokulsarlon',
  THINGVELLIR: 'is.thingvellir',
} as const;

/** 按小时的基础拥挤系数 0–1（夏季 weekday 启发式） */
export type CrowdingHourProfile = Record<number, number>;

export interface IcelandCrowdingProfile {
  poiId: string;
  /** 基础停车等待 P50（分钟）= baseParkingWaitP50 × hourFactor × seasonFactor */
  baseParkingWaitP50: number;
  hourProfile: CrowdingHourProfile;
  /** 7–8 月旅游旺季乘数 */
  peakSeasonMultiplier: number;
  parkingCapacityApprox?: number;
  turnRateFromRoad?: number;
}

export const ICELAND_C_TIER_CROWDING_PROFILES: IcelandCrowdingProfile[] = [
  {
    poiId: ICELAND_C_TIER_POI_SLUGS.GULLFOSS,
    baseParkingWaitP50: 12,
    peakSeasonMultiplier: 1.4,
    parkingCapacityApprox: 120,
    turnRateFromRoad: 0.35,
    hourProfile: {
      8: 0.4, 9: 0.6, 10: 0.85, 11: 1.0, 12: 0.95, 13: 0.9,
      14: 0.85, 15: 0.8, 16: 0.65, 17: 0.5, 18: 0.35,
    },
  },
  {
    poiId: ICELAND_C_TIER_POI_SLUGS.GEYSIR,
    baseParkingWaitP50: 10,
    peakSeasonMultiplier: 1.35,
    parkingCapacityApprox: 150,
    turnRateFromRoad: 0.4,
    hourProfile: {
      9: 0.5, 10: 0.75, 11: 0.95, 12: 1.0, 13: 0.95, 14: 0.85, 15: 0.7,
    },
  },
  {
    poiId: ICELAND_C_TIER_POI_SLUGS.SELJALANDSFOSS,
    baseParkingWaitP50: 15,
    peakSeasonMultiplier: 1.5,
    parkingCapacityApprox: 80,
    turnRateFromRoad: 0.45,
    hourProfile: {
      9: 0.55, 10: 0.8, 11: 1.0, 12: 0.95, 13: 0.9, 14: 0.85, 16: 0.6,
    },
  },
  {
    poiId: ICELAND_C_TIER_POI_SLUGS.SKOGAFOSS,
    baseParkingWaitP50: 14,
    peakSeasonMultiplier: 1.45,
    parkingCapacityApprox: 90,
    turnRateFromRoad: 0.42,
    hourProfile: {
      9: 0.5, 10: 0.78, 11: 1.0, 12: 0.92, 13: 0.88, 15: 0.72,
    },
  },
  {
    poiId: ICELAND_C_TIER_POI_SLUGS.JOKULSARLON,
    baseParkingWaitP50: 18,
    peakSeasonMultiplier: 1.55,
    parkingCapacityApprox: 100,
    turnRateFromRoad: 0.38,
    hourProfile: {
      10: 0.6, 11: 0.85, 12: 1.0, 13: 0.95, 14: 0.9, 15: 0.85, 16: 0.75,
    },
  },
  {
    poiId: ICELAND_C_TIER_POI_SLUGS.THINGVELLIR,
    baseParkingWaitP50: 8,
    peakSeasonMultiplier: 1.25,
    parkingCapacityApprox: 200,
    turnRateFromRoad: 0.3,
    hourProfile: {
      9: 0.45, 10: 0.65, 11: 0.85, 12: 0.9, 13: 0.85, 14: 0.75, 15: 0.6,
    },
  },
];

export function getCrowdingProfile(poiId: string): IcelandCrowdingProfile | undefined {
  return ICELAND_C_TIER_CROWDING_PROFILES.find((p) => p.poiId === poiId);
}

/** 由 C 级基线 + 到达时刻推断拥堵快照 */
export function inferCrowdingFromProfile(input: {
  poiId: string;
  dateISO: string;
  arrivalTime: string;
  arrivalRateMultiplier?: number;
}): PoiCrowdingSnapshot | undefined {
  const profile = getCrowdingProfile(input.poiId);
  if (!profile) return undefined;

  const hourMatch = /^(\d{1,2}):/.exec(input.arrivalTime.trim());
  const hour = hourMatch ? Number(hourMatch[1]) : 12;
  const hourFactor = profile.hourProfile[hour] ?? 0.5;

  const month = Number(input.dateISO.slice(5, 7));
  const isPeakSeason = month >= 6 && month <= 8;
  const seasonFactor = isPeakSeason ? profile.peakSeasonMultiplier : 1;

  const trafficMult = input.arrivalRateMultiplier ?? 1;
  const p50 = Math.round(
    profile.baseParkingWaitP50 * hourFactor * seasonFactor * trafficMult,
  );
  const p90 = Math.round(p50 * 1.8);

  let crowdLevel: PoiCrowdingSnapshot['crowdLevel'] = 'LOW';
  if (p50 >= 25) crowdLevel = 'HIGH';
  else if (p50 >= 15) crowdLevel = 'MEDIUM';

  const arrivalRatePerHour =
    profile.parkingCapacityApprox && profile.turnRateFromRoad
      ? profile.parkingCapacityApprox * profile.turnRateFromRoad * hourFactor * trafficMult
      : undefined;

  return {
    poiId: input.poiId,
    observedAt: new Date().toISOString(),
    predictedWaitP50: p50,
    predictedWaitP90: p90,
    crowdLevel,
    arrivalRatePerHour,
    parkingOccupancyRatio: Math.min(1, hourFactor * seasonFactor * 0.85),
    signalSources: ['MODEL'],
    confidenceScore: 0.55,
  };
}
