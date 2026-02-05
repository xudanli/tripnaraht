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
  success?: boolean; // 新增：是否成功
  message?: string; // 新增：消息
  updatedSchedule?: { // 新增：更新后的时间线
    date: string;
    schedule: {
      items: Array<{
        placeId: number;
        placeName: string;
        startTime: string;
        endTime: string;
        status?: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
        [key: string]: any;
      }>;
    };
  };
}

/**
 * 修复方案
 */
export interface FallbackSolution {
  id: string;
  type: 'minimal' | 'experience' | 'safety';
  title: string;
  description: string;
  changes: Array<{
    itemId: string;
    action: 'modify' | 'remove' | 'add';
    newTime?: string;
    newPlace?: any;
  }>;
  impact: {
    arrivalTime: string; // 如："10:15 (+15分钟)"
    missingPlaces: number;
    riskChange: 'low' | 'medium' | 'high';
  };
  recommended?: boolean;
}

/**
 * 兜底方案
 */
export interface FallbackPlan {
  id: string;
  triggerReason: string;
  originalPlan: any;
  fallbackPlan?: any; // 向后兼容：保留单个方案
  solutions?: FallbackSolution[]; // 新增：多个修复方案
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
