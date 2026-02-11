/**
 * RouteDirection Fixture: 巴塔哥尼亚Mount San Valentín
 * Patagonia Mount San Valentín - Chilean Approach
 *
 * 路线性质：巴塔哥尼亚最高峰（4058m）的高海拔雪冰登山
 * RouteDirection 判断：推荐给有雪冰登山经验且能承受复杂后勤的登山者
 *
 * @source knowledge-base/patagonia/routes/additional-routes.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const AR_SAN_VALENTIN_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: 'Mount San Valentín是巴塔哥尼亚最高峰（4058m），远离El Chaltén，需要雪冰技能和复杂后勤',
  mustVisitTags: ['巴塔哥尼亚最高峰4058m', '雪冰混合地形', '冰川穿越', '远程基地营', '原始荒野'],
  nonNegotiableRules: [
    '⚠️ 必须有雪冰登山经验（不仅是干岩技术）',
    '⚠️ 必须有冰爪、冰镐、安全绳等专业装备',
    '⚠️ 必须能承受复杂的后勤安排和长时间远离文明',
    '⚠️ 海拔4000m+有高反风险',
    '⚠️ 必须跟随有该地经验的向导',
  ],
  flexibleParts: [
    '可6-8天完成',
    '可根据天气调整上升计划',
    '可选择不同季节前往',
  ],
  durationFlexibility: {
    minDays: 6,
    maxDays: 8,
    preferredDays: 7,
  },
};

export const AR_SAN_VALENTIN: RouteDirection = {
  name: 'AR_SAN_VALENTIN',
  nameCN: 'Mount San Valentín',
  nameEN: 'Patagonia Mount San Valentín - Chilean Approach',
  countryCode: 'AR',
  regions: ['Patagonia'],
  entryHubs: ['El Chaltén'],
  tags: ['高海拔', '雪冰登山', '极限', '巴塔哥尼亚最高', '远程'],

  seasonality: {
    bestMonths: [12, 1, 2],
    avoidMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 1700,
      rapidAscentForbidden: true,
      requiresGuide: true,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 4058,
      maxDailyAscentM: 800,
      bufferTimeMin: 240,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.1,
      preferCulture: 0.0,
      preferNature: 0.6,
    },
  },

  signaturePois: {
    examples: ['san_valentin_summit', 'glacier_fields', 'remote_basecamp', 'patagonian_peaks'],
    weights: {
      san_valentin_summit: 1.0,
      glacier_fields: 0.9,
      remote_basecamp: 0.7,
      patagonian_peaks: 0.6,
    },
  },

  failureProfile: {
    commonFailureDays: [3, 4, 5],
    typicalFailureReason: ['altitude_sickness', 'weather', 'snow_bridge_collapse', 'avalanche'],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 3,
        reason: '高海拔（4000m+）导致高反症状',
        typicalUserProfile: '未充分适应高海拔、快速上升的登山者',
        mitigation: 'AI应建议：必须缓慢上升，每日增高不超过500m，监控高反症状',
      },
      {
        day: 4,
        reason: '雪桥突然坍塌导致坠入冰缝',
        typicalUserProfile: '低估雪桥危险、不遵守绳组规程的登山者',
        mitigation: 'AI必须强调：全程必须绳组行动，不能离开绳组，雪桥可能随时坍塌',
      },
      {
        day: 5,
        reason: '天气恶劣（暴风雪）导致视线不足和迷向',
        typicalUserProfile: '强行继续、未检查天气预报的登山者',
        mitigation: 'AI应每日监控天气，极端天气立即建议返回营地',
      },
    ],
  },

  narrative: {
    internal: 'San Valentín是巴塔哥尼亚高海拔挑战，需要雪冰技能和良好体能',
    userFacing: '攀登巴塔哥尼亚最高峰，体验4000m+高海拔和远程荒野登山',
    philosophy: AR_SAN_VALENTIN_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '无雪冰登山经验的登山者',
    '对高反敏感的登山者',
    '不愿承受复杂后勤的登山者',
    '冬季前往的游客',
  ],

  philosophy: AR_SAN_VALENTIN_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: true,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [12, 1, 2],
    level: 'extreme',
  },

  metadata: {
    routeType: 'MOUNTAINEERING',
    totalDistanceKm: 40,
    estimatedDuration: 7,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'AR_SAN_VALENTIN',
    philosophy: AR_SAN_VALENTIN_PHILOSOPHY,
  },
};
