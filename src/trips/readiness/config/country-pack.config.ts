// src/trips/readiness/config/country-pack.config.ts

/**
 * Country Pack 配置
 * 
 * 国家/地区特定的地形策略配置
 */

import { RiskThresholds, EffortLevelMapping, TerrainConstraints } from './terrain-policy.config';

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
}

export const COUNTRY_PACKS: Record<string, CountryPack> = {
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
  GLOBAL: {
    countryCode: 'GLOBAL',
    countryName: '全球默认',
    effortLevelMapping: {
      relaxMax: 30,
      moderateMax: 60,
      challengeMax: 85,
      extremeMin: 85,
    },
  },
};

/**
 * 根据国家代码获取CountryPack
 */
export function getCountryPack(countryCode: string): CountryPack {
  return COUNTRY_PACKS[countryCode] || COUNTRY_PACKS.GLOBAL;
}

