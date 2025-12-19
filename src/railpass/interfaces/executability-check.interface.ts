// src/railpass/interfaces/executability-check.interface.ts

/**
 * 可执行性检查结果接口
 * 用于 B2、B3 卡片 UI
 */

export type ISODate = string;

/**
 * Segment 覆盖状态
 */
export type SegmentCoverageStatus = 
  | 'COVERED'      // ✅ Pass 覆盖
  | 'NOT_COVERED'  // ❌ Pass 不覆盖
  | 'UNKNOWN';     // ⚠️ 未知（需要确认）

/**
 * 风险等级
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * 段级卡片信息（B3）
 */
export interface SegmentCardInfo {
  /** Segment ID */
  segmentId: string;
  
  /** 出发时间 */
  departureTime: string; // ISO datetime or time
  
  /** 出发地点 */
  fromPlace: {
    name: string;
    countryCode: string;
  };
  
  /** 到达地点 */
  toPlace: {
    name: string;
    countryCode: string;
  };
  
  /** 覆盖状态 */
  coverage: SegmentCoverageStatus;
  
  /** Travel Day 信息（Flexi 才有） */
  travelDayInfo?: {
    consumed: boolean;
    daysConsumed: number; // 消耗的天数（1 或 2）
    explanation: string; // 例如："Flexi 消耗 1 天（当天乘车）"
  };
  
  /** 订座信息 */
  reservationInfo: {
    status: 'REQUIRED' | 'OPTIONAL' | 'UNKNOWN' | 'NOT_REQUIRED';
    mandatoryReason?: string; // 例如："夜车强制订座"
    feeEstimate?: {
      min: number;
      max: number;
      currency: string;
    };
    riskLevel: RiskLevel;
    suggestions: string[]; // 建议列表
  };
  
  /** 风险等级 */
  riskLevel: RiskLevel;
  
  /** 关键建议（1-2 条） */
  keySuggestions: string[];
  
  /** 折叠详情（第三层信息） */
  details?: {
    /** 规则解释 */
    ruleExplanation?: string[];
    
    /** 风险详情 */
    riskDetails?: string[];
    
    /** Mobile Pass 特殊提醒 */
    mobilePassReminders?: string[];
    
    /** 旺季/热门时段提醒 */
    peakSeasonWarnings?: string[];
  };
  
  /** 违规信息（如果有） */
  violations?: Array<{
    code: string;
    severity: 'error' | 'warning';
    message: string;
  }>;
}

/**
 * 可执行性检查总览（B2）
 */
export interface ExecutabilityCheckOverview {
  /** 可执行段数 */
  executableCount: number;
  
  /** 需确认段数 */
  needConfirmationCount: number;
  
  /** 高风险段数 */
  highRiskCount: number;
  
  /** 预计消耗 Travel Day（Flexi 才有） */
  estimatedTravelDaysUsed?: {
    total: number;
    remaining?: number;
    explanation: string;
  };
  
  /** 段级卡片列表 */
  segments: SegmentCardInfo[];
  
  /** 汇总建议 */
  summarySuggestions: string[];
  
  /** 是否有未完成的 Pass Profile 信息 */
  hasIncompleteProfile: boolean;
  
  /** 缺失的关键信息 */
  missingInfo?: string[];
}

/**
 * 高风险提示（B4）
 */
export interface HighRiskAlert {
  /** 类型 */
  type: 
    | 'HOME_COUNTRY_LIMIT'        // Interrail 本国段限制
    | 'TRAVEL_DAY_OVERUSE'         // Flexi Travel Day 超限
    | 'NIGHT_TRAIN_2_DAYS'         // 夜车可能扣 2 天
    | 'RESERVATION_MANDATORY'      // 必须订座但未订
    | 'RESERVATION_QUOTA_HIGH'     // 订座配额紧张
    | 'PASS_VALIDITY_EXCEEDED'     // Pass 有效期超限
    | 'MOBILE_PASS_OFFLINE_RISK';  // Mobile Pass 离线风险
  
  /** 受影响 Segment IDs */
  affectedSegmentIds: string[];
  
  /** 解释原因 */
  explanation: string;
  
  /** 替代方案 */
  alternatives: Array<{
    id: string;
    title: string;
    description: string;
    impact?: {
      timeDelta?: number; // 时间变化（分钟）
      costDelta?: number; // 费用变化（EUR）
      travelDaysDelta?: number; // Travel Day 变化
    };
  }>;
  
  /** 严重程度 */
  severity: 'error' | 'warning';
}

/**
 * 改方案请求（B6）
 */
export interface RegeneratePlanRequest {
  /** Trip ID */
  tripId: string;
  
  /** 策略 */
  strategy: 
    | 'MORE_STABLE'        // 更稳：避开必须订座的车
    | 'MORE_ECONOMICAL'    // 更省：减少 Travel Day 消耗
    | 'MORE_AFFORDABLE'    // 更便宜：对比直购票 vs 通票+订座（P2）
    | 'CUSTOM';
  
  /** 自定义参数（如果 strategy 为 CUSTOM） */
  customParams?: {
    avoidMandatoryReservations?: boolean;
    minimizeTravelDays?: boolean;
    maxReservationFee?: number;
  };
}
