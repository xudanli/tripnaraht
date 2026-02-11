// src/route-directions/interfaces/route-direction.interface.ts

/**
 * 硬约束（违反就必须修复/降级）
 */
export interface HardConstraints {
  maxDailyRapidAscentM?: number; // 每日快速爬升上限（米）- 高海拔上升速度
  maxSlopePct?: number; // 最大坡度（%）- 徒步/骑行
  requiresPermit?: boolean; // 是否需要许可
  requiresGuide?: boolean; // 是否需要向导
  rapidAscentForbidden?: boolean; // 是否禁止快速爬升
  [key: string]: any;
}

/**
 * 软约束（尽量满足，超了就加惩罚）
 */
export interface SoftConstraints {
  maxDailyAscentM?: number; // 每日最大爬升（米）
  maxElevationM?: number; // 最高海拔（米）
  bufferTimeMin?: number; // 缓冲时间（分钟）
  [key: string]: any;
}

/**
 * 目标函数权重（影响排序）
 */
export interface ObjectiveWeights {
  preferViewpoints?: number; // 偏好观景点权重
  preferHotSpring?: number; // 偏好温泉权重
  preferPhotography?: number; // 偏好摄影权重
  [key: string]: number; // 其他偏好权重
}

/**
 * 路线方向约束接口（兼容旧版本）
 */
export interface RouteConstraints {
  // 硬约束
  hard?: HardConstraints;
  // 软约束
  soft?: SoftConstraints;
  // 目标函数权重
  objectives?: ObjectiveWeights;
  // 兼容旧版本字段
  maxElevationM?: number;
  maxDailyAscentM?: number;
  maxSlope?: number;
  requiresPermit?: boolean;
  requiresGuide?: boolean;
  rapidAscentForbidden?: boolean;
  [key: string]: any;
}

/**
 * 合规规则
 */
export interface ComplianceRules {
  requiresPermit?: boolean; // 是否需要许可
  requiresGuide?: boolean; // 是否需要向导
  restrictedAreas?: string[]; // 限制区域提醒
  permitInfo?: {
    name: string;
    link?: string;
    cost?: number;
  };
  [key: string]: any;
}

/**
 * 风险画像接口
 */
export interface RiskProfile {
  altitudeSickness?: boolean; // 高反风险
  roadClosure?: boolean; // 封路风险
  ferryDependent?: boolean; // 是否依赖渡轮
  weatherWindow?: boolean; // 是否有天气窗口限制
  weatherWindowMonths?: number[]; // 天气窗口月份
  [key: string]: any; // 允许其他风险字段
}

/**
 * 季节性信息接口
 */
export interface Seasonality {
  bestMonths?: number[]; // 最佳月份（1-12）
  avoidMonths?: number[]; // 禁忌月份（1-12）
  [key: string]: any; // 允许其他季节性字段
}

/**
 * 代表性 POI 接口
 */
export interface SignaturePois {
  types?: string[]; // POI 类型列表
  examples?: string[]; // POI UUID 示例
  weights?: Record<string, number>; // POI 类型权重（用于排序）
  [key: string]: any; // 允许其他字段
}

/**
 * 行程骨架接口
 */
export interface ItinerarySkeleton {
  dayThemes?: string[]; // 每天主题
  dailyPace?: string; // 每日节奏（LIGHT/MODERATE/INTENSE）
  restDaysRequired?: number[]; // 必须休息的日期（从1开始）
  [key: string]: any; // 允许其他字段
}

/**
 * 失败画像（Failure Profile）
 * 
 * PART 1.1: RouteDirection Pack 必须有「失败画像」
 * 不是只有 best case，而是记录典型失败场景
 */
/**
 * 失败原因类型
 * 基础类型 + 扩展类型（支持各种特殊场景）
 */
export type FailureReasonType = 
  // 基础类型
  | 'fatigue' | 'weather' | 'altitude' | 'slope' | 'distance' | 'logistics'
  // 技术类
  | 'technical_difficulty' | 'rock_quality' | 'rappelling_accident' | 'glacier_crossing_failure'
  // 环境类
  | 'river_crossing_failure' | 'vehicle_failure' | 'weather_closure' | 'road_closure'
  | 'extreme_weather' | 'flash_flooding' | 'ice_conditions' | 'ice_calving' | 'avalanche'
  // 身体类
  | 'altitude_sickness' | 'acute_mountain_sickness' | 'altitude_exhaustion' | 'altitude_pulmonary_edema'
  | 'exhaustion' | 'dehydration' | 'injury' | 'seasickness'
  // 野外类
  | 'polar_bear_encounter' | 'snow_bridge_collapse' | 'peat_bog_accident'
  | 'cliff_accident' | 'sneaker_wave_accident' | 'sea_wave_incident'
  // 装备/后勤类
  | 'equipment_failure' | 'fuel_shortage' | 'ticket_unavailable' | 'medical_emergency'
  // 通用扩展
  | string; // 允许自定义原因

/**
 * 救援难度类型
 */
export type RescueDifficultyType = 'EXTREME' | 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface FailureProfile {
  /** 常见失败日期（从1开始，如 [3,4] 表示第3-4天） */
  commonFailureDays: number[];
  /** 典型失败原因 */
  typicalFailureReason: FailureReasonType[];
  /** 救援难度 */
  rescueDifficulty: RescueDifficultyType;
  /** 失败场景描述（可选） */
  failureScenarios?: Array<{
    day: number;
    reason: string;
    typicalUserProfile?: string; // 如 "低海拔耐受度用户"
    mitigation?: string; // 缓解措施
  }>;
}

/**
 * 路线叙事（Narrative）
 * 
 * PART 1.2: 每条 RD 必须绑定「国家叙事句」
 * 不是 marketing，是系统叙事锚点
 */
