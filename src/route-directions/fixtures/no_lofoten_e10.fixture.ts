/**
 * RouteDirection Fixture: 罗弗敦群岛E10景观公路
 * Lofoten Islands E10 Scenic Route
 *
 * 路线性质：挪威最标志性的景观驾驶路线，连接所有主要岛屿
 * RouteDirection 判断：推荐给想体验北极景观和自驾的游客
 *
 * @source knowledge-base/lofoten-islands/routes/自驾路线.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const NO_LOFOTEN_E10_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: 'E10景观公路是挪威最标志性的驾驶路线，170公里连接罗弗敦所有岛屿，山峰、峡湾、渔村完美结合',
  mustVisitTags: ['Hamnøy桥', 'Reine观景台', 'Nusfjord遗产村', 'E10终点Å村', '北极威尼斯Henningsvær'],
  nonNegotiableRules: [
    '⚠️ 冬季（10月15日-4月30日）必须使用冬季轮胎（法律要求）',
    '⚠️ 冬季桥梁结冰危险，必须低速谨慎驾驶',
    '⚠️ 检查道路状况（vegvesen.no）再出发',
    '⚠️ 保持油箱至少半满',
  ],
  flexibleParts: [
    '可2.5小时直达或4-6小时停留观景',
    '可选择顺时针或逆时针',
    '可根据兴趣在各岛屿停留',
    '可组合徒步和驾驶',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 3,
    preferredDays: 2,
  },
};

export const NO_LOFOTEN_E10: RouteDirection = {
  name: 'NO_LOFOTEN_E10',
  nameCN: 'E10景观公路',
  nameEN: 'Lofoten Islands E10 Scenic Route',
  countryCode: 'NO',
  regions: ['Lofoten Islands'],
  entryHubs: ['Svolvær', 'Leknes Airport'],
  tags: ['自驾', '景观公路', '北极', '岛屿', '冬季驾驶'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
    avoidMonths: [],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 0,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 0,
      maxDailyAscentM: 0,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.6,
      preferPhotography: 0.3,
      preferCulture: 0.1,
      preferNature: 0.0,
    },
  },

  signaturePois: {
    examples: ['hamnoy_bridge', 'reine_scenic_viewpoint', 'nusfjord_heritage_village', 'henningsvær_arctic_venice'],
    weights: {
      hamnoy_bridge: 1.0,
      reine_scenic_viewpoint: 0.95,
      nusfjord_heritage_village: 0.8,
      henningsvær_arctic_venice: 0.9,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['weather_closure', 'winter_road_condition', 'visibility'],
    rescueDifficulty: 'LOW',
    failureScenarios: [
      {
        day: 1,
        reason: '冬季天气导致道路关闭或不安全',
        typicalUserProfile: '未检查道路状况、冬季轮胎不符合规定的游客',
        mitigation: 'AI应强制检查vegvesen.no道路状况，冬季必须提醒冬季轮胎要求，建议预留缓冲天数',
      },
      {
        day: 1,
        reason: '浓雾降低能见度导致危险',
        typicalUserProfile: '不了解北极天气变化、超速驾驶的游客',
        mitigation: 'AI应提醒：北极沿海雾气常见，必须低速谨慎驾驶',
      },
    ],
  },

  narrative: {
    internal: 'E10是挪威最美的景观路线，但冬季驾驶风险较高',
    userFacing: '驾驶挪威最标志性的E10景观公路，穿越山峰、峡湾和北极渔村',
    philosophy: NO_LOFOTEN_E10_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '冬季无冬季轮胎经验的游客',
    '不愿停留观景的游客',
    '不了解北极天气风险的游客',
  ],

  philosophy: NO_LOFOTEN_E10_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: true,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'medium',
  },

  metadata: {
    route_basic_info: { road_type: '柏油路、高速' },
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 170,
    estimatedDuration: 2,
    vehicleRequired: 'car',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'NO_LOFOTEN_E10',
    philosophy: NO_LOFOTEN_E10_PHILOSOPHY,
  },
};
