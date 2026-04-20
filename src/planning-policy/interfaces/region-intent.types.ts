/**
 * 区域意图与用户路线意图（POI 骨架层）
 *
 * 与 docs/POI_REGION_INTENT_PHASE1.md 对齐；供 RegionIntentResolver / RegionAnchorPlanning 使用。
 */

export type PaceType = 'relaxed' | 'normal' | 'dense';

/** 区域默认行程形态（勿与 planning-policy.interface 的 TripType 混淆） */
export type RegionIntentTripKind = 'day_trip' | 'multi_day' | 'half_day';

export type RouteMode = 'loop' | 'outbound' | 'linear';

/**
 * 结构化区域意图：区域 = 约束模板（锚点必选、可选池、推荐时长、路径形态）
 */
export interface RegionIntent {
  regionId: string;
  regionName: string;
  /** 骨架必选锚点 POI id（稳定 slug，与数据层对齐） */
  requiredAnchorPoiIds: string[];
  optionalPoiIds: string[];
  excludedPoiIds?: string[];
  defaultTripType: RegionIntentTripKind;
  recommendedMinHours: number;
  recommendedIdealHours: number;
  routeMode: RouteMode;
}

/**
 * 从 INTAKE 解析后的用户路线意图（可部分填充）
 */
export interface UserRouteIntent {
  destination?: string;
  regionId?: string;
  mustIncludePoiIds?: string[];
  excludePoiIds?: string[];

  tripDate?: string;
  startLocation?: string;
  endLocation?: string;

  availableStartTime?: string;
  availableEndTime?: string;
  totalBudgetMinutes?: number;

  pace?: PaceType;
  styleTags?: string[];
  travelerProfile?: {
    withKids?: boolean;
    mobilityLimited?: boolean;
    driving?: boolean;
  };
}

/** 排程块（与决策/叙述层对齐的轻量结构，Phase 1 可先用于调试与后续串联） */
export interface ItineraryBlock {
  blockType: 'drive' | 'visit' | 'meal' | 'buffer';
  poiId?: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  fixed?: boolean;
  reason?: string;
}
