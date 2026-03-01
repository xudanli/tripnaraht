// src/safety/interfaces/travel-advisory-adapter.interface.ts

import { TravelAdvisoryDto, GeopoliticalRiskLevel } from '../dto/geopolitical-risk.dto';

/**
 * 旅行警告数据适配器接口
 * 所有外部数据源适配器必须实现此接口
 */
export interface TravelAdvisoryAdapter {
  /**
   * 数据源名称
   */
  readonly sourceName: string;

  /**
   * 获取指定国家的旅行警告
   * @param countryCode ISO 3166-1 alpha-2 国家代码
   */
  getAdvisory(countryCode: string): Promise<TravelAdvisoryDto | null>;

  /**
   * 获取所有国家的旅行警告
   */
  getAllAdvisories(): Promise<TravelAdvisoryDto[]>;

  /**
   * 检查适配器是否可用
   */
  isAvailable(): boolean;

  /**
   * 获取数据最后更新时间
   */
  getLastUpdated(): Date | null;
}

/**
 * 标准化的风险等级映射函数
 * 将各数据源的风险等级映射到统一的 GeopoliticalRiskLevel
 */
export function mapToGeopoliticalRiskLevel(
  sourceLevel: number | string,
  sourceType: 'US_STATE_DEPT' | 'UK_FCDO' | 'GENERIC',
): GeopoliticalRiskLevel {
  if (sourceType === 'US_STATE_DEPT') {
    // US State Department: 1-4 级
    const level = typeof sourceLevel === 'string' ? parseInt(sourceLevel, 10) : sourceLevel;
    switch (level) {
      case 1: return GeopoliticalRiskLevel.SAFE;
      case 2: return GeopoliticalRiskLevel.CAUTION;
      case 3: return GeopoliticalRiskLevel.HIGH_RISK;
      case 4: return GeopoliticalRiskLevel.NO_GO;
      default: return GeopoliticalRiskLevel.CAUTION;
    }
  }

  if (sourceType === 'UK_FCDO') {
    // UK FCDO: 文字描述映射
    const levelStr = String(sourceLevel).toLowerCase();
    if (levelStr.includes('advise against all travel')) {
      return GeopoliticalRiskLevel.NO_GO;
    }
    if (levelStr.includes('advise against all but essential travel')) {
      return GeopoliticalRiskLevel.DANGEROUS;
    }
    if (levelStr.includes('high degree of caution')) {
      return GeopoliticalRiskLevel.HIGH_RISK;
    }
    if (levelStr.includes('see our travel advice')) {
      return GeopoliticalRiskLevel.CAUTION;
    }
    return GeopoliticalRiskLevel.SAFE;
  }

  // 通用映射
  const level = typeof sourceLevel === 'string' ? parseInt(sourceLevel, 10) : sourceLevel;
  if (level <= 1) return GeopoliticalRiskLevel.SAFE;
  if (level <= 2) return GeopoliticalRiskLevel.CAUTION;
  if (level <= 3) return GeopoliticalRiskLevel.HIGH_RISK;
  if (level <= 4) return GeopoliticalRiskLevel.DANGEROUS;
  return GeopoliticalRiskLevel.NO_GO;
}

/**
 * 国家代码到国家名称的映射
 */
