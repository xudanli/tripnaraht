// src/agent/assistants/trip-planner/interfaces/trip-planner.interface.ts

import type { DecisionContextV0 } from '../../../../trips/reality-kernel/decision-context.types';

/**
 * 行程规划智能助手接口定义
 * 
 * 定位：已创建行程的智能规划助手
 * 前提：行程已通过自然语言创建接口创建完成（目的地、日期、预算已确定）
 * 
 * 核心能力：
 * 1. 行程优化师 - 调整 POI 顺序、替换景点、优化节奏
 * 2. 行程细化师 - 安排每日具体活动、餐厅、交通
 * 3. 行程顾问 - 回答问题、给建议、风险提示
 * 4. 执行助手 - 预订提醒、行前准备、实时调整
 */

/**
 * 用户意图类型
 */
export type TripPlannerIntent =
  // 优化类
  | 'OPTIMIZE_ROUTE'       // 优化路线顺序
  | 'REPLACE_POI'          // 替换某个景点
  | 'ADJUST_PACE'          // 调整节奏（太紧/太松）
  | 'REBALANCE_DAYS'       // 重新平衡各天安排
  
  // 细化类
  | 'ADD_ACTIVITY'         // 添加活动
  | 'ARRANGE_MEALS'        // 安排餐厅
  | 'PLAN_TRANSPORT'       // 规划交通
  | 'FILL_FREE_TIME'       // 填充空闲时间
  | 'ADD_HOTEL'            // 添加住宿
  
  // 咨询类
  | 'ASK_QUESTION'         // 问问题（天气、签证、费用等）
  | 'GET_SUGGESTION'       // 获取建议
  | 'CHECK_FEASIBILITY'    // 检查可行性（这天会不会太赶？）
  | 'COMPARE_OPTIONS'      // 对比选项
  
  // 执行类
  | 'CREATE_CHECKLIST'     // 创建行前清单
  | 'SET_REMINDER'         // 设置提醒
  | 'EXPORT_ITINERARY'     // 导出行程
  | 'SHARE_TRIP'           // 分享行程
  
  // 通用
  | 'GENERAL_CHAT'         // 通用对话
  | 'SHOW_OVERVIEW'        // 显示行程概览
  | 'UNDO_CHANGE';         // 撤销修改

/**
 * 对话阶段
 */
export type TripPlannerPhase =
  | 'OVERVIEW'             // 概览阶段：展示行程整体情况
  | 'OPTIMIZING'           // 优化阶段：调整行程结构
  | 'DETAILING'            // 细化阶段：填充具体内容
  | 'CONSULTING'           // 咨询阶段：回答问题
  | 'EXECUTING'            // 执行阶段：行前准备
  | 'CONFIRMING';          // 确认阶段：确认修改

/**
 * 行程上下文（从数据库加载）
 */
export interface TripContext {
  tripId: string;
  destination: string;
  destinationName?: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  totalBudget: number;
  remainingBudget?: number;
  
  // 旅行者信息
  travelers: {
    adults: number;
    children: number;
    elderly: number;
    childrenAges?: number[];
  };
  
  // 行程配置
  pacingConfig: {
    level: 'RELAXED' | 'STANDARD' | 'TIGHT';
    maxDailyActivities: number;
  };
  
  // 每日安排
  days: TripDayContext[];
  
  // 偏好和约束
  preferences?: {
    style?: string;
    interests?: string[];
    pace?: string;
    mustPlaces?: string[];
    avoidPlaces?: string[];
  };
  
  // 状态
  status: string;
  completeness: number; // 0-100 完成度
}

/**
 * 每日行程上下文
 */
export interface TripDayContext {
  dayId: string;
  dayNumber: number;
  date: string;
  theme?: string;
  city?: string;
  
  // 当日活动
  items: TripItemContext[];
  
  // 当日统计
  stats: {
    itemCount: number;
    totalDuration: number; // 分钟
    totalCost: number;
    freeTime: number; // 空闲时间（分钟）
    travelTime: number; // 交通时间（分钟）
  };
  
  // 问题/风险
  issues?: string[];
}

/**
 * 行程项目上下文
 */
export interface TripItemContext {
  itemId: string;
  type: 'POI' | 'RESTAURANT' | 'TRANSPORT' | 'HOTEL' | 'ACTIVITY' | 'FREE_TIME';
  name: string;
  nameCN?: string;
  startTime?: string;
  endTime?: string;
  duration?: number; // 分钟
  cost?: number;
  address?: string;
  notes?: string;
  
