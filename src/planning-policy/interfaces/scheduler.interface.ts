// src/planning-policy/interfaces/scheduler.interface.ts

import { PlanningPolicy } from './planning-policy.interface';
import { Poi } from './poi.interface';
import { TransitSegment } from './transit-segment.interface';
import { RestStop, StopKind } from './rest-stop.interface';
import { DayOfWeek } from '../utils/time-utils';

/**
 * 日程排程请求
 */
export interface DayScheduleRequest {
  /** 日期（ISO 格式），如 "2026-01-03" */
  dateISO: string;
  /** 星期几 */
  dayOfWeek: DayOfWeek;
  /** 开始时间（分钟数，从当天 0:00 开始），如 9:00 => 540 */
  startMin: number;
  /** 结束时间（分钟数），如 20:00 => 1200 */
  endMin: number;
  /** 起点位置 */
  startLocation: { lat: number; lng: number };
  /** 候选 POI（已从召回/排序出来） */
  pois: Poi[];
  /** REST 候选（咖啡馆/商场/公园座椅等） */
  restStops: RestStop[];
  /** 交通查询器（可以对接 Google Routes / OSRM / 自己缓存的矩阵） */
  getTransit: (
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    policy: PlanningPolicy
  ) => Promise<TransitSegment[]>;
  /** 必去 POI IDs（可选） */
  mustSeePoiIds?: string[];
  /** 每个 POI 之间预留缓冲（分钟），默认 10 */
  bufferMin?: number;
}

/**
 * 已计划的站点
 */
export interface PlannedStop {
  /** 站点类型 */
  kind: StopKind;
  /** ID */
  id: string;
  /** 名称 */
  name: string;
  /** 开始时间（分钟数） */
  startMin: number;
  /** 结束时间（分钟数） */
  endMin: number;
  /** 纬度 */
  lat: number;
  /** 经度 */
  lng: number;
  /** 解释与审计（很重要） */
  notes?: string[];
  /** 到达此 stop 的交通段（可选） */
  transitIn?: TransitSegment;
}

/**
 * 日程排程结果
 */
export interface DayScheduleResult {
  /** 计划站点列表 */
  stops: PlannedStop[];
  /** 统计指标 */
  metrics: {
    /** 总旅行时间（分钟） */
    totalTravelMin: number;
    /** 总步行时间（分钟） */
    totalWalkMin: number;
    /** 总换乘次数 */
    totalTransfers: number;
    /** 总排队时间（分钟） */
    totalQueueMin: number;
    /** 超时时间（分钟） */
    overtimeMin: number;
    /** 结束时的 HP */
    hpEnd: number;
    /** 违反的约束（若失败） */
    violated?: string[];
  };
}
