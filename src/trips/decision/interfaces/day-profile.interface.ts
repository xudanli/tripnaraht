// src/trips/decision/interfaces/day-profile.interface.ts
/**
 * Day Profile Interface
 * 
 * 每天的节奏画像
 */

import { RouteSegment } from '../shared/world-model.types';

/**
 * 每天的节奏画像
 */
export interface DayProfile {
  /** 天数索引 */
  dayIndex: number;
  /** 这一天包含的 segment */
  segments: RouteSegment[];
  /** 总距离（公里） */
  totalDistanceKm: number;
  /** 总爬升（米） */
  totalAscentM: number;
  /** 最大坡度（百分比） */
  maxSlopePct: number;
  /** 估算移动时间（小时） */
  estMovingHours: number;
  /** 疲劳指数（综合指标） */
  fatigueIndex: number;
}

/**
 * 节奏约束
 */
export interface PaceConstraints {
  /** 最大单日爬升（米） */
  maxDailyAscentM: number;
  /** 最大单日距离（公里） */
  maxDailyDistanceKm: number;
  /** 最大移动时间（小时） */
  maxMovingHours: number;
  /** 3 天滚动窗口最大累计爬升（米） */
  rollingAscent3DaysM: number;
}

/**
 * 滚动疲劳问题
 */
export interface RollingFatigueIssue {
  /** 开始天数 */
  startDay: number;
  /** 结束天数 */
  endDay: number;
  /** 总爬升 */
  totalAscent: number;
}

