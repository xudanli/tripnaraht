// src/itinerary-items/interfaces/validation.interface.ts

/**
 * 校验严重程度
 */
export enum ValidationSeverity {
  /** 阻止操作 */
  ERROR = 'error',
  /** 警告但允许（需 forceCreate） */
  WARNING = 'warning',
  /** 仅提示 */
  INFO = 'info'
}

/**
 * 校验代码
 */
export enum ValidationCode {
  /** 时间重叠 */
  TIME_OVERLAP = 'TIME_OVERLAP',
  /** 交通时间不足 */
  INSUFFICIENT_TRAVEL_TIME = 'INSUFFICIENT_TRAVEL_TIME',
  /** 缓冲时间不足 */
  SHORT_BUFFER = 'SHORT_BUFFER',
  /** 营业时间冲突 */
  BUSINESS_HOURS_VIOLATION = 'BUSINESS_HOURS_VIOLATION',
  /** 级联影响 */
  CASCADE_IMPACT = 'CASCADE_IMPACT',
  /** 结束时间早于开始时间 */
  INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
  /** 未找到 */
  NOT_FOUND = 'NOT_FOUND'
}

/**
 * 校验建议
 */
export interface ValidationSuggestion {
  /** 建议动作 */
  action: 'ADJUST_TIME' | 'CHANGE_TRANSPORT' | 'REORDER' | 'REMOVE' | 'ADD_BUFFER';
  /** 描述 */
  description: string;
  /** 建议的新值 */
  suggestedValue?: {
    startTime?: string;
    endTime?: string;
    transportMode?: string;
  };
  /** 预计改善效果 */
  estimatedImprovement?: string;
}

/**
 * 单项校验结果
 */
export interface ValidationResult {
  /** 是否通过 */
  valid: boolean;
  /** 严重程度 */
  severity: ValidationSeverity;
  /** 校验代码 */
  code: ValidationCode;
  /** 错误消息 */
  message: string;
  /** 详细信息 */
  details: Record<string, any>;
  /** 建议 */
  suggestions?: ValidationSuggestion[];
}

/**
 * 交通信息
 */
export interface TravelInfo {
  /** 起点地点名称 */
  fromPlace?: string;
  /** 终点地点名称 */
  toPlace?: string;
  /** 直线距离（km） */
  straightDistance: number;
  /** 道路距离（km，可能为空） */
  roadDistance?: number;
  /** 预计时长（分钟） */
  estimatedDuration: number;
  /** 推荐交通方式 */
  recommendedTransport: 'WALKING' | 'DRIVING' | 'TRANSIT';
  /** 可用时间（分钟） */
  availableTime: number;
}

/**
 * 聚合校验结果
 */
export interface AggregatedValidationResult {
  /** 是否可以创建（无 ERROR 级别） */
  canProceed: boolean;
  /** 是否需要强制确认（有 WARNING 级别） */
  requiresConfirmation: boolean;
  /** ERROR 级别结果 */
  errors: ValidationResult[];
  /** WARNING 级别结果 */
  warnings: ValidationResult[];
  /** INFO 级别结果 */
  infos: ValidationResult[];
  /** 交通信息（如果计算过） */
  travelInfo?: TravelInfo;
}

/**
 * 级联影响项
 */
export interface CascadeImpactItem {
  /** 行程项 ID */
  id: string;
  /** 活动名称 */
  name: string;
  /** 原时间（兼容旧格式） */
  originalTime: string;
  /** 建议时间（兼容旧格式） */
  suggestedTime: string;
  /** 延迟分钟数 */
  delayMinutes: number;
  /** 🆕 原时间（结构化） */
  originalTimeRange?: {
    start: string;  // HH:mm
    end: string;    // HH:mm
  };
  /** 🆕 调整后时间（结构化） */
  adjustedTimeRange?: {
    start: string;  // HH:mm
    end: string;    // HH:mm
  };
  /** 🆕 时间变化描述 */
  timeDelta?: string;  // "+2小时30分钟"
}

/**
 * 级联影响
 */
export interface CascadeImpact {
  /** 受影响数量 */
  affectedCount: number;
  /** 受影响的行程项详情 */
  affectedItems: CascadeImpactItem[];
  /** 是否已自动调整 */
  autoAdjusted: boolean;
  /** 🆕 是否会自动调整（用于前端显示提示） */
  autoAdjust?: boolean;
  /** 🆕 调整说明 */
  adjustmentSummary?: string;
}

/**
 * 校验上下文中的行程项
 */
export interface ContextItem {
  id: string;
  placeId?: number;
  startTime: Date;
  endTime: Date;
  type: string;
  place?: {
    id: number;
    name: string;
    coordinates?: { lat: number; lng: number };
  };
}

/**
 * 校验上下文
 */
export interface ValidationContext {
  /** 行程日 ID */
  tripDayId: string;
  /** 行程日日期 */
  tripDayDate: Date;
  /** 新行程项数据 */
  newItem: {
    placeId?: number;
    startTime: Date;
    endTime: Date;
    type: string;
  };
  /** 新行程项的地点信息 */
  newItemPlace?: {
    id: number;
    name: string;
    coordinates?: { lat: number; lng: number };
    metadata?: any;
  };
  /** 同日现有行程项（按时间排序） */
  existingItems: ContextItem[];
  /** 前序行程项（新项前一个） */
  previousItem?: ContextItem;
  /** 后序行程项（新项后一个） */
  nextItem?: ContextItem;
}

/**
 * 校验器接口
 */
export interface IValidator {
  /**
   * 执行校验
   */
  validate(context: ValidationContext): Promise<ValidationResult | null>;
  
  /**
   * 获取校验代码
   */
  getCode(): ValidationCode;
  
  /**
   * 获取默认严重程度
   */
  getSeverity(): ValidationSeverity;
}

/**
 * 批量校验项
 */
export interface BatchValidationItem {
  day: string;
  itemIds: string[];
  type: string;
  message: string;
  severity: ValidationSeverity;
}

/**
 * 批量校验结果
 */
export interface BatchValidationResult {
  valid: boolean;
  tripId: string;
  errors: BatchValidationItem[];
  warnings: BatchValidationItem[];
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}
