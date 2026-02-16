/**
 * RouteDirection Fixture: 冰岛完整环岛公路
 * Complete Ring Road (Route 1)
 *
 * 路线性质：终极冰岛体验，环绕全岛一圈
 * RouteDirection 判断：推荐给有充足时间的游客，覆盖冰岛所有主要风光
 *
 * @source knowledge-base/iceland/routes/ring-road-full.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const IS_RING_ROAD_FULL_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '完整环岛是冰岛最终极的旅程，环绕全岛1332公里，体验从南线到北部、西部的所有地质奇观',
  mustVisitTags: ['南线瀑布群', '冰河湖', '北部地热区', '西峡湾风光', '斯奈山'],
  nonNegotiableRules: [
    '冬季环岛需四驱车和冬季轮胎，风险显著增加',
    '完整环岛需充足时间（最少7天，推荐10天），时间不足应选择部分路线',
    'Vík→Höfn段必须加满油，无中间加油站',
  ],
  flexibleParts: [
    '可选择7天快速、10天舒适或14天悠闲',
    '可顺时针或逆时针方向',
    '可灵活增减活动（冰川徒步、冰河湖游船等）',
  ],
  durationFlexibility: {
    minDays: 7,
    maxDays: 14,
    preferredDays: 10,
  },
};

export const IS_RING_ROAD_FULL: RouteDirection = {
  name: 'IS_RING_ROAD_FULL',
  nameCN: '冰岛完整环岛公路',
  nameEN: 'Complete Ring Road (Route 1)',
  countryCode: 'IS',
  regions: ['Iceland Full'],
  entryHubs: ['Reykjavik'],
  tags: ['环岛', '自驾', '终极体验', '完整地质游', '公路旅行'],

  seasonality: {
    bestMonths: [5, 6, 7, 8, 9],
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
      maxElevationM: 500,
      maxDailyAscentM: 100,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.35,
      preferPhotography: 0.35,
      preferCulture: 0.15,
      preferNature: 0.15,
    },
  },

  signaturePois: {
    examples: ['golden_circle', 'black_beach', 'jokulsarlon', 'myvatn', 'akureyri'],
    weights: {
      golden_circle: 0.8,
      black_beach: 1.0,
      jokulsarlon: 0.9,
      myvatn: 0.8,
      akureyri: 0.6,
    },
  },

  failureProfile: {
    commonFailureDays: [3, 4, 5],
    typicalFailureReason: ['fatigue', 'weather', 'logistics'],
    rescueDifficulty: 'LOW',
    failureScenarios: [
      {
        day: 3,
        reason: '黑沙滩潜行波意外',
        typicalUserProfile: '不了解潜行波危险的游客',
        mitigation: 'AI必须重复警告黑沙滩潜行波风险',
      },
      {
        day: 4,
        reason: '驾驶疲劳导致状态下降',
        typicalUserProfile: '每天驾驶时间过长的游客',
        mitigation: 'AI应建议10天而非7天行程，强调充足休息的重要性',
      },
    ],
  },

  narrative: {
    internal: '完整环岛是冰岛最全面的旅程，需要充足时间和精力',
    userFacing: '环绕冰岛全岛1332公里，连续体验从南线瀑布到北部地热、西部峡湾的所有景观',
    philosophy: IS_RING_ROAD_FULL_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '时间有限（少于7天）的游客',
    '不愿长时间驾驶的旅行者',
  ],

  philosophy: IS_RING_ROAD_FULL_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: false,
    level: 'medium',
  },

  metadata: {
    route_basic_info: { road_type: '柏油路为主（环岛公路）' },
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 1332,
    estimatedDuration: 10,
    vehicleRequired: 'standard',
    testId: 'IS_RING_ROAD_FULL',
    philosophy: IS_RING_ROAD_FULL_PHILOSOPHY,
  },
};
