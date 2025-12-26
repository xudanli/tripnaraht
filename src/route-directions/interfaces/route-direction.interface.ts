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
 * 路线方向完整接口
 */
export interface RouteDirectionData {
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
}

/**
 * 每日计划接口
 */
export interface DayPlan {
  day: number; // 第几天（从1开始）
  theme?: string; // 主题
  maxIntensity?: string; // 强度上限（LIGHT/MODERATE/INTENSE）
  maxElevationM?: number; // 最大海拔（米）
  requiredNodes?: string[]; // 必须节点（Place UUID 或名称）
  optionalActivities?: string[]; // 可选活动类型
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

