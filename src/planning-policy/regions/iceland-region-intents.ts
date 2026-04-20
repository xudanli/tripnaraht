/**
 * 冰岛区域意图注册表（Phase 1：黄金圈完整示例，其余区域可逐步补全）
 */

import type { RegionIntent } from '../interfaces/region-intent.types';

/** 黄金圈经典一日游骨架（锚点为稳定 id slug） */
export const GOLDEN_CIRCLE_INTENT: RegionIntent = {
  regionId: 'golden_circle',
  regionName: 'Golden Circle',
  requiredAnchorPoiIds: ['thingvellir', 'geysir', 'gullfoss'],
  optionalPoiIds: [
    'kerid_crater',
    'secret_lagoon',
    'fridheimar',
    'bruarfoss',
  ],
  excludedPoiIds: [],
  defaultTripType: 'day_trip',
  recommendedMinHours: 8,
  recommendedIdealHours: 10,
  routeMode: 'loop',
};

/** regionId → RegionIntent */
export const ICELAND_REGION_INTENT_BY_ID: Record<string, RegionIntent> = {
  golden_circle: GOLDEN_CIRCLE_INTENT,
};

/**
 * 锚点默认停留（分钟）：min / recommended / max
 * 用于 Phase 1 预算与回退；数据层 POI 若带 recommendedDwellMinutes 则优先使用数据层。
 */
export const ICELAND_ANCHOR_DWELL_DEFAULTS_MIN: Record<
  string,
  { min: number; recommended: number; max?: number }
> = {
  thingvellir: { min: 40, recommended: 60, max: 90 },
  geysir: { min: 30, recommended: 45, max: 60 },
  gullfoss: { min: 25, recommended: 40, max: 60 },
};

/** 黄金圈一日典型驾驶+接驳占位（分钟），无路由引擎时的保守估计 */
export const GOLDEN_CIRCLE_DEFAULT_DRIVE_MINUTES = 200;
