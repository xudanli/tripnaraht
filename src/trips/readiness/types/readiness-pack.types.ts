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
 * HazardLevel - 危险等级（前端文档兼容）
 */
export type HazardLevel =
  | 'CRITICAL'            // 极度危险
  | 'HIGH'                // 高风险
  | 'MEDIUM'              // 中等风险
  | 'LOW'                 // 低风险
  | 'INFO';               // 信息提示

/**
 * ChecklistCategory - 清单分类（前端文档兼容）
 */
export type ChecklistCategory =
  | 'documents'           // 证件文件
  | 'clothing'            // 服装穿着
  | 'gear'                // 装备器材
  | 'electronics'         // 电子设备
  | 'toiletries'          // 洗漱用品
  | 'medicine'            // 药品医疗
  | 'food'                // 食品饮料
  | 'emergency'           // 应急物品
  | 'booking'             // 预订确认
  | 'other';              // 其他

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
export type ActionLevel = 'must' | 'should' | 'optional' | 'blocker' | 'could' | 'info';

export type HazardType =
  | 'wildlife'
  | 'weather_extreme'
  | 'terrain'
  | 'crime'
  | 'healthcare_gap'
  | 'regulatory'
  | 'logistics_remote'
  | 'water_safety'
  // 前端文档兼容类型（向后兼容）
  | 'AVALANCHE'
  | 'WEATHER'
  | 'TERRAIN'
  | 'WILDLIFE'
  | 'VOLCANIC'
  | 'FLOOD'
  | 'EARTHQUAKE'
  | 'TSUNAMI'
  | 'ROAD'
  | 'ALTITUDE'
  | 'COLD'
  | 'HEAT'
  | 'UV'
  | 'WATER'
  | 'OTHER';

export interface GeoInfo {
  countryCode: string; // ISO 3166-1 alpha-2
  region: string | LocalizedString;      // 🆕 支持多语言
  city: string | LocalizedString;        // 🆕 支持多语言
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
  /**
   * 地理特征条件（便捷语法）
   * 支持直接访问 geo.* 字段，如：
   * - geo.rivers.nearRiver
   * - geo.mountains.mountainElevationAvg
   * - geo.roads.roadDensityScore
   * - geo.pois.hasEVCharger
   * - geo.altitude_m
   * 
   * 示例：
   * ```typescript
   * {
   *   geo: {
   *     mountains: { mountainElevationAvg: { gte: 3000 } },
   *     roads: { roadDensityScore: { lt: 0.3 } },
   *     pois: { hasEVCharger: true }
   *   }
   * }
   * ```
   * 
   * 注意：也可以使用 path 语法，如：
   * ```typescript
   * { gte: { path: 'geo.mountains.mountainElevationAvg', value: 3000 } }
   * ```
   */
  geo?: {
    rivers?: {
      nearRiver?: boolean;
      nearestRiverDistanceM?: { gt?: number; gte?: number; lt?: number; lte?: number };
      riverCrossingCount?: { gt?: number; gte?: number; lt?: number; lte?: number };
      riverDensityScore?: { gt?: number; gte?: number; lt?: number; lte?: number };
    };
    mountains?: {
      inMountain?: boolean;
      mountainElevationAvg?: { gt?: number; gte?: number; lt?: number; lte?: number };
      terrainComplexity?: { gt?: number; gte?: number; lt?: number; lte?: number };
      hasMountainPass?: boolean;
    };
    roads?: {
      nearRoad?: boolean;
      roadDensityScore?: { gt?: number; gte?: number; lt?: number; lte?: number };
      hasMountainPass?: boolean;
    };
    coastlines?: {
      nearCoastline?: boolean;
      isCoastalArea?: boolean;
    };
    pois?: {
      hasHarbour?: boolean;
      hasEVCharger?: boolean;
      hasFerryTerminal?: boolean;
      supplyDensity?: { gt?: number; gte?: number; lt?: number; lte?: number };
      hasCheckpoint?: boolean;
      safety?: {
        hasHospital?: boolean;
        hasPolice?: boolean;
      };
      supply?: {
        hasFuel?: boolean;
        hasSupermarket?: boolean;
      };
    };
    altitude_m?: { gt?: number; gte?: number; lt?: number; lte?: number };
    fuelDensity?: { gt?: number; gte?: number; lt?: number; lte?: number };
    checkpointCount?: { gt?: number; gte?: number; lt?: number; lte?: number };
    mountainPassCount?: { gt?: number; gte?: number; lt?: number; lte?: number };
    oxygenStationCount?: { gt?: number; gte?: number; lt?: number; lte?: number };
    latitude?: { gt?: number; gte?: number; lt?: number; lte?: number };
    longitude?: { gt?: number; gte?: number; lt?: number; lte?: number };
  };
}

