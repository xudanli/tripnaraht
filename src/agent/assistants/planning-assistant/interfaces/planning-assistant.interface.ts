// src/agent/assistants/planning-assistant/interfaces/planning-assistant.interface.ts

/**
 * 规划助手智能体接口定义
 * 
 * 定位：引导式对话 + 智能推荐 + 方案生成
 * 核心价值：帮用户"想清楚"去哪里、怎么玩
 */

/**
 * 对话意图类型
 */
export type PlanningIntent =
  | 'EXPLORE'           // 探索阶段：用户还不确定目的地
  | 'RECOMMEND'         // 推荐请求：请求目的地/活动推荐
  | 'COLLECT_INFO'      // 信息收集：收集用户偏好
  | 'GENERATE_PLAN'     // 生成方案：创建行程方案
  | 'COMPARE'           // 方案对比：对比多个方案
  | 'ADJUST'            // 调整方案：修改现有方案
  | 'CONFIRM'           // 确认方案：确定最终方案
  | 'QUESTION'          // 问题咨询：旅行相关问题
  | 'GENERAL';          // 通用对话

/**
 * 对话阶段
 */
export type ConversationPhase =
  | 'INITIAL'           // 初始阶段：打招呼
  | 'EXPLORING'         // 探索阶段：收集需求
  | 'RECOMMENDING'      // 推荐阶段：推荐目的地
  | 'PLANNING'          // 规划阶段：生成方案
  | 'COMPARING'         // 对比阶段：对比方案
  | 'ADJUSTING'         // 调整阶段：调整方案
  | 'CONFIRMING'        // 确认阶段：最终确认
  | 'COMPLETED'         // 完成阶段：方案已定
  | 'CLARIFYING_HOTEL_DATES'   // 澄清阶段：追问酒店入住/退房日期
  | 'CLARIFYING_RAIL_DATES'    // 澄清阶段：追问铁路出行日期/时间
  | 'CLARIFYING_FLIGHT_ORIGIN'; // 澄清阶段：追问航班出发地

/**
 * 用户偏好（渐进式收集）
 */
export interface UserPreferences {
  // 基础信息
  travelers?: {
    adults?: number;
    children?: number;
    seniors?: number;
    childrenAges?: number[];
  };
  
  // 时间
  dateRange?: {
    startDate?: string;
    endDate?: string;
    flexible?: boolean;
    preferredMonths?: number[];
  };
  
  // 预算
  budget?: {
    total?: number;
    currency?: string;
    level?: 'low' | 'medium' | 'high' | 'luxury';
    flexible?: boolean;
  };
  
  // 目的地偏好
  destination?: {
    continents?: string[];
    countries?: string[];
    cities?: string[];
    exclude?: string[];
    type?: ('beach' | 'city' | 'nature' | 'culture' | 'adventure')[];
  };
  
  // 活动偏好
  activities?: {
    preferred?: string[];
    avoid?: string[];
    pacePreference?: 'relaxed' | 'moderate' | 'intensive';
  };
  
  // 住宿偏好
  accommodation?: {
    type?: ('hotel' | 'resort' | 'hostel' | 'apartment' | 'villa')[];
    starRating?: number;
    style?: string[];
  };
  
  // 特殊需求
  specialNeeds?: {
    accessibility?: boolean;
    dietaryRestrictions?: string[];
    medicalConditions?: string[];
    other?: string[];
  };
}

/**
 * 目的地推荐
 */
export interface DestinationRecommendation {
  id: string;
  countryCode: string;
  name: string;
  nameCN: string;
  description: string;
  descriptionCN: string;
  highlights: string[];
  highlightsCN: string[];
  matchScore: number;
  matchReasons: string[];
  matchReasonsCN: string[];
  estimatedBudget: {
    min: number;
    max: number;
    currency: string;
  };
  bestSeasons: string[];
  imageUrl?: string;
  tags: string[];
}

/**
 * 方案候选
 */
export interface PlanCandidate {
  id: string;
  name: string;
  nameCN: string;
  description: string;
  descriptionCN: string;
  destination: string;
  duration: number;
  highlights: string[];
  estimatedBudget: {
    total: number;
    breakdown: {
      flight: number;
      accommodation: number;
      activities: number;
      food: number;
      other: number;
    };
  };
  pace: 'relaxed' | 'moderate' | 'intensive';
  suitability: {
    score: number;
    reasons: string[];
  };
  warnings?: string[];
  skeleton?: any; // 详细行程骨架
}

/**
 * 待执行的酒店搜索（日期澄清后使用）
 */
export interface PendingHotelSearch {
  target: 'hotel' | 'accommodation' | 'airbnb';
  extractedParams: Record<string, any>;
}

/** 待执行的铁路搜索（日期澄清后使用） */
export interface PendingRailSearch {
  target: 'rail';
  extractedParams: { origin: string; destination: string; [k: string]: any };
}

/** 待执行的航班搜索（出发地澄清后使用） */
export interface PendingFlightSearch {
  target: 'flight';
  extractedParams: { origin?: string; destination: string; departureDate: string; [k: string]: any };
}

/**
 * 对话状态
 */
export interface PlanningConversationState {
  sessionId: string;
  userId?: string;
  phase: ConversationPhase;
  preferences: UserPreferences;
  recommendations?: DestinationRecommendation[];
  selectedDestination?: string;
  planCandidates?: PlanCandidate[];
  selectedPlanId?: string;
  confirmedTripId?: string;
  /** 待执行的酒店搜索（日期澄清阶段存储，用户补充日期后执行） */
  pendingHotelSearch?: PendingHotelSearch;
  /** 待执行的铁路搜索（日期澄清阶段存储，用户补充出行日期后执行） */
  pendingRailSearch?: PendingRailSearch;
  /** 待执行的航班搜索（出发地澄清阶段存储，用户补充出发地后执行） */
  pendingFlightSearch?: PendingFlightSearch;
  messageHistory: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/**
 * 对话消息
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent?: PlanningIntent;
  metadata?: Record<string, any>;
  timestamp: string;
}

/**
 * 助手响应
 */
export interface PlanningAssistantResponse {
  // 文本回复
  message: string;
  messageCN: string;
  
  // 当前阶段
  phase: ConversationPhase;
  
  // 引导问题（如果有）
  guidingQuestions?: {
    question: string;
    questionCN: string;
    options?: string[];
    optionsCN?: string[];
    type: 'single' | 'multiple' | 'text' | 'date' | 'number';
  }[];
  
  // 目的地推荐（推荐阶段）
  recommendations?: DestinationRecommendation[];
  
  // 方案候选（规划阶段）
  planCandidates?: PlanCandidate[];
  
  // 方案对比（对比阶段）
  comparison?: {
    dimensions: string[];
    candidates: {
      id: string;
      name: string;
      scores: Record<string, number>;
    }[];
    recommendation: string;
    recommendationCN: string;
  };
  
  // 确认的行程ID（确认阶段）
  confirmedTripId?: string;
  
  // 操作建议
  suggestedActions?: {
    action: string;
    label: string;
    labelCN: string;
  }[];
}

/**
 * 规划助手请求
 */
export interface PlanningAssistantRequest {
  sessionId: string;
  userId?: string;
  message: string;
  language?: 'en' | 'zh';
  /** 目标国家代码，用于过滤推荐 (e.g., 'IS' for Iceland, 'JP' for Japan) */
  countryCode?: string;
  context?: {
    currentLocation?: { lat: number; lng: number };
    timezone?: string;
  };
}
