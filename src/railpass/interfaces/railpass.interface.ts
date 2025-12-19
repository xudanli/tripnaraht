// src/railpass/interfaces/railpass.interface.ts

/**
 * RailPass 模块核心接口定义
 */

export type ISODate = string; // '2026-01-02'
export type ISOTime = string; // '08:30'
export type ISODatetime = string; // '2026-01-02T08:30:00+00:00'

/**
 * Pass 系列（按居住地）
 */
export type PassFamily = 'EURAIL' | 'INTERRAIL';

/**
 * Pass 类型
 */
export type PassType = 'GLOBAL' | 'ONE_COUNTRY';

/**
 * Pass 有效期类型
 */
export type ValidityType = 'FLEXI' | 'CONTINUOUS';

/**
 * Pass 等级
 */
export type PassClass = 'FIRST' | 'SECOND';

/**
 * Pass 载体类型
 */
export type PassMedium = 'MOBILE' | 'PAPER';

/**
 * 订座风险等级
 */
export type ReservationRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * 订座状态
 */
export type ReservationTaskStatus = 
  | 'NEEDED'      // 需要订座
  | 'PLANNED'     // 已计划（已加入任务列表）
  | 'BOOKED'      // 已订座
  | 'FAILED'      // 订座失败
  | 'FALLBACK_APPLIED'; // 已应用备用方案

/**
 * 订座渠道
 */
export type ReservationChannel = 
  | 'EURail_Interrail_Platform'  // Eurail/Interrail 官方订座平台
  | 'Operator_Direct'             // 运营商官网/车站
  | 'Third_Party';                // 第三方平台

/**
 * 强制订座原因代码
 */
export type MandatoryReservationReason = 
  | 'NIGHT_TRAIN'       // 夜车强制订座
  | 'HIGH_SPEED'        // 高铁多数需订座
  | 'INTERNATIONAL'     // 国际列车
  | 'OPERATOR_POLICY';  // 运营商政策

/**
 * RailPass Profile（挂到 User 或 Trip）
 */
export interface RailPassProfile {
  /** 用户居住国（ISO 3166-1 alpha-2） */
  residencyCountry: string;
  
  /** Pass 系列 */
  passFamily: PassFamily;
  
  /** Pass 类型 */
  passType: PassType;
  
  /** 有效期类型 */
  validityType: ValidityType;
  
  /** Travel Days 总数（Flexi 才有） */
  travelDaysTotal?: number;
  
  /** 居住国出境使用次数（Interrail 用） */
  homeCountryOutboundUsed: number;
  
  /** 居住国入境使用次数（Interrail 用） */
  homeCountryInboundUsed: number;
  
  /** Pass 等级 */
  class: PassClass;
  
  /** 载体类型 */
  mobileOrPaper: PassMedium;
  
  /** Pass 有效期开始日期 */
  validityStartDate: ISODate;
  
  /** Pass 有效期结束日期 */
  validityEndDate: ISODate;
}

/**
 * Rail Segment（作为一种 Transport Plan）
 */
export interface RailSegment {
  /** Segment ID */
  segmentId: string;
  
  /** 起点 Place ID */
  fromPlaceId: number;
  
  /** 终点 Place ID */
  toPlaceId: number;
  
  /** 起点国家代码 */
  fromCountryCode: string;
  
  /** 终点国家代码 */
  toCountryCode: string;
  
  /** 出发时间窗 */
  departureTimeWindow?: {
    earliest: ISODatetime;
    latest: ISODatetime;
  };
  
  /** 最晚到达时间 */
  arrivalDeadline?: ISODatetime;
  
  /** 运营商提示（可空） */
  operatorHint?: string;
  
  /** 是否夜车 */
  isNightTrain: boolean;
  
  /** 是否高铁 */
  isHighSpeed: boolean;
  
  /** 是否跨国 */
  isInternational: boolean;
  
  /** 预计 API 时间（分钟） */
  t_api?: number;
  
  /** 鲁棒时间（分钟） */
  t_robust?: number;
  
  /** 出发日期（ISODate） */
  departureDate: ISODate;
  
  /** 是否跨午夜（用于 Travel Day 计算） */
  crossesMidnight?: boolean;
}

/**
 * Reservation Requirement（订座需求评估结果）
 */
export interface ReservationRequirement {
  /** 是否必须订座 */
  required: boolean;
  
  /** 强制原因代码（如果 required=true） */
  mandatoryReasonCode?: MandatoryReservationReason;
  
  /** 费用预估（最小/最大，EUR） */
  feeEstimate?: {
    min: number;
    max: number;
    currency: string;
  };
  
  /** 配额风险等级 */
  quotaRisk: ReservationRiskLevel;
  
  /** 订座渠道列表 */
  bookingChannels: ReservationChannel[];
  
  /** 风险因素说明 */
  riskFactors?: string[];
}