export interface Task {
  title: LocalizedString;
  dueOffsetDays?: number; // 相对出发日期的偏移天数（负数表示提前）
  tags?: string[];
}

/**
 * 用户问题类型
 */
export type QuestionType = 
  | 'yes_no'           // 是/否问题
  | 'multiple_choice'   // 多选题
  | 'single_choice'    // 单选题
  | 'text'             // 文本输入
  | 'number'           // 数字输入
  | 'date'             // 日期输入
  | 'rating';          // 评分（1-5等）

/**
 * 用户问题的选项（用于选择题）
 */
export interface QuestionOption {
  value: string;              // 选项值
  label: LocalizedString;    // 选项标签
  description?: LocalizedString; // 选项描述（可选）
}

/**
 * 用户问题定义
 */
export interface UserQuestion {
  id: string;                    // 问题唯一标识
  type: QuestionType;            // 问题类型
  question: LocalizedString;     // 问题文本
  description?: LocalizedString; // 问题描述（可选）
  required?: boolean;            // 是否必填（默认 true）
  options?: QuestionOption[];    // 选项（用于选择题）
  placeholder?: LocalizedString; // 占位符（用于文本/数字输入）
  validation?: {
    min?: number;                // 最小值（用于数字/日期）
    max?: number;                // 最大值（用于数字/日期）
    pattern?: string;             // 正则表达式（用于文本）
    message?: LocalizedString;    // 验证失败消息
  };
}

/**
 * 基于用户回答的决策分支
 */
export interface DecisionBranch {
  condition: {
    questionId: string;          // 问题ID
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
    value: any;                   // 比较值
  };
  then: {
    level?: ActionLevel;          // 如果满足条件，调整的级别（可选）
    message?: LocalizedString;    // 如果满足条件，显示的消息（可选）
    tasks?: Task[];               // 如果满足条件，添加的任务（可选）
    blockTrip?: boolean;          // 是否阻止行程（默认 false）
    additionalQuestions?: UserQuestion[]; // 如果满足条件，继续问的问题（可选）
  };
}

/**
 * 问题分组（用于简化用户决策流程）
 */
export interface QuestionGroup {
  id: string;                      // 分组唯一标识
  title: LocalizedString;          // 分组标题
  description?: LocalizedString;   // 分组描述（可选）
  questionIds: string[];           // 该分组包含的问题 ID 列表
  order?: number;                  // 分组显示顺序（可选，默认按定义顺序）
}

/**
 * 用户决策配置
 * 定义需要问用户的问题以及基于回答的决策逻辑
 */
export interface UserDecision {
  questions: UserQuestion[];      // 需要问用户的问题列表
  groups?: QuestionGroup[];         // 问题分组（可选，用于简化用户决策流程）
  branches?: DecisionBranch[];      // 基于用户回答的决策分支（可选）
  defaultBranch?: {               // 默认分支（当没有匹配的分支时使用）
    level?: ActionLevel;
    message?: LocalizedString;
    tasks?: Task[];
    blockTrip?: boolean;
  };
  // 向后兼容：如果提供了 askUser，会自动转换为 UserQuestion
  askUser?: LocalizedString[];    // 向后兼容：简单问题列表
}

