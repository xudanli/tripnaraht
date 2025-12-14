// src/planning-policy/interfaces/ranking.interface.ts

import { Poi } from './poi.interface';
import { PlanningPolicy } from './planning-policy.interface';
import { DayOfWeek } from '../utils/time-utils';

/**
 * POI 排序特征（增强版）
 * 
 * 将可行性/时间窗/可达性特征引入排序，做到"推荐即具备可执行感"
 */
export interface PoiRankingFeatures {
  /** POI ID */
  poiId: string;
  /** 基础兴趣分数（来自 ItemCF/MF/内容推荐） */
  baseInterestScore: number;
  /** 是否在当前时间/当天可行 */
  feasibleNow: boolean;
  /** 下一段开放时间距离（分钟），如果已开放则为 0 */
  openWindowNextMin: number;
  /** 距离最晚入场还有多少分钟（如果已过则为负数） */
  lastEntrySlack: number;
  /** 可达性是否满足要求（轮椅/楼梯） */
  accessibilityOK: boolean;
  /** 预计步行痛苦（基于画像与地理粗估） */
  expectedWalkPain: number;
  /** 周边 1km 休息点密度（对 CITY_POTATO/LIMITED 很关键） */
  restSupportDensity: number;
  /** 综合得分（用于排序） */
  finalScore: number;
  /** 不可行的原因（如果 feasibleNow 为 false） */
  infeasibleReason?: string;
}

/**
 * 排序请求
 */
export interface RankingRequest {
  /** 候选 POI 列表 */
  pois: Poi[];
  /** 规划策略 */
  policy: PlanningPolicy;
  /** 当前时间（分钟数，从当天 0:00 开始） */
  currentTimeMin: number;
  /** 星期几 */
  dayOfWeek: DayOfWeek;
  /** 日期（ISO 格式），用于节假日判断 */
  dateISO?: string;
  /** 当前位置（用于计算距离和步行痛苦） */
  currentLocation?: { lat: number; lng: number };
  /** 休息点列表（用于计算密度） */
  restStops?: Array<{ lat: number; lng: number }>;
  /** 基础兴趣分数映射（POI ID -> 分数） */
  baseInterestScores?: Map<string, number>;
}