/**
 * Reservation Task（订座任务）
 */
export interface ReservationTask {
  /** Task ID */
  taskId: string;
  
  /** 关联的 Segment ID */
  segmentId: string;
  
  /** 状态 */
  status: ReservationTaskStatus;
  
  /** 订座引用号（如果已订到） */
  bookingRef?: string;
  
  /** 实际费用（EUR） */
  cost?: number;
  
  /** 失败原因（如果 status=FAILED） */
  failReason?: string;
  
  /** 备用方案 ID（如果 status=FALLBACK_APPLIED） */
  fallbackPlanId?: string;
  
  /** 创建时间 */
  createdAt: ISODatetime;
  
  /** 更新时间 */
  updatedAt: ISODatetime;
  
  /** 关联的 Travel Day（用于 Travel Day 消耗计算） */
  travelDay?: ISODate;
}

/**
 * Fallback Option（备用方案）
 */
export interface FallbackOption {
  /** Option ID */
  optionId: string;
  
  /** 类型 */
  type: 
    | 'SWITCH_TO_SLOW_TRAIN'      // 改乘不需订座的慢车
    | 'CHANGE_ROUTE'               // 换路线
    | 'SHIFT_TIME'                 // 换时段
    | 'SPLIT_SEGMENT'              // 拆段
    | 'REPLACE_WITH_FLIGHT'        // 换飞机
    | 'REPLACE_WITH_BUS';          // 换巴士
  
  /** 描述 */
  description: string;
  
  /** 新的 Segment（如果适用） */
  alternativeSegment?: Partial<RailSegment>;
  
  /** 预计时间变化（分钟） */
  timeDeltaMinutes?: number;
  
  /** 预计费用变化（EUR） */
  costDeltaEur?: number;
}

/**
 * Eligibility Check Result（合规检查结果）
 */
export interface EligibilityResult {
  /** 是否合规 */
  eligible: boolean;
  
  /** 推荐的 Pass Family */
  recommendedPassFamily: PassFamily;
  
  /** 合规约束说明 */
  constraints: string[];
  
  /** 警告信息 */
  warnings?: string[];
  
  /** 居住国限制说明（Interrail 特有） */
  homeCountryRules?: {
    outboundAllowed: boolean;
    inboundAllowed: boolean;
    outboundUsed: number;
    inboundUsed: number;
    maxAllowed: number; // 通常为 1 each
    explanation: string;
  };
}

/**
 * Pass Recommendation（Pass 推荐结果）
 */
export interface PassRecommendation {
  /** 推荐的 Pass 配置 */
  recommendedProfile: RailPassProfile;
  
  /** 备选配置列表 */
  alternatives?: Array<{
    profile: RailPassProfile;
    reason: string;
  }>;
  
  /** Travel Day 模拟结果（Flexi） */
  travelDaySimulation?: {
    estimatedDaysUsed: number;
    daysByDate: Record<ISODate, {
      consumed: boolean;
      segments: string[]; // segment IDs
    }>;
  };
  
  /** 说明 */
  explanation: string;
}

/**
 * Reservation Plan Result（订座计划结果）
 */
export interface ReservationPlanResult {
  /** 订座任务列表 */
  reservationTasks: ReservationTask[];
  
  /** 违规列表 */
  violations: Array<{
    code: string;
    severity: 'error' | 'warning';
    message: string;
    segmentId?: string;
    details?: any;
  }>;
  
  /** 备用方案列表 */
  fallbackOptions: FallbackOption[];
  
  /** 总费用预估 */
  totalFeeEstimate?: {
    min: number;
    max: number;
    currency: string;
  };
  
  /** 风险评估 */
  overallRisk: ReservationRiskLevel;
}

/**
 * Travel Day Calculation Result（Travel Day 计算结果）
 */
export interface TravelDayCalculationResult {
  /** 总消耗的 Travel Days */
  totalDaysUsed: number;
  
  /** 每日明细 */
  daysByDate: Record<ISODate, {
    consumed: boolean;
    segments: string[]; // segment IDs that consume this day
    crossesMidnight?: boolean;
    explanation: string;
  }>;
  
  /** 剩余 Travel Days（Flexi） */
  remainingDays?: number;
  
  /** 违规（如果超限） */
  violations?: Array<{
    date: ISODate;
    message: string;
  }>;
}

/**
 * Compliance Validation Result（合规验证结果）
 */
export interface ComplianceValidationResult {
  /** 是否合规 */
  valid: boolean;
  
  /** 违规列表 */
  violations: Array<{
    code: string;
    severity: 'error' | 'warning';
    message: string;
    segmentId?: string;
    details?: any;
  }>;
  
  /** 警告列表 */
  warnings: Array<{
    code: string;
    severity: 'error' | 'warning';
    message: string;
    segmentId?: string;
    details?: any;
  }>;
}