  // 🆕 位置信息（用于距离计算）
  location?: {
    lat: number;
    lng: number;
  };
  cityName?: string; // 所在城市
  
  // POI 特有
  poiId?: string;
  category?: string;
  rating?: number;
  
  // 交通特有
  transportType?: string;
  from?: string;
  to?: string;
}

/**
 * 会话状态
 */
export interface TripPlannerState {
  sessionId: string;
  tripId: string;
  userId: string;
  phase: TripPlannerPhase;

  /** Latest Reality OS binding for this session — gates RAG when enforcement is on */
  decisionContext?: DecisionContextV0;
  
  // 行程上下文（缓存）
  tripContext: TripContext;
  
  // 对话历史
  messages: TripPlannerMessage[];
  
  // 待确认的修改
  pendingChanges?: PendingChange[];
  
  // 时间戳
  createdAt: string;
  updatedAt: string;
}

/**
 * 对话消息
 */
export interface TripPlannerMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent?: TripPlannerIntent;
  
  // 富文本内容
  richContent?: {
    type: 'day_overview' | 'poi_card' | 'comparison' | 'checklist' | 'map';
    data: any;
  };
  
  // 快捷操作
  quickActions?: QuickAction[];
  
  timestamp: string;
}

/**
 * 快捷操作
 */
export interface QuickAction {
  id: string;
  label: string;
  action: string;
  params?: Record<string, any>;
  style?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
}

/**
 * 待确认的修改
 */
export interface PendingChange {
  id: string;
  type: 'ADD' | 'UPDATE' | 'DELETE' | 'REORDER';
  target: 'TRIP' | 'DAY' | 'ITEM';
  targetId?: string;
  dayNumber?: number;  // 目标天数
  description: string;
  status?: 'pending' | 'applied' | 'cancelled';
  before?: any;
  after?: any;
  impact?: {
    budgetDelta?: number;
    timeDelta?: number;
    riskLevel?: 'low' | 'medium' | 'high';
  };
}

/**
 * 请求参数
 */
export interface TripPlannerRequest {
  sessionId?: string;
  tripId: string;
  userId: string;
  message: string;

  /** Optional — when REALITY_ENFORCEMENT / RAG_REALITY_POLICY_ENFORCE binds soft-world retrieval */
  decisionContext?: DecisionContextV0;
  
  // 可选：指定操作的目标
  targetDay?: number;
  targetItemId?: string;
  
  // 可选：附加上下文
  context?: {
    currentLocation?: { lat: number; lng: number };
    currentTime?: string;
    selectedItems?: string[];
    // 🚀 Phase 1 优化：快捷操作上下文
    action?: string;
    category?: string;
    destination?: string;
    sources?: any[];
  };
  
  // 🆕 澄清选择数据（用户点击澄清按钮后携带）
  clarificationData?: {
    selectedAction?: 'QUERY' | 'ADD_TO_ITINERARY' | 'REPLACE' | 'REMOVE' | 'MODIFY';
    params?: {
      dayNumber?: number;
      timeSlot?: { start: string; end: string };
      targetItemId?: string;
      gapId?: string;
    };
  };
}

/**
 * 响应格式
 */
export interface TripPlannerResponse {
  // 会话信息
  sessionId: string;
  
  // 文本回复
  message: string;
  
  // 当前阶段
  phase: TripPlannerPhase;
  
  // 识别的意图
  intent: TripPlannerIntent;
  
  // 富文本内容（可选）
  richContent?: {
    type: 'day_overview' | 'poi_card' | 'poi_list' | 'comparison' | 'checklist' | 'map' | 'timeline' | 'guardian_panel' | 'gap_highlight' | 'rag_sources' | 'evidence_chain' | 'related_questions';
    data: any;
  };
  
  // 快捷操作建议
  quickActions?: QuickAction[];
  
  // 待确认的修改（如果有）
  pendingChanges?: PendingChange[];
  
  // 🎭 三人格洞察（渐进式显现，仅在需要时出现）
  personaInsights?: PersonaInsight[];
  
  // 🎭 三人格详细评估（可选，前端可展开查看）
  guardianEvaluation?: GuardianEvaluation;
  
  // 行程更新摘要（如果有修改）
  tripUpdate?: {
    changed: boolean;
    summary?: string;
    affectedDays?: number[];
  };
  