export interface RouteNarrative {
  /** 内部叙事（用于决策解释） */
  internal: string; // 如 "这条路线假设用户愿意为风景牺牲城市便利"
  /** 用户面向叙事（用于用户教育） */
  userFacing: string; // 如 "这是一条以自然为主线的纵贯路线，而不是城市打卡"
  /** 路线哲学（可选，用于深度解释） */
  philosophy?: string;
}

/**
 * 路线哲学（可选，用于深度约束）
 * 
 * 可以是字符串（向后兼容）或 RoutePhilosophy 对象
 */
export type RoutePhilosophyField = string | import('../../trips/decision/models/route-philosophy.model').RoutePhilosophy;

/**
 * 路线方向完整接口
 */
export interface RouteDirectionData {
  id?: string | number; // 路线ID（可选，用于数据库记录）
  countryCode: string;
  name: string;
  nameCN: string;
  nameEN?: string;
  description?: string;
  tags: string[];
  regions?: string[];
  entryHubs?: string[];
  seasonality?: Seasonality;
  constraints?: RouteConstraints;
  riskProfile?: RiskProfile;
  signaturePois?: SignaturePois;
  itinerarySkeleton?: ItinerarySkeleton;
  complianceRules?: ComplianceRules; // 合规规则
  metadata?: Record<string, any>;
  // 运营字段（可选，可在 metadata 中）
  version?: string; // 版本号
  status?: 'draft' | 'active' | 'deprecated'; // 状态
  // 扩展字段（在 metadata.extensions 中存储）
  extensions?: import('./route-direction-extensions.interface').RouteDirectionExtensions;
  // PART 1: 世界级 RouteDirection Pack 增强
  /** 失败画像（用于 Neptune 修复优先级） */
  failureProfile?: FailureProfile;
  /** 路线叙事（用于决策解释和用户教育） */
  narrative?: RouteNarrative;
  /** 不适合的用户画像（用于防止误用） */
  antiPersona?: string[]; // 如 ["时间极度紧张", "不愿拆天", "低风险偏好"]
  /** 路线哲学（第一性原理：不可背叛的规则 vs 可调整的自由度） */
  philosophy?: RoutePhilosophyField;
}

/**
 * POI优先级枚举
 * - MUST_SEE: 必看（核心景点，不可跳过）
 * - HIGH: 高优先级（强烈推荐，尽量安排）
 * - MEDIUM: 中优先级（推荐，时间允许则安排）
 * - LOW: 低优先级（可选，有空闲时间可考虑）
 * - OPTIONAL: 可选（备选方案，用于填充空闲时间）
 */
export type PoiPriority = 'MUST_SEE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL';

/**
 * POI优先级数值映射（用于排序和计算）
 */
export const POI_PRIORITY_SCORE: Record<PoiPriority, number> = {
  MUST_SEE: 100,
  HIGH: 80,
  MEDIUM: 60,
  LOW: 40,
  OPTIONAL: 20,
};

/**
 * 日计划中的POI信息
 */
export interface DayPlanPoi {
  /** POI ID（可选，如果已关联到数据库中的Place） */
  id?: number;
  /** POI UUID（可选，如果已关联到数据库中的Place） */
  uuid?: string;
  /** POI 中文名称（必填） */
  nameCN: string;
  /** POI 英文名称（可选） */
  nameEN?: string;
  /** POI 类别（可选） */
  category?: string;
  /** POI 地址（可选） */
  address?: string;
  /** POI 评分（可选，0-5） */
  rating?: number;
  /** POI 描述（可选） */
  description?: string;
  /** 是否为必游POI（默认false，向后兼容，建议使用priority代替） */
  required?: boolean;
  /** 
   * POI优先级（新字段，推荐使用）
   * - MUST_SEE: 必看景点，核心体验
   * - HIGH: 高优先级，强烈推荐
   * - MEDIUM: 中优先级，推荐
   * - LOW: 低优先级，可选
   * - OPTIONAL: 备选方案
   * 默认: MEDIUM
   */
  priority?: PoiPriority;
  /** 🆕 开始时间（ISO 8601 格式，可选。如果提供，创建行程时将使用此时间） */
  startTime?: string;
  /** 🆕 结束时间（ISO 8601 格式，可选。如果提供，创建行程时将使用此时间） */
  endTime?: string;
  /** 预计停留时间（分钟，可选。如果未提供 startTime/endTime，将使用此字段计算时间） */
  durationMinutes?: number;
  /** 
   * 优先级原因说明（可选）
   * 解释为什么这个POI有这个优先级，便于运营理解
   */
  priorityReason?: string;
  /** 其他元数据（可选） */
  metadata?: Record<string, any>;
}

/**
 * 每日计划接口
 */
export interface DayPlan {
  day: number; // 第几天（从1开始）
  theme?: string; // 主题
  maxIntensity?: string; // 强度上限（LIGHT/MODERATE/INTENSE）
  maxElevationM?: number; // 最大海拔（米）
  /** 必须节点（Place UUID 或名称，向后兼容） */
  requiredNodes?: string[];
  /** 可选活动类型 */
  optionalActivities?: string[];
  /** 具体的POI列表（新增，用于维护具体的POI信息） */
  pois?: DayPlanPoi[];
  [key: string]: any; // 允许其他字段
}

/**
 * 路线模板接口
 */
export interface RouteTemplateData {
  routeDirectionId: number;
  durationDays: number;
  name?: string;
  nameCN?: string;
  nameEN?: string;
  dayPlans: DayPlan[];
  defaultPacePreference?: 'RELAX' | 'BALANCED' | 'CHALLENGE';
  metadata?: Record<string, any>;
}

