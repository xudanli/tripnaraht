// src/content-strategy/interfaces/localization.interface.ts

/**
 * 本地化内容策略接口定义
 * 
 * 基于 CONTENT_STRATEGY_COMPLIANCE.md 的P2要求：
 * - 中文本土化规范
 * - 不同城市用户的沟通适配
 */

/**
 * 中文地区类型
 */
export type ChineseRegion = 'MAINLAND' | 'TAIWAN' | 'HONGKONG' | 'SINGAPORE';

/**
 * 城市层级
 */
export type CityTier = 'TIER1' | 'TIER2' | 'TIER3' | 'TIER4' | 'OVERSEAS';

/**
 * 用户群体类型
 */
export type UserGroup = 'STUDENT' | 'WORKER' | 'RETIREE' | 'FREELANCER' | 'OTHER';

/**
 * 本地化上下文
 */
export interface LocalizationContext {
  /** 语言 */
  language: 'zh-CN' | 'zh-TW' | 'zh-HK' | 'en';
  /** 中文地区（如果是中文） */
  chineseRegion?: ChineseRegion;
  /** 城市层级 */
  cityTier?: CityTier;
  /** 城市名称 */
  cityName?: string;
  /** 用户群体 */
  userGroup?: UserGroup;
  /** 用户年龄范围 */
  ageRange?: 'TEEN' | 'YOUNG_ADULT' | 'ADULT' | 'SENIOR';
}

/**
 * 中文本土化规则
 */
export interface ChineseLocalizationRules {
  /** 避免过度网络用语 */
  avoidInternetSlang: boolean;
  /** 避免强制娱乐化表达 */
  avoidForcedEntertainment: boolean;
  /** 避免生硬翻译 */
  avoidLiteralTranslation: boolean;
  /** 使用自然日常中文 */
  useNaturalDailyChinese: boolean;
  /** 地区特定规则 */
  regionSpecificRules?: Record<ChineseRegion, string[]>;
}

/**
 * 城市用户适配规则
 */
export interface CityAdaptationRules {
  /** 一线城市规则 */
  tier1: {
    characteristics: string[];
    communicationStyle: string;
    examples: string[];
  };
  /** 二线城市规则 */
  tier2: {
    characteristics: string[];
    communicationStyle: string;
    examples: string[];
  };
  /** 三线城市规则 */
  tier3: {
    characteristics: string[];
    communicationStyle: string;
    examples: string[];
  };
  /** 海外华人规则 */
  overseas: {
    characteristics: string[];
    communicationStyle: string;
    examples: string[];
  };
}

/**
 * 用户群体适配规则
 */
export interface UserGroupAdaptationRules {
  /** 学生用户规则 */
  student: {
    acknowledgeConstraints: string;
    optimizeForStudent: string;
    lowCostRoutes: string;
    timeMatching: string;
    specialSupport: string;
  };
  /** 工作者用户规则 */
  worker: {
    acknowledgeValue: string;
    timePlanning: string;
    rhythmArrangement: string;
    expectationManagement: string;
  };
}

/**
 * 本地化结果
 */
export interface LocalizedContent {
  /** 原始文本 */
  originalText: string;
  /** 本地化后的文本 */
  localizedText: string;
  /** 应用的规则 */
  appliedRules: string[];
  /** 适配说明 */
  adaptationNotes: string[];
}
