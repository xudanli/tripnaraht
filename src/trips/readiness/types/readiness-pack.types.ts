// src/trips/readiness/types/readiness-pack.types.ts

/**
 * Travel Readiness Pack Types
 * 
 * 定义目的地准备度检查的数据模型
 * 支持全球扩展，每个目的地一个 Pack
 * 支持多语言：en（英文）和 zh（中文）
 */

/**
 * 支持的语言代码
 */
export type SupportedLanguage = 'en' | 'zh';

/**
 * 多语言字符串类型
 * 可以是字符串（向后兼容，默认为英文）或多语言对象
 */
export type LocalizedString = string | {
  en: string;
  zh?: string;
};

export type SeasonType =
  | 'polar_night'
  | 'polar_day'
  | 'shoulder'
  | 'winter'
  | 'summer'
  | 'rainy'
  | 'dry'
  | 'hurricane'
  | 'monsoon'
  | 'all';

export type ReadinessCategory =
  | 'entry_transit'
  | 'safety_hazards'
  | 'health_insurance'
  | 'gear_packing'
  | 'activities_bookings'
  | 'logistics';

export type RuleSeverity = 'low' | 'medium' | 'high';

export type ActionLevel = 'must' | 'should' | 'optional' | 'blocker';

export type HazardType =
  | 'wildlife'
  | 'weather_extreme'
  | 'terrain'
  | 'crime'
  | 'healthcare_gap'
  | 'regulatory'
  | 'logistics_remote'
  | 'water_safety';

export interface GeoInfo {
  countryCode: string; // ISO 3166-1 alpha-2
  region: string;
  city: string;
  lat?: number;
  lng?: number;
}

export interface Source {
  sourceId: string;
  authority: string;
  type: 'pdf' | 'html' | 'api' | 'regulation' | 'manual';
  title?: LocalizedString;
  canonicalUrl?: string;
}

export interface Evidence {
  sourceId: string;
  sectionId?: string;
  quote?: string;
  retrievedAt?: string; // ISO datetime
}

export interface Condition {
  all?: Condition[];
  any?: Condition[];
  not?: Condition;
  exists?: string; // path
  eq?: { path: string; value: any };
  ne?: { path: string; value: any }; // not equal
  gt?: { path: string; value: number }; // greater than
  gte?: { path: string; value: number }; // greater than or equal
  lt?: { path: string; value: number }; // less than
  lte?: { path: string; value: number }; // less than or equal
  in?: { path: string; values: any[] };
  containsAny?: { path: string; values: string[] };
}

export interface Task {
  title: LocalizedString;
  dueOffsetDays?: number; // 相对出发日期的偏移天数（负数表示提前）
  tags?: string[];
}

export interface Action {
  level: ActionLevel;
  message: LocalizedString;
  tasks?: Task[];
  askUser?: LocalizedString[]; // 需要用户提供的信息
}

export interface Rule {
  id: string;
  category: ReadinessCategory;
  severity: RuleSeverity;
  appliesTo?: {
    seasons?: SeasonType[];
    activities?: string[];
    travelerTags?: string[];
  };
  when: Condition;
  then: Action;
  evidence?: Evidence[];
  notes?: LocalizedString;
}

export interface Checklist {
  id: string;
  category: ReadinessCategory;
  appliesToSeasons?: SeasonType[];
  items: LocalizedString[];
}

export interface Hazard {
  type: HazardType;
  severity: RuleSeverity;
  summary: LocalizedString;
  mitigations: LocalizedString[];
}

export interface ReadinessPack {
  packId: string;
  destinationId: string;
  displayName: LocalizedString;
  version: string; // semantic version: "1.0.0"
  lastReviewedAt: string; // ISO datetime
  geo: GeoInfo;
  supportedSeasons: SeasonType[];
  sources?: Source[];
  rules: Rule[];
  checklists: Checklist[];
  hazards?: Hazard[];
}

