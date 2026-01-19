// src/itinerary-optimization/interfaces/executability-enhancement.interface.ts

/**
 * POI类型（影响排队时间）
 */
export type POIType = 
  | 'ATTRACTION'      // 景点
  | 'RESTAURANT'      // 餐厅
  | 'MUSEUM'          // 博物馆
  | 'THEME_PARK'      // 主题公园
  | 'SHOPPING'        // 购物
  | 'ENTERTAINMENT'   // 娱乐
  | 'OTHER';          // 其他

/**
 * 时间段类型（影响排队时间）
 */
export type TimePeriod = 
  | 'PEAK'            // 高峰期
  | 'OFF_PEAK'        // 非高峰期
  | 'SHOULDER';       // 过渡期

/**
 * 排队时间模型结果
 */
export interface QueueTimeEstimate {
  poiId: string;
  poiName: string;
  poiType: POIType;
  baseWaitTime: number;        // 基础等待时间（分钟）
  estimatedWaitTime: number;   // 估算等待时间（分钟）
  peakMultiplier: number;      // 高峰期倍数
  seasonMultiplier: number;    // 季节倍数
  dayOfWeekMultiplier: number; // 星期倍数
  timeOfDayMultiplier: number; // 时段倍数
  confidence: number;           // 置信度（0-1）
  factors: {
    isPeakHour: boolean;
    isPeakSeason: boolean;
    isWeekend: boolean;
    isHoliday: boolean;
  };
  recommendations?: string[];  // 建议（如避开高峰期）
}

/**
 * 排队时间模型配置
 */
export interface QueueTimeModelConfig {
  poiId: string;
  poiType: POIType;
  baseWaitTime: number;        // 基础等待时间（分钟）
  peakMultiplier?: number;     // 高峰期倍数，默认1.5
  seasonMultiplier?: number;   // 季节倍数，默认1.2
  dayOfWeekMultiplier?: Record<number, number>; // 星期倍数（0=周日，6=周六）
  timeOfDayMultiplier?: Record<string, number>;  // 时段倍数（如 '10:00-12:00': 1.3）
  popularityScore?: number;    // 热门程度（0-1）
}

/**
 * 交通模式
 */
export type TransportMode = 
  | 'WALK'            // 步行
  | 'SUBWAY'          // 地铁
  | 'BUS'             // 公交
  | 'TAXI'            // 出租车
  | 'DRIVE'           // 自驾
  | 'BIKE';           // 自行车

/**
 * 动态交通时间结果
 */
export interface DynamicTransportTimeEstimate {
  from: { lat: number; lng: number; name?: string };
  to: { lat: number; lng: number; name?: string };
  mode: TransportMode;
  baseTime: number;            // 基础时间（分钟）
  estimatedTime: number;       // 估算时间（分钟）
  congestionFactor: number;    // 拥堵系数（0-1，1表示最拥堵）
  weatherFactor: number;        // 天气系数（0-1，1表示天气最差）
  bufferTime: number;          // 安全缓冲时间（分钟）
  confidence: number;          // 置信度（0-1）
  factors: {
    isRushHour: boolean;
    weatherCondition?: 'CLEAR' | 'RAIN' | 'SNOW' | 'FOG' | 'STORM';
    roadCondition?: 'NORMAL' | 'CONGESTED' | 'SEVERELY_CONGESTED';
    isHoliday: boolean;
  };
  recommendations?: string[];  // 建议（如避开高峰期）
}

/**
 * 动态交通时间配置
 */
export interface DynamicTransportTimeConfig {
  baseTime: number;            // 基础时间（分钟）
  mode: TransportMode;
  congestionFactor?: number;   // 拥堵系数（0-1），默认0.3
  weatherFactor?: number;      // 天气系数（0-1），默认0.1
  bufferPercentage?: number;   // 缓冲百分比，默认20%
  rushHourMultiplier?: number; // 高峰期倍数，默认1.5
}

/**
 * 用户体力状态
 */
export interface UserFatigueState {
  currentHP: number;           // 当前体力值（0-100）
  maxHP: number;               // 最大体力值（默认100）
  accumulatedFatigue: number;  // 累计疲劳度（0-100）
  timeSinceLastRest: number;   // 距离上次休息的时间（分钟）
  activityIntensity: 'LOW' | 'MEDIUM' | 'HIGH'; // 活动强度
  userProfile?: {
    fitnessLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    age?: number;
    hasHealthIssues?: boolean;
  };
}

/**
 * 休息时间模型结果
 */
export interface RestTimeRecommendation {
  recommendedRestTime: number;  // 推荐休息时间（分钟）
  minimumRestTime: number;      // 最小休息时间（分钟）
  optimalRestTime: number;      // 最优休息时间（分钟）
  hpRecovery: number;           // 体力恢复值（0-100）
  fatigueReduction: number;     // 疲劳减少值（0-100）
  confidence: number;            // 置信度（0-1）
  factors: {
    currentFatigueLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    timeSinceLastRest: number;
    activityIntensity: 'LOW' | 'MEDIUM' | 'HIGH';
    userFitnessLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  restType: 'SHORT_BREAK' | 'MEAL_BREAK' | 'LONG_REST' | 'OVERNIGHT';
  recommendations?: string[];   // 建议（如"建议休息30分钟"）
}

/**
 * 休息时间模型配置
 */
export interface RestTimeModelConfig {
  baseRestTime: number;         // 基础休息时间（分钟），默认15
  shortBreakTime: number;       // 短休息时间（分钟），默认10
  mealBreakTime: number;        // 用餐休息时间（分钟），默认60
  longRestTime: number;         // 长休息时间（分钟），默认120
  hpRecoveryRate: number;       // 体力恢复速率（每分钟恢复的HP），默认0.5
  fatigueReductionRate: number; // 疲劳减少速率（每分钟减少的疲劳度），默认0.3
}

/**
 * 增强的可执行性验证结果
 */
export interface EnhancedExecutabilityResult {
  itineraryId?: string;
  dayNumber?: number;
  items: Array<{
    itemId: string;
    itemName: string;
    queueTimeEstimate?: QueueTimeEstimate;
    transportTimeEstimate?: DynamicTransportTimeEstimate;
    restTimeRecommendation?: RestTimeRecommendation;
    totalEstimatedTime: number;  // 总估算时间（包括排队、交通、休息）
    feasibility: 'FEASIBLE' | 'MARGINAL' | 'INFEASIBLE';
    issues: string[];
    suggestions: string[];
  }>;
  overallFeasibility: 'FEASIBLE' | 'MARGINAL' | 'INFEASIBLE';
  overallIssues: string[];
  overallSuggestions: string[];
  timeBufferAnalysis: {
    totalPlannedTime: number;
    totalEstimatedTime: number;
    bufferTime: number;
    bufferPercentage: number;
    isSufficient: boolean;
  };
}
