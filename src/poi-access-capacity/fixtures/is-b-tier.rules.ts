/**
 * 冰岛 B 级 POI — 动态开放状态 / 步道 / 安全管制
 *
 * 来源：Vatnajökull NP、SafeTravel、景区官网（2026 季典型规则）
 */

import type { PoiAccessRule } from '../interfaces/poi-access-capacity.interface';

const VERIFIED_AT = '2026-06-20T00:00:00.000Z';

export const ICELAND_B_TIER_POI_SLUGS = {
  SKAFTAFELL: 'is.skaftafell',
  DYRHOlaEY: 'is.dyrholaey',
  REYNISFJARA: 'is.reynisfjara',
  DETTIFOSS: 'is.dettifoss',
} as const;

export const ICELAND_B_TIER_ACCESS_RULES: PoiAccessRule[] = [
  {
    id: 'is.skaftafell.trail_s3_spring_closure',
    poiId: ICELAND_B_TIER_POI_SLUGS.SKAFTAFELL,
    ruleType: 'TRAIL_RESTRICTION',
    targetResource: 'TRAIL',
    validFrom: '2026-04-01',
    validTo: '2026-06-15',
    status: 'ACTIVE',
    enforcement: 'HARD',
    sourceAuthority: 'Vatnajökull National Park',
    sourceUrl: 'https://www.vatnajokulsthjodgardur.is/en/trails/skaftafell',
    lastVerifiedAt: VERIFIED_AT,
    confidence: 'OFFICIAL',
    notes: 'S3 步道春季融雪/泥泞期通常关闭至 6 月中旬；出发前确认当日步道状态',
  },
  {
    id: 'is.skaftafell.trail_kristinartindar_s4',
    poiId: ICELAND_B_TIER_POI_SLUGS.SKAFTAFELL,
    ruleType: 'TRAIL_RESTRICTION',
    targetResource: 'TRAIL',
    validFrom: '2026-04-01',
    validTo: '2026-07-01',
    status: 'PENDING_CONFIRMATION',
    enforcement: 'HARD',
    sourceAuthority: 'Vatnajökull National Park',
    sourceUrl: 'https://www.vatnajokulsthjodgardur.is/en/trails/skaftafell',
    lastVerifiedAt: VERIFIED_AT,
    confidence: 'OFFICIAL',
    notes:
      'Kristínartindar S4 步道可能因积雪/冰况关闭至 6 月以后；需等待当年官方公告确认',
  },
  {
    id: 'is.dyrholaey.bird_breeding_window',
    poiId: ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY,
    ruleType: 'TRAIL_RESTRICTION',
    targetResource: 'VIEWPOINT',
    validFrom: '2026-05-01',
    validTo: '2026-06-25',
    status: 'PENDING_CONFIRMATION',
    enforcement: 'HARD',
    sourceAuthority: 'Environment Agency of Iceland / Vatnajökull NP',
    sourceUrl: 'https://www.umhverfisstofnun.is/',
    lastVerifiedAt: VERIFIED_AT,
    confidence: 'OFFICIAL',
    notes:
      '5月1日–6月25日间管理机构可据当年鸟类繁殖状况限制进入；非每年固定关闭，需等待当年公告',
  },
  {
    id: 'is.reynisfjara.wave_safety',
    poiId: ICELAND_B_TIER_POI_SLUGS.REYNISFJARA,
    ruleType: 'SAFETY_RESTRICTION',
    targetResource: 'POI',
    status: 'ACTIVE',
    enforcement: 'SOFT',
    sourceAuthority: 'SafeTravel.is / ICE-SAR',
    sourceUrl: 'https://safetravel.is/',
    lastVerifiedAt: VERIFIED_AT,
    confidence: 'OFFICIAL',
    notes:
      '黑沙滩存在危险涌浪（sneaker waves）；勿靠近海岸线，大风天气尤需警惕',
  },
  {
    id: 'is.dettifoss.west_road_f862',
    poiId: ICELAND_B_TIER_POI_SLUGS.DETTIFOSS,
    ruleType: 'VEHICLE_RESTRICTION',
    targetResource: 'ROAD',
    validFrom: '2026-06-01',
    validTo: '2026-10-15',
    applicableVehicleTypes: ['SUV', 'FOUR_BY_FOUR', 'SEDAN'],
    status: 'ACTIVE',
    enforcement: 'HARD',
    sourceAuthority: 'Iceland Road Administration',
    sourceUrl: 'https://www.road.is/',
    lastVerifiedAt: VERIFIED_AT,
    confidence: 'OFFICIAL',
    notes:
      '西侧 F862 为 F 路，夏季开放但需 4x4；轿车应走东侧 864 铺装路前往 Dettifoss',
  },
];
