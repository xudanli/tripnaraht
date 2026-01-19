// src/agent/assistants/trip-planner/interfaces/intent-uncertainty.interface.ts

import { TripPlannerIntent } from './trip-planner.interface';

/**
 * 行程缺口类型
 */
export type ItineraryGapType = 'MEAL' | 'ACTIVITY' | 'TRANSPORT' | 'HOTEL' | 'FREE_TIME';

/**
 * 缺口严重程度
 */
export type GapSeverity = 'CRITICAL' | 'SUGGESTED' | 'OPTIONAL';

/**
 * 行程缺口
 */
export interface ItineraryGap {
  id: string;
  type: ItineraryGapType;
  dayNumber: number;
  date: string;
  timeSlot: {
    start: string;  // HH:mm
    end: string;    // HH:mm
  };
  severity: GapSeverity;
  description: string;
  
  // 缺口上下文
  context: {
    // 前后活动
    beforeActivity?: { name: string; endTime: string };
    afterActivity?: { name: string; startTime: string };
    // 当天总体情况
    dayTheme?: string;
    dayCity?: string;
    // 已有同类型项目数
    existingCount: number;
  };
  
  // 建议
  suggestions?: string[];
}

/**
 * 意图不确定性类型
 */
export enum IntentUncertainty {
  /** 意图明确，可直接执行 */
  CLEAR = 'CLEAR',
  
  /** 动作不明确：查询 vs 添加 */
  AMBIGUOUS_ACTION = 'AMBIGUOUS_ACTION',
  
  /** 目标不明确：加到哪里 */
  AMBIGUOUS_TARGET = 'AMBIGUOUS_TARGET',
  
  /** 需求不明确：为什么要这个 */
  AMBIGUOUS_NEED = 'AMBIGUOUS_NEED',
  
  /** 多重意图：用户想做多件事 */
  MULTIPLE_INTENTS = 'MULTIPLE_INTENTS',
}

/**
 * 解析后的动作类型
 */
export type ResolvedAction = 
  | 'QUERY'           // 纯查询，不修改行程
  | 'ADD_TO_ITINERARY' // 添加到行程
  | 'REPLACE'         // 替换现有项目
  | 'REMOVE'          // 删除项目
  | 'MODIFY'          // 修改项目
  | 'EXECUTE';        // 直接执行（明确意图）

/**
 * 澄清选项
 */
export interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
  action: ResolvedAction;
  params?: {
    dayNumber?: number;
    timeSlot?: { start: string; end: string };
    targetItemId?: string;
    gapId?: string;
  };
  style?: 'primary' | 'secondary';
}

/**
 * 澄清请求
 */
export interface ClarificationRequest {
  question: string;
  context?: string;  // 为什么需要澄清
  options: ClarificationOption[];
  allowFreeText?: boolean;  // 是否允许用户自由输入
}

/**
 * 上下文发现结果
 */
export interface ContextDiscovery {
  /** 是否发现相关缺口 */
  foundGap: boolean;
  
  /** 匹配的缺口 */
  gap?: ItineraryGap;
  
  /** 匹配置信度 0-1 */
  confidence: number;
  
  /** 发现描述 */
  suggestion: string;
  
  /** 是否应该主动提示用户 */
  shouldPrompt: boolean;
}

/**
 * 意图消歧结果
 */
export interface DisambiguationResult {
  /** 不确定性类型 */
  uncertainty: IntentUncertainty;
  
  /** 置信度 0-1 */
  confidence: number;
  
  /** 原始意图 */
  originalIntent: TripPlannerIntent;
  
  /** 解析后的意图（如果明确） */
  resolvedIntent?: {
    action: ResolvedAction;
    intent?: TripPlannerIntent;  // 当 action 为 EXECUTE 时，附带原始意图
    target?: {
      dayNumber: number;
      timeSlot?: { start: string; end: string };
      itemId?: string;
    };
  };
  
  /** 需要澄清时的问题 */
  clarificationNeeded?: ClarificationRequest;
  
  /** 上下文发现 */
  contextDiscovery?: ContextDiscovery;
  
  /** 诊断信息（用于调试） */
  diagnostics?: {
    detectedKeywords: string[];
    explicitAction: 'QUERY' | 'ADD' | null;
    relatedGaps: ItineraryGap[];
    analysisPath: string[];
  };
}

/**
 * 缺口分析配置
 */
export interface GapAnalysisConfig {
  /** 是否检测用餐缺口 */
  detectMealGaps: boolean;
  
  /** 是否检测活动缺口 */
  detectActivityGaps: boolean;
  
  /** 是否检测交通缺口 */
  detectTransportGaps: boolean;
  
  /** 是否检测住宿缺口 */
  detectHotelGaps: boolean;
  
  /** 用餐时间窗配置 */
  mealWindows: Array<{
    name: string;
    start: string;
    end: string;
    required: boolean;
  }>;
  
  /** 最小空闲时间（分钟）才算缺口 */
  minFreeTimeForGap: number;
  
  /** 活动之间的最小间隔（分钟） */
  minActivityBuffer: number;
}

/**
 * 默认缺口分析配置
 */
export const DEFAULT_GAP_ANALYSIS_CONFIG: GapAnalysisConfig = {
  detectMealGaps: true,
  detectActivityGaps: true,
  detectTransportGaps: true,
  detectHotelGaps: true,
  
  mealWindows: [
    { name: '早餐', start: '07:00', end: '09:30', required: false },
    { name: '午餐', start: '11:30', end: '14:00', required: true },
    { name: '晚餐', start: '17:30', end: '20:30', required: true },
  ],
  
  minFreeTimeForGap: 120, // 2小时以上算空闲
  minActivityBuffer: 30,   // 活动之间至少30分钟
};

/**
 * 关键词到缺口类型的映射
 */
export const KEYWORD_TO_GAP_TYPE: Record<string, ItineraryGapType> = {
  // 用餐
  '餐厅': 'MEAL',
  '吃饭': 'MEAL',
  '美食': 'MEAL',
  '午餐': 'MEAL',
  '晚餐': 'MEAL',
  '早餐': 'MEAL',
  '吃什么': 'MEAL',
  '好吃': 'MEAL',
  
  // 住宿
  '酒店': 'HOTEL',
  '住宿': 'HOTEL',
  '住哪': 'HOTEL',
  '民宿': 'HOTEL',
  '宾馆': 'HOTEL',
  
  // 交通
  '交通': 'TRANSPORT',
  '怎么去': 'TRANSPORT',
  '坐什么': 'TRANSPORT',
  '地铁': 'TRANSPORT',
  '公交': 'TRANSPORT',
  '打车': 'TRANSPORT',
  
  // 活动
  '景点': 'ACTIVITY',
  '玩什么': 'ACTIVITY',
  '去哪': 'ACTIVITY',
  '逛': 'ACTIVITY',
  '看': 'ACTIVITY',
};

/**
 * 明确查询的关键词
 */
export const QUERY_KEYWORDS = [
  '有什么',
  '推荐',
  '介绍',
  '哪里有',
  '什么好吃',
  '哪家好',
  '有哪些',
  '了解',
  '告诉我',
  '说说',
];

/**
 * 明确添加的关键词
 */
export const ADD_KEYWORDS = [
  '加到',
  '安排',
  '帮我订',
  '放到',
  '加入行程',
  '加进去',
  '添加',
  '规划',
  '帮我加',
  '帮我安排',
];
