/**
 * 冰岛 A 级 POI 准入规则种子（Phase 1 MVP）
 *
 * 来源：官方公告 / Parka 页面 / 景区官网（2026 季）
 * 运行 scripts/seed-iceland-poi-access-capacity.ts 写入 DB
 */

import type { PoiAccessRule } from '../interfaces/poi-access-capacity.interface';

const VERIFIED_AT = '2026-06-20T00:00:00.000Z';

export const ICELAND_A_TIER_POI_SLUGS = {
  LANDMANNALAUGAR: 'is.landmannalaugar',
  BLUE_LAGOON: 'is.blue_lagoon',
  SKY_LAGOON: 'is.sky_lagoon',
} as const;

/** @deprecated 使用 iceland-poi-registry.ICELAND_POI_SLUG_RESOLVERS */
export { ICELAND_POI_SLUG_RESOLVERS } from './iceland-poi-registry';

export const ICELAND_A_TIER_ACCESS_RULES: PoiAccessRule[] = [
  {
    id: 'is.landmannalaugar.parking_reservation_2026_summer',
    poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
    ruleType: 'PARKING_RESERVATION',
    targetResource: 'PARKING',
    validFrom: '2026-06-20',
    validTo: '2026-09-13',
    dailyStartTime: '09:00',
    dailyEndTime: '16:00',
    reservationRequired: true,
    status: 'ACTIVE',
    sourceAuthority: 'Landmannalaugar / Parka',
    sourceUrl: 'https://www.parka.is/place/landmannalaugar/',
    sourceUpdatedAt: '2026-01-15T00:00:00.000Z',
    lastVerifiedAt: VERIFIED_AT,
    confidence: 'OFFICIAL',
    notes:
      '6月20日–9月13日，每日 09:00–16:00 到达需提前预约停车位；时段外不要求预约但可能仍收取服务费',
  },
  {
    id: 'is.landmannalaugar.froad_vehicle',
    poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
    ruleType: 'VEHICLE_RESTRICTION',
    targetResource: 'ROAD',
    reservationRequired: false,
    applicableVehicleTypes: ['SUV', 'FOUR_BY_FOUR', 'CAMPERVAN'],
    status: 'ACTIVE',
    sourceAuthority: 'Iceland Road Administration / Highland access policy',
    sourceUrl: 'https://www.road.is/travel-info/conditions-in-the-highlands/',
    lastVerifiedAt: VERIFIED_AT,
    confidence: 'OFFICIAL',
    notes: '高地 F 路通常要求 4x4；普通轿车不建议进入',
  },
  {
    id: 'is.blue_lagoon.reservation_required',
    poiId: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
    ruleType: 'RESERVATION_REQUIRED',
    targetResource: 'POI',
    reservationRequired: true,
    status: 'ACTIVE',
    sourceAuthority: 'Blue Lagoon Iceland',
    sourceUrl: 'https://www.bluelagoon.com/day-visit/the-blue-lagoon',
    sourceUpdatedAt: '2026-01-01T00:00:00.000Z',
    lastVerifiedAt: VERIFIED_AT,
    confidence: 'OFFICIAL',
    notes: '必须提前预订并按入场时间段到场；热门日期可能售罄',
  },
  {
    id: 'is.sky_lagoon.reservation_required',
    poiId: ICELAND_A_TIER_POI_SLUGS.SKY_LAGOON,
    ruleType: 'RESERVATION_REQUIRED',
    targetResource: 'POI',
    reservationRequired: true,
    status: 'ACTIVE',
    sourceAuthority: 'Sky Lagoon',
    sourceUrl: 'https://www.skylagoon.com/booking/',
    lastVerifiedAt: VERIFIED_AT,
    confidence: 'OFFICIAL',
    notes: '需按时段预订入场',
  },
];
