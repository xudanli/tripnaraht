// src/planning-policy/interfaces/replanner.interface.ts

import { DayScheduleResult, PlannedStop } from './scheduler.interface';
import { DayOfWeek } from '../utils/time-utils';

/**
 * 重排事件类型
 */
export type ReplanEvent =
  | { type: 'WEATHER_CHANGED'; isRaining: boolean }
  | {
      type: 'POI_CLOSED';
      poiId: string;
      reason?: string;
      effectiveFromMin?: number;
    }
  | {
      type: 'CROWD_SPIKE';
      poiId: string;
      crowdLevel: 0 | 1 | 2 | 3;
      queueExtraMin?: number;
    }
  | { type: 'TRAFFIC_DISRUPTION'; area?: string; severity: 1 | 2 | 3 }
  | {
      type: 'USER_EDIT';
      removedStopIds?: string[];
      pinnedStopIds?: string[];
    };

/**
 * 变更预算（用于控制重排的改动范围）
 */
export interface ChangeBudget {
  /** 最大变更 POI 数量，默认 2-3 */
  maxChangeCount?: number;
  /** 最大时间移动（分钟），默认 60 */
  maxTimeShiftMin?: number;
  /** 是否允许新增 POI，默认 false（除非用户同意） */
  allowAddNewPoi?: boolean;
  /** 是否允许移除必去 POI，默认 false */
  allowRemoveMustSee?: boolean;
}

/**
 * 重排请求
 */
export interface ReplanRequest {
  /** 当前时刻（分钟数） */
  nowMin: number;
  /** 当前位置 */
  currentLocation: { lat: number; lng: number };
  /** 原计划（当天） */
  previous: DayScheduleResult;
  /** 当天可选 POI（通常是"原来剩余的 + 新候选池"） */
  poiPool: import('./poi.interface').Poi[];
  /** 休息点池 */
  restStops: import('./rest-stop.interface').RestStop[];
  /** 交通查询器 */
  getTransit: (
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    policy: import('./planning-policy.interface').PlanningPolicy
  ) => Promise<import('./transit-segment.interface').TransitSegment[]>;
  /** 今日窗口 */
  dayOfWeek: DayOfWeek;
  /** 结束时间（分钟数） */
  endMin: number;
  /** 锁定窗口（比如接下来 30 分钟内不改），默认 30 */
  lockWindowMin?: number;
  /** 事件 */
  event: ReplanEvent;
  /** 强制保留（用户钉住的） */
  pinnedPoiIds?: string[];
  /** 变更预算（控制改动范围） */
  changeBudget?: ChangeBudget;
}

/**
 * 变更原因
 */
export type ChangeReason =
  | 'POI_CLOSED'
  | 'WEATHER_CHANGE'
  | 'CROWD_SPIKE'
  | 'TRAFFIC_DISRUPTION'
  | 'USER_EDIT'
  | 'FEASIBILITY_ISSUE'
  | 'TIME_WINDOW_CONFLICT';

/**
 * 变更影响
 */
export interface ChangeImpact {
  /** 预计节省时间（分钟，负数表示增加） */
  savedTimeMin?: number;
  /** 预计减少步行时间（分钟） */
  reducedWalkMin?: number;
  /** 预计减少换乘次数 */
  reducedTransfers?: number;
  /** 预计提高准点概率（百分比） */
  improvedOnTimeProb?: number;
}

/**
 * 结构化变更解释
 */
export interface StructuredExplanation {
  /** 变更原因 */
  reason: ChangeReason;
  /** 变更描述 */
  description: string;
  /** 变更影响 */
  impact?: ChangeImpact;
  /** 备选方案（如果存在） */
  alternatives?: Array<{
    description: string;
    keepOriginal?: boolean; // 是否保留原计划
    risk?: string; // 保留原计划的风险
  }>;
}

/**
 * 重排结果
 */
export interface ReplanResult {
  /** 合并后新计划（前半段冻结 + 后半段新排） */
  merged: DayScheduleResult;
  /** 差异统计 */
  diff: {
    /** 保留的站点 IDs */
    keptStopIds: string[];
    /** 移除的站点 IDs */
    removedStopIds: string[];
    /** 新增的站点 IDs */
    addedStopIds: string[];
    /** 移动的站点 IDs（id 相同但时间段变化明显） */
    movedStopIds: string[];
    /** 变更计数 */
    changeCount: number;
  };
  /** 给 UI 的解释理由（向后兼容） */
  explain: string[];
  /** 结构化解释（推荐使用） */
  structuredExplain?: StructuredExplanation[];
  /** 是否在变更预算内 */
  withinBudget: boolean;
  /** 变更预算使用情况 */
  budgetUsage?: {
    changeCount: number;
    maxChangeCount: number;
    maxTimeShiftExceeded: boolean;
  };
}
