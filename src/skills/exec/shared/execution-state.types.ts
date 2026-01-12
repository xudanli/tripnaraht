// src/skills/exec/shared/execution-state.types.ts
/**
 * ExecutionState - 执行阶段的状态
 * 
 * 执行阶段 = "贴心管家式的提醒、变更与兜底"
 */

export type ExecutionPhase = 'ON_TRIP' | 'CHANGE_HANDLING' | 'FALLBACK';

/**
 * 提醒类型
 */
export type ReminderType = 
  | 'departure'           // 出发提醒
  | 'check_in'            // 入住提醒
  | 'activity_start'      // 活动开始提醒
  | 'transport'           // 交通提醒
  | 'weather'             // 天气提醒
  | 'safety'              // 安全提醒
  | 'budget'              // 预算提醒
  | 'custom';             // 自定义提醒

/**
 * 提醒
 */
export interface Reminder {
  id: string;
  type: ReminderType;
  title: string;
  message: string;
  triggerTime: string; // ISO 时间
  priority: 'low' | 'medium' | 'high' | 'urgent';
  relatedItemId?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * 变更类型
 */
export type ChangeType =
  | 'schedule_change'     // 时间变更
  | 'location_change'     // 地点变更
  | 'activity_cancelled'  // 活动取消
  | 'transport_delay'    // 交通延误
  | 'weather_impact'     // 天气影响
  | 'budget_overrun'     // 预算超支
  | 'user_request';      // 用户请求

/**
 * 变更处理结果
 */
export interface ChangeHandlingResult {
  changeId: string;
  changeType: ChangeType;
  originalPlan: any;
  adjustedPlan: any;
  impact: {
    schedule?: string;
    budget?: string;
    experience?: string;
    risk?: string;
  };
  alternatives?: Array<{
    option: string;
    description: string;
    impact: string;
  }>;
  recommendations: string[];
  requiresConfirmation: boolean;
}

/**
 * 兜底方案
 */
export interface FallbackPlan {
  id: string;
  triggerReason: string;
  originalPlan: any;
  fallbackPlan: any;
  explanation: string;
  impact: {
    schedule?: string;
    budget?: string;
    experience?: string;
  };
  confidence: 'low' | 'medium' | 'high';
}

/**
 * 执行状态
 */
export interface ExecutionState {
  tripId: string;
  phase: ExecutionPhase;
  currentDay: number;
  currentDate: string; // ISO date
  reminders: Reminder[];
  pendingChanges: ChangeHandlingResult[];
  activeFallbacks: FallbackPlan[];
  lastUpdated: string; // ISO timestamp
}
