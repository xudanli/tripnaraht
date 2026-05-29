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
 * GET /trips/:id/schedule 等接口中，与数据库 ItineraryItem 对齐的视图（便于前端与 stops 并行使用）
 */
export interface ScheduleItineraryItemView {
  id: string;
  type: string;
  order: number | null;
  placeId: number | null;
  trailId: number | null;
  /** 当天本地时间 HH:mm */
  startTime: string | null;
  /** 当天本地时间 HH:mm */
  endTime: string | null;
  /** 与 start/end 对应的完整时间（ISO），便于跨时区客户端 */
  startTimeISO: string | null;
  endTimeISO: string | null;
  /** 活动段时长（分钟），由 end-start 得到 */
  durationMinutes: number | null;
  note: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  currency: string | null;
  travelFromPreviousDuration: number | null;
  travelFromPreviousDistance: number | null;
  travelMode: string | null;
  /** 便于展示的地点名 */
  placeName: string | null;
  Place?: {
    id: number;
    nameCN: string | null;
    nameEN: string | null;
    address?: string | null;
    category?: string | null;
    rating?: number | null;
    coordinates?: { lat: number; lng: number } | null;
  } | null;
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
  /** 当天真实行程项（与 ItineraryItem 一致），按开始时间排序 */
  items?: ScheduleItineraryItemView[];
  /** 分钟：各活动段 durationMinutes 之和 + 各段 travelFromPreviousDuration（若有） */
  totalDuration?: number;
  /** 与行程项费用字段对齐的当日合计（actualCost ?? estimatedCost） */
  totalCost?: number;
}
