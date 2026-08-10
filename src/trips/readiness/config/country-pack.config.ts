// src/trips/readiness/config/country-pack.config.ts

/**
 * Country Pack 配置
 * 
 * 国家/地区特定的地形策略配置
 */

import { RiskThresholds, EffortLevelMapping, TerrainConstraints } from './terrain-policy.config';

export interface DrivingSegmentThresholds {
  /** 单段直线距离超过此值 → 超长距离 blocker */
  maxSegmentDistanceKm: number;
  /** 单段超过此值 → 长距离提醒 */
  warnSegmentDistanceKm: number;
  /** 冬季额外提醒阈值（可选） */
  winterWarnSegmentDistanceKm?: number;
}

export interface CountryPack {
  /** 国家代码 */
  countryCode: string;
  /** 国家名称 */
  countryName: string;
  /** 风险阈值（覆盖默认值） */
  riskThresholds?: Partial<RiskThresholds>;
  /** 体力等级映射（覆盖默认值） */
  effortLevelMapping?: Partial<EffortLevelMapping>;
  /** 地形约束（覆盖默认值） */
  terrainConstraints?: Partial<TerrainConstraints>;
  /** 自驾单段距离阈值（Coverage Map / road_class） */
  drivingSegmentThresholds?: DrivingSegmentThresholds;
}

export const COUNTRY_PACKS: Record<string, CountryPack> = {
  /** 中国国家级默认（城市/东部自驾等）；高原专项仍用 CN_XIZANG / CN_SICHUAN */
  CN: {
    countryCode: 'CN',
    countryName: '中国',
    riskThresholds: {
      highAltitudeM: 2500,
      rapidAscentM: 500,
      steepSlopePct: 15,
      bigAscentDayM: 1200,
    },
    effortLevelMapping: {
      relaxMax: 30,
      moderateMax: 60,
      challengeMax: 85,
      extremeMin: 85,
    },
    drivingSegmentThresholds: {
      maxSegmentDistanceKm: 350,
      warnSegmentDistanceKm: 220,
      winterWarnSegmentDistanceKm: 180,
    },
  },
  CN_XIZANG: {
    countryCode: 'CN_XIZANG',
    countryName: '中国西藏',
    riskThresholds: {
      highAltitudeM: 3500,
      rapidAscentM: 500,
      steepSlopePct: 15,
      bigAscentDayM: 1500,
    },
    effortLevelMapping: {
      relaxMax: 30,
      moderateMax: 60,
      challengeMax: 85,
      extremeMin: 85,
    },
    /** 高原廊道：垭口/高反，单段宜短于国家级 CN */
    drivingSegmentThresholds: {
      maxSegmentDistanceKm: 250,
      warnSegmentDistanceKm: 160,
      winterWarnSegmentDistanceKm: 120,
    },
  },
  CN_SICHUAN: {
    countryCode: 'CN_SICHUAN',
    countryName: '中国四川',
    riskThresholds: {
      highAltitudeM: 3000,
      rapidAscentM: 400,
      steepSlopePct: 12,
      bigAscentDayM: 1200,
    },
    effortLevelMapping: {
      relaxMax: 30,
      moderateMax: 60,
      challengeMax: 85,
      extremeMin: 85,
    },
    /** 川西山路：急升与雨季塌方，控程介于 CN 与藏区之间 */
    drivingSegmentThresholds: {
      maxSegmentDistanceKm: 280,
      warnSegmentDistanceKm: 180,
      winterWarnSegmentDistanceKm: 140,
    },
  },
  NP: {
    countryCode: 'NP',
    countryName: '尼泊尔',
    riskThresholds: {
      highAltitudeM: 3500,
      rapidAscentM: 400,
      steepSlopePct: 12,
      bigAscentDayM: 1200,
    },
    effortLevelMapping: {
      relaxMax: 30,
      moderateMax: 60,
      challengeMax: 85,
      extremeMin: 85,
    },
  },
  NZ: {
    countryCode: 'NZ',
    countryName: '新西兰',
    riskThresholds: {
      highAltitudeM: 2000,
      rapidAscentM: 600,
      steepSlopePct: 20,
      bigAscentDayM: 1500,
    },
    effortLevelMapping: {
      relaxMax: 30,
      moderateMax: 60,
      challengeMax: 85,
      extremeMin: 85,
    },
  },
  IS: {
    countryCode: 'IS',
    countryName: '冰岛',
    riskThresholds: {
      highAltitudeM: 1800,
      rapidAscentM: 500,
      steepSlopePct: 18,
      bigAscentDayM: 1200,
    },
    effortLevelMapping: {
      relaxMax: 30,
      moderateMax: 60,
      challengeMax: 85,
      extremeMin: 85,
    },
    drivingSegmentThresholds: {
      maxSegmentDistanceKm: 250,
      warnSegmentDistanceKm: 150,
      winterWarnSegmentDistanceKm: 120,
    },
  },
  GLOBAL: {
    countryCode: 'GLOBAL',
    countryName: '全球默认',
    effortLevelMapping: {
      relaxMax: 30,
      moderateMax: 60,
      challengeMax: 85,
      extremeMin: 85,
    },
    drivingSegmentThresholds: {
      maxSegmentDistanceKm: 300,
      warnSegmentDistanceKm: 200,
      winterWarnSegmentDistanceKm: 150,
    },
  },
};

/**
 * 根据国家代码获取CountryPack
 */
export function getCountryPack(countryCode: string): CountryPack {
  return COUNTRY_PACKS[countryCode] || COUNTRY_PACKS.GLOBAL;
}