  // 引导问题（如果需要更多信息）
  followUp?: {
    question: string;
    options?: string[];
    type: 'single' | 'multiple' | 'text' | 'confirm';
  };
  
  // 责任边界声明（当用户忽略安全警告时）
  disclaimer?: Disclaimer;
  
  // 🚀 Phase 1 优化：RAG 结果结构化展示
  ragResults?: {
    sources: Array<{
      id: string;
      title: string;
      content: string;
      source?: string;
      score: number;
      relevance: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    evidenceChain?: Array<{
      step: number;
      description: string;
      sourceId: string;
    }>;
  };

  // 元数据
  meta?: {
    processingTime?: number;
    guardiansInvoked?: GuardianPersona[]; // 哪些守护者参与了评估
    uncertainty?: IntentUncertainty; // 意图不确定性类型
    detectedGaps?: ResponseItineraryGap[]; // 检测到的行程缺口
    source?: 'RAG' | 'RAG+LLM' | 'LLM'; // 🚀 Phase 1 优化：回答来源
    ragConfidence?: number; // 🚀 Phase 1 优化：RAG 置信度
    /** Soft-world RAG blocked by Reality policy (e.g. missing decisionContext) */
    realityPolicyBlocked?: boolean;
  };
}

/**
 * 意图不确定性类型（响应用）
 */
export type IntentUncertainty = 
  | 'CLEAR'              // 意图明确
  | 'AMBIGUOUS_ACTION'   // 动作不明确：查询 vs 添加
  | 'AMBIGUOUS_TARGET'   // 目标不明确：加到哪里
  | 'AMBIGUOUS_NEED'     // 需求不明确
  | 'MULTIPLE_INTENTS';  // 多重意图

/**
 * 行程缺口（响应用，简化版）
 */
export interface ResponseItineraryGap {
  id: string;
  type: 'MEAL' | 'HOTEL' | 'TRANSPORT' | 'ACTIVITY' | 'FREE_TIME';
  dayNumber: number;
  timeSlot: {
    start: string;
    end: string;
  };
  description: string;
  severity: 'CRITICAL' | 'SUGGESTED' | 'OPTIONAL';
  context?: {
    beforeItem?: string;
    afterItem?: string;
    nearbyLocation?: string;
  };
}

/**
 * 助手人格配置
 */
export interface TripPlannerPersona {
  name: string;
  role: string;
  tone: string;
  expertise: string[];
  greetingTemplate: string;
}

/**
 * 三人格类型
 */
export type GuardianPersona = 'Abu' | 'DrDre' | 'Neptune';

/**
 * 人格洞察
 */
export interface PersonaInsight {
  persona: GuardianPersona;
  emoji: string;
  name: string;
  role: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  message: string;
  suggestion?: string;
  details?: string[];
}

/**
 * 三人格评估结果
 */
export interface GuardianEvaluation {
  // Abu 的安全评估
  abu?: {
    passed: boolean;
    issues: string[];
    risks: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high';
      description: string;
    }>;
  };
  
  // Dr.Dre 的节奏评估
  drDre?: {
    sustainable: boolean;
    fatigueLevel: number; // 0-100
    issues: string[];
    paceRecommendation: 'slow_down' | 'ok' | 'can_add_more';
  };
  
  // Neptune 的替代方案
  neptune?: {
    hasAlternatives: boolean;
    alternatives: Array<{
      original: string;
      replacement: string;
      reason: string;
      impact: string;
    }>;
  };
}

/**
 * 三人格配置
 */
export const GUARDIAN_PERSONAS: Record<GuardianPersona, {
  emoji: string;
  name: string;
  nameCN: string;
  role: string;
  roleCN: string;
  tone: string;
  catchphrase: string;
}> = {
  Abu: {
    emoji: '🐻‍❄️',
    name: 'Abu',
    nameCN: '阿布',
    role: 'Safety Guardian',
    roleCN: '安全守护者',
    tone: '严肃但温柔',
    catchphrase: '我负责：这条路，真的能走吗？',
  },
  DrDre: {
    emoji: '🐕',
    name: 'Dr.Dre',
    nameCN: '德雷医生',
    role: 'Rhythm Designer',
    roleCN: '节奏设计师',
    tone: '体谅、稳定、贴心',
    catchphrase: '别太累，我会让每一天刚刚好。',
  },
  Neptune: {
    emoji: '🦦',
    name: 'Neptune',
    nameCN: '海王星',
    role: 'Space Magician',
    roleCN: '空间魔法师',
    tone: '聪明、灵活、共情',
    catchphrase: '如果行不通，我会给你一个刚刚好的替代。',
  },
};

