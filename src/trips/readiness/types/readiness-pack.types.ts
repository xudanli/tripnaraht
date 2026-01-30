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

/**
 * ActionLevel - 准备事项的优先级级别
 * 
 * **业务定义**（必须严格遵守）：
 * 
 * **blocker**: 法律/安全/健康硬性要求，不满足则无法出行
 *   - 签证要求（VISA_REQUIRED、EVISA、VOA）
 *   - 强制保险（某些国家法律要求）
 *   - 禁止性规定（例如：斯瓦尔巴禁止独自进入荒野）
 *   - 健康证明（例如：某些国家要求黄热病疫苗证明）
 *   - 使用场景：不满足则行程无法执行，必须解决
 * 
 * **must**: 强烈建议，不满足可能导致行程失败或高风险
 *   - 推荐保险（非强制但强烈建议，覆盖高风险活动）
 *   - 关键装备（例如：高海拔地区需要保暖衣物、防滑链）
 *   - 预订要求（例如：旺季住宿必须提前预订，否则无法入住）
 *   - 使用场景：强烈建议完成，不完成可能导致行程失败或严重风险
 * 
 * **should**: 建议性，不满足可能影响体验或增加风险
 *   - 可选装备（例如：转换插头、现金准备）
 *   - 提前准备（例如：了解当地文化、学习基本语言）
 *   - 使用场景：建议完成，不完成可能影响体验或增加小风险
 * 
 * **optional**: 可选，不影响核心行程
 *   - 文化准备（例如：学习当地语言、了解当地习俗）
 *   - 非关键装备（例如：相机、充电宝）
 *   - 使用场景：可选完成，不影响核心行程执行
 * 
 * **选择指南**：
 * - 如果违反法律/法规 → blocker
 * - 如果可能导致行程失败 → must
 * - 如果影响体验但可接受 → should
 * - 如果完全可选 → optional
 */
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
  when?: Condition;  // 可选：如果规则总是触发，可以没有 when 条件
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