export interface Action {
  level: ActionLevel;
  message: LocalizedString;
  tasks?: Task[];
  askUser?: LocalizedString[]; // 向后兼容：需要用户提供的信息（简单格式）
  /**
   * 用户决策配置（新格式）
   * 如果提供了 userDecision，将优先使用它，而不是 askUser
   */
  userDecision?: UserDecision; // 结构化的用户问题和决策逻辑
}

export interface Rule {
  id: string;
  category: ReadinessCategory;
  severity: RuleSeverity;
  
  // 🆕 前端文档兼容字段
  title?: LocalizedString;                 // 规则标题（可选）
  description?: LocalizedString;           // 规则描述（可选）
  message?: string | LocalizedString;      // 规则消息（可选，根级别，兼容前端文档）
  seasons?: SeasonType[];                  // 适用季节（可选，根级别，兼容前端文档）
  required?: boolean;                      // 是否必填（可选）
  tasks?: Task[];                          // 任务列表（可选，根级别，兼容前端文档）
  
  appliesTo?: {
    seasons?: SeasonType[];                 // 保留原有字段（向后兼容）
    activities?: string[];
    travelerTags?: string[];
  };
  when?: Condition;  // 可选：如果规则总是触发，可以没有 when 条件
  then: Action;
  evidence?: Evidence[];
  notes?: LocalizedString;
  
  // 🆕 用户决策（前端文档兼容）
  userDecision?: UserDecision;            // 用户决策配置（可选，根级别，兼容前端文档）
}

export interface Checklist {
  id: string;
  category: ReadinessCategory;
  
  // 🆕 前端文档兼容字段
  title?: LocalizedString;                 // 清单标题（可选）
  description?: LocalizedString;           // 清单描述（可选）
  required?: boolean;                      // 是否必填（可选）
  priority?: number;                       // 优先级（可选，数字越大优先级越高）
  checklistCategory?: ChecklistCategory;   // 清单分类（可选，前端文档的 ChecklistCategory）
  
  appliesToSeasons?: SeasonType[];
  items: LocalizedString[];
}

export interface Hazard {
  type: HazardType;
  severity: RuleSeverity;
  summary: LocalizedString;
  mitigations: LocalizedString[];
  
  // 🆕 前端文档兼容字段
  zoneId?: string;                         // 区域ID（可选）
  level?: HazardLevel;                     // 危险等级（可选，前端文档的 HazardLevel）
  seasons?: SeasonType[];                  // 适用季节（可选）
  metadata?: {                             // 元数据（可选，前端文档兼容）
    description?: LocalizedString;         // 描述（可选，与 summary 重复，但保留以兼容前端）
    schedule?: string;                     // 时间表（可选）
    affectedAreas?: string[];              // 受影响区域（可选）
    precautions?: LocalizedString[];       // 预防措施（可选，与 mitigations 重复，但保留以兼容前端）
    [key: string]: unknown;                 // 其他元数据字段
  };
}

/**
 * 打包清单模板和指南（可选）
 * 可以引用全局模板，或为特定目的地定制
 */
export interface PackingTemplateData {
  /**
   * 打包清单模板
   * 包含季节性快速清单、用户类型模板、打包顺序步骤等
   */
  packingTemplate?: {
    version?: string;
    lastUpdated?: string; // ISO datetime
    data: any; // PackingChecklistTemplate 数据
  };
  
  /**
   * 打包指南
   * 包含分层穿衣法、鞋类指南、打包技巧等
   */
  packingGuide?: {
    version?: string;
    lastUpdated?: string; // ISO datetime
    data: any; // PackingGuide 数据
  };
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
  /**
   * 打包模板和指南（可选）
   * 如果未提供，系统会使用全局默认模板
   */
  packing?: PackingTemplateData;
}