/**
 * 人格显示优先级（数字越小优先级越高）
 * 安全 > 体力 > 替代方案
 */
export const GUARDIAN_PRIORITY: Record<GuardianPersona, number> = {
  Abu: 1,     // 安全最高优先
  DrDre: 2,   // 体力次之
  Neptune: 3, // 替代方案最后
};

/**
 * 责任边界声明
 */
export interface Disclaimer {
  type: 'user_override_safety' | 'data_incomplete' | 'llm_fallback' | 'general';
  message: string;
  timestamp: string;
  relatedPersona?: GuardianPersona;
  userAction?: 'ignored' | 'acknowledged' | 'overridden';
}

// ==================== 埋点事件定义 ====================

/**
 * 三人格埋点事件类型
 */
export type GuardianTrackingEventType =
  | 'guardian.invoked'           // 人格被触发
  | 'guardian.insight_shown'     // 洞察展示给用户
  | 'guardian.suggestion_accepted' // 用户接受建议
  | 'guardian.suggestion_rejected' // 用户拒绝建议
  | 'guardian.warning_ignored'   // 用户忽略警告
  | 'guardian.evaluation_timeout' // 评估超时
  | 'guardian.fallback_used';    // 使用降级策略

/**
 * 埋点事件基础结构
 */
export interface GuardianTrackingEvent {
  eventType: GuardianTrackingEventType;
  timestamp: string;
  sessionId: string;
  tripId: string;
  userId: string;
  traceId?: string;
}

/**
 * 人格触发事件
 */
export interface GuardianInvokedEvent extends GuardianTrackingEvent {
  eventType: 'guardian.invoked';
  data: {
    guardiansInvoked: GuardianPersona[];
    triggerReason: 'keyword' | 'threshold' | 'intent' | 'all_guardians';
    intent: TripPlannerIntent;
    message: string; // 脱敏后的用户消息
  };
}

/**
 * 洞察展示事件
 */
export interface GuardianInsightShownEvent extends GuardianTrackingEvent {
  eventType: 'guardian.insight_shown';
  data: {
    persona: GuardianPersona;
    severity: 'info' | 'warning' | 'error' | 'success';
    insightId: string;
    messagePreview: string; // 前50字符
  };
}

/**
 * 建议接受事件
 */
export interface GuardianSuggestionAcceptedEvent extends GuardianTrackingEvent {
  eventType: 'guardian.suggestion_accepted';
  data: {
    persona: GuardianPersona;
    suggestionType: 'route_change' | 'poi_replace' | 'pace_adjust' | 'time_change';
    changeId: string;
    acceptedAfterMs: number; // 从展示到接受的时间
  };
}

/**
 * 建议拒绝事件
 */
export interface GuardianSuggestionRejectedEvent extends GuardianTrackingEvent {
  eventType: 'guardian.suggestion_rejected';
  data: {
    persona: GuardianPersona;
    suggestionType: string;
    reason?: string;
    rejectedAfterMs: number;
  };
}

/**
 * 警告忽略事件（重要：用于风险追踪）
 */
export interface GuardianWarningIgnoredEvent extends GuardianTrackingEvent {
  eventType: 'guardian.warning_ignored';
  data: {
    persona: GuardianPersona;
    severity: 'warning' | 'error';
    warningType: string;
    ignoredMessage: string;
    disclaimerShown: boolean;
  };
}

/**
 * 所有埋点事件联合类型
 */
export type GuardianTrackingEventUnion =
  | GuardianInvokedEvent
  | GuardianInsightShownEvent
  | GuardianSuggestionAcceptedEvent
  | GuardianSuggestionRejectedEvent
  | GuardianWarningIgnoredEvent;

/**
 * 默认人格：专业旅行规划师
 */
export const DEFAULT_PLANNER_PERSONA: TripPlannerPersona = {
  name: 'NARA',
  role: '您的专属旅行规划师',
  tone: '专业、热情、贴心',
  expertise: ['行程优化', '目的地知识', '预算管理', '风险评估'],
  greetingTemplate: `您好！我是 {{name}}，{{role}}。我看到您已经创建了去 {{destination}} 的 {{days}} 天行程。

我可以帮您优化行程、细化安排、解答疑问或准备行前清单。有什么需要我帮您的吗？`,
};