export const COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan',
  AL: 'Albania',
  DZ: 'Algeria',
  AD: 'Andorra',
  AO: 'Angola',
  AR: 'Argentina',
  AM: 'Armenia',
  AU: 'Australia',
  AT: 'Austria',
  AZ: 'Azerbaijan',
  BH: 'Bahrain',
  BD: 'Bangladesh',
  BY: 'Belarus',
  BE: 'Belgium',
  BR: 'Brazil',
  BG: 'Bulgaria',
  CA: 'Canada',
  CL: 'Chile',
  CN: 'China',
  CO: 'Colombia',
  HR: 'Croatia',
  CU: 'Cuba',
  CY: 'Cyprus',
  CZ: 'Czech Republic',
  DK: 'Denmark',
  EG: 'Egypt',
  EE: 'Estonia',
  FI: 'Finland',
  FR: 'France',
  GE: 'Georgia',
  DE: 'Germany',
  GR: 'Greece',
  HK: 'Hong Kong',
  HU: 'Hungary',
  IS: 'Iceland',
  IN: 'India',
  ID: 'Indonesia',
  IR: 'Iran',
  IQ: 'Iraq',
  IE: 'Ireland',
  IL: 'Israel',
  IT: 'Italy',
  JP: 'Japan',
  JO: 'Jordan',
  KZ: 'Kazakhstan',
  KE: 'Kenya',
  KP: 'North Korea',
  KR: 'South Korea',
  KW: 'Kuwait',
  LB: 'Lebanon',
  LY: 'Libya',
  LT: 'Lithuania',
  LV: 'Latvia',
  LU: 'Luxembourg',
  MY: 'Malaysia',
  MX: 'Mexico',
  MA: 'Morocco',
  NL: 'Netherlands',
  NZ: 'New Zealand',
  NG: 'Nigeria',
  NO: 'Norway',
  OM: 'Oman',
  PK: 'Pakistan',
  PS: 'Palestine',
  PA: 'Panama',
  PH: 'Philippines',
  PL: 'Poland',
  PT: 'Portugal',
  QA: 'Qatar',
  RO: 'Romania',
  RU: 'Russia',
  SA: 'Saudi Arabia',
  RS: 'Serbia',
  SG: 'Singapore',
  SK: 'Slovakia',
  SI: 'Slovenia',
  ZA: 'South Africa',
  ES: 'Spain',
  SE: 'Sweden',
  CH: 'Switzerland',
  SY: 'Syria',
  TW: 'Taiwan',
  TH: 'Thailand',
  TR: 'Turkey',
  UA: 'Ukraine',
  AE: 'United Arab Emirates',
  GB: 'United Kingdom',
  US: 'United States',
  VE: 'Venezuela',
  VN: 'Vietnam',
  YE: 'Yemen',
};

/**
 * 邻国关系映射 - 用于判断冲突波及范围
 */
export const ADJACENT_COUNTRIES: Record<string, string[]> = {
  IR: ['IQ', 'TR', 'AZ', 'AM', 'TM', 'AF', 'PK'], // 伊朗
  IL: ['LB', 'SY', 'JO', 'EG', 'PS'], // 以色列
  UA: ['RU', 'BY', 'PL', 'SK', 'HU', 'RO', 'MD'], // 乌克兰
  RU: ['UA', 'BY', 'FI', 'EE', 'LV', 'LT', 'PL', 'GE', 'AZ', 'KZ', 'CN', 'MN', 'KP'], // 俄罗斯
  SY: ['TR', 'IQ', 'JO', 'IL', 'LB'], // 叙利亚
  IQ: ['TR', 'IR', 'SY', 'JO', 'SA', 'KW'], // 伊拉克
  AF: ['IR', 'PK', 'TM', 'UZ', 'TJ', 'CN'], // 阿富汗
  YE: ['SA', 'OM'], // 也门
  LB: ['SY', 'IL'], // 黎巴嫩
  KP: ['KR', 'CN', 'RU'], // 朝鲜
  TW: ['CN'], // 台湾（海峡对岸）
};

/**
 * 地区冲突影响范围
 */
export const REGIONAL_IMPACT_ZONES: Record<string, string[]> = {
  MIDDLE_EAST: ['IR', 'IQ', 'SY', 'IL', 'LB', 'JO', 'SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'YE', 'PS'],
  PERSIAN_GULF: ['IR', 'IQ', 'KW', 'SA', 'BH', 'QA', 'AE', 'OM'],
  EASTERN_EUROPE: ['UA', 'RU', 'BY', 'PL', 'MD', 'RO', 'HU', 'SK'],
  EAST_ASIA: ['CN', 'TW', 'JP', 'KR', 'KP'],
  SOUTH_ASIA: ['IN', 'PK', 'AF', 'BD', 'NP', 'LK'],
  HORN_OF_AFRICA: ['ET', 'ER', 'SO', 'DJ', 'SD', 'SS'],
  SAHEL: ['ML', 'NE', 'BF', 'TD', 'MR', 'SN'],
};
