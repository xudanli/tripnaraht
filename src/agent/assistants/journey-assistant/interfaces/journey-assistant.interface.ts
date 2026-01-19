// src/agent/assistants/journey-assistant/interfaces/journey-assistant.interface.ts

/**
 * 行程助手智能体接口定义
 * 
 * 定位：主动关怀 + 实时应对 + 旅途陪伴
 * 核心价值：陪用户"走完"整个旅程
 */

/**
 * 行程阶段
 */
export type TripPhase =
  | 'PRE_TRIP'          // 出发前（提前1-7天）
  | 'DEPARTURE_DAY'     // 出发当天
  | 'ON_TRIP'           // 旅途中
  | 'RETURN_DAY'        // 返程当天
  | 'POST_TRIP';        // 旅行结束后

/**
 * 提醒类型
 */
export type ReminderType =
  | 'FLIGHT'            // 航班提醒
  | 'HOTEL'             // 酒店提醒
  | 'ACTIVITY'          // 活动提醒
  | 'TRANSPORT'         // 交通提醒
  | 'WEATHER'           // 天气提醒
  | 'SAFETY'            // 安全提醒
  | 'DOCUMENT'          // 证件提醒
  | 'PACKING'           // 打包提醒
  | 'BUDGET';           // 预算提醒

/**
 * 事件类型
 */
export type EventType =
  | 'FLIGHT_DELAY'      // 航班延误
  | 'FLIGHT_CANCEL'     // 航班取消
  | 'WEATHER_ALERT'     // 天气预警
  | 'ATTRACTION_CLOSED' // 景点关闭
  | 'ROAD_CLOSURE'      // 道路封闭
  | 'EMERGENCY'         // 紧急情况
  | 'SCHEDULE_CONFLICT' // 时间冲突
  | 'BUDGET_OVERRUN';   // 预算超支

/**
 * 问答意图
 */
export type JourneyIntent =
  | 'NEARBY_SEARCH'     // 附近搜索
  | 'SCHEDULE_QUERY'    // 行程查询
  | 'NAVIGATION'        // 导航请求
  | 'RECOMMENDATION'    // 推荐请求
  | 'EMERGENCY'         // 紧急求助
  | 'ADJUSTMENT'        // 行程调整
  | 'GENERAL';          // 通用对话

/**
 * 提醒
 */
export interface Reminder {
  id: string;
  type: ReminderType;
  title: string;
  titleCN: string;
  message: string;
  messageCN: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  scheduledAt: string;
  relatedItemId?: string;
  actionRequired?: boolean;
  actions?: {
    action: string;
    label: string;
    labelCN: string;
  }[];
}

/**
 * 事件
 */
export interface TripEvent {
  id: string;
  type: EventType;
  title: string;
  titleCN: string;
  description: string;
  descriptionCN: string;
  severity: 'info' | 'warning' | 'critical';
  occurredAt: string;
  affectedItems: string[];
  source?: string;
  metadata?: Record<string, any>;
}

/**
 * 应急方案
 */
export interface EmergencyOption {
  id: string;
  name: string;
  nameCN: string;
  description: string;
  descriptionCN: string;
  impact: {
    time: string;
    cost: string;
    experience: string;
  };
  impactCN: {
    time: string;
    cost: string;
    experience: string;
  };
  recommended: boolean;
  actions: {
    action: string;
    label: string;
    labelCN: string;
    autoExecutable: boolean;
  }[];
}

/**
 * 行程状态
 */
export interface JourneyState {
  tripId: string;
  userId: string;
  phase: TripPhase;
  currentDay: number;
  totalDays: number;
  currentDate: string;
  currentLocation?: {
    lat: number;
    lng: number;
    name?: string;
  };
  todaySchedule: ScheduleItem[];
  upcomingReminders: Reminder[];
  activeEvents: TripEvent[];
  pendingDecisions: EmergencyOption[][];
  stats: {
    completedActivities: number;
    totalActivities: number;
    spentBudget: number;
    totalBudget: number;
  };
  lastUpdated: string;
}

/**
 * 行程项
 */
export interface ScheduleItem {
  id: string;
  type: 'flight' | 'hotel' | 'activity' | 'transport' | 'meal' | 'rest';
  title: string;
  titleCN: string;
  startTime: string;
  endTime?: string;
  location?: {
    name: string;
    nameCN: string;
    lat: number;
    lng: number;
    address?: string;
  };
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled' | 'modified';
  notes?: string;
  notesCN?: string;
}

/**
 * 行程助手请求
 */
export interface JourneyAssistantRequest {
  tripId: string;
  userId: string;
  action: 'chat' | 'get_status' | 'get_reminders' | 'handle_event' | 'adjust_schedule';
  message?: string;
  language?: 'en' | 'zh';
  context?: {
    currentLocation?: { lat: number; lng: number };
    timezone?: string;
  };
  eventId?: string;
  selectedOptionId?: string;
  adjustmentParams?: {
    itemId: string;
    newTime?: string;
    cancel?: boolean;
    replace?: {
      type: string;
      details: any;
    };
  };
}

/**
 * 行程助手响应
 */
export interface JourneyAssistantResponse {
  // 文本回复
  message?: string;
  messageCN?: string;
  
  // 当前状态
  journeyState?: JourneyState;
  
  // 提醒列表
  reminders?: Reminder[];
  
  // 事件处理
  event?: TripEvent;
  options?: EmergencyOption[];
  
  // 调整结果
  adjustmentResult?: {
    success: boolean;
    message: string;
    messageCN: string;
    updatedSchedule?: ScheduleItem[];
  };
  
  // 搜索结果
  searchResults?: {
    type: string;
    items: any[];
  };
  
  // 建议操作
  suggestedActions?: {
    action: string;
    label: string;
    labelCN: string;
  }[];
}

/**
 * 推送通知
 */
export interface PushNotification {
  userId: string;
  tripId: string;
  type: 'reminder' | 'event' | 'update';
  title: string;
  titleCN: string;
  body: string;
  bodyCN: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  data?: Record<string, any>;
  scheduledAt?: string;
  sentAt?: string;
}
