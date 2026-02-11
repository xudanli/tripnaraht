/**
 * RouteDirection Fixture: 阿根廷Martial冰川徒步
 * Martial Glacier Hike
 *
 * 路线性质：乌斯怀亚最经典的一日徒步，可达冰川体验
 * RouteDirection 判断：推荐给想体验南美洲冰川徒步的用户
 *
 * @source knowledge-base/argentina/routes/martial-glacier.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const AR_MARTIAL_GLACIER_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: 'Martial冰川徒步是乌斯怀亚最经典的一日体验，从亚南极森林到冰川脚下的生态过渡',
  mustVisitTags: ['Martial冰川', '比格尔海峡全景', '亚南极森林', '高山草甸'],
  nonNegotiableRules: [
    '必须携带足够的水（无可靠水源）',
    '高海拔路段需良好体能',
    '冬季仅限滑雪，夏季徒步',
  ],
  flexibleParts: [
    '可选择乘缆车或徒步上升',
    '可选择到观景台或继续到冰川脚下',
    '行程可3-6小时灵活安排',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 1,
    preferredDays: 1,
  },
};

export const AR_MARTIAL_GLACIER: RouteDirection = {
  name: 'AR_MARTIAL_GLACIER',
  nameCN: 'Martial冰川徒步',
  nameEN: 'Martial Glacier Hike',
  countryCode: 'AR',
  regions: ['Tierra del Fuego'],
  entryHubs: ['Ushuaia'],
  tags: ['徒步', '冰川', '一日游', '全景观景', '亚南极生态'],

  seasonality: {
    bestMonths: [11, 12, 1, 2, 3],
    avoidMonths: [6, 7, 8, 9],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 400,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 1050,
      maxDailyAscentM: 400,
      bufferTimeMin: 120,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.3,
      preferCulture: 0.1,
      preferNature: 0.3,
    },
  },

  signaturePois: {
    examples: ['martial_glacier', 'beagle_channel_viewpoint', 'subantarctic_forest'],
    weights: {
      martial_glacier: 1.0,
      beagle_channel_viewpoint: 0.9,
      subantarctic_forest: 0.6,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['fatigue', 'altitude'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 1,
        reason: '高海拔路段体能不支',
        typicalUserProfile: '低估徒步难度、体能不足的用户',
        mitigation: 'AI应提醒高海拔碎石坡路段需良好体能，建议可选择缆车减轻负担',
      },
      {
        day: 1,
        reason: '无水源导致脱水',
        typicalUserProfile: '未携带足够水的徒步者',
        mitigation: 'AI必须提醒：全程无可靠水源，必须自带足够的水',
      },
    ],
  },

  narrative: {
    internal: 'Martial冰川是乌斯怀亚最经典一日徒步，适合体能良好的徒步爱好者',
    userFacing: '从亚南极森林到冰川脚下，俯瞰乌斯怀亚城市和比格尔海峡的壮丽全景',
    philosophy: AR_MARTIAL_GLACIER_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '体能不足的游客',
    '冬季访问乌斯怀亚的游客（仅限滑雪）',
  ],

  philosophy: AR_MARTIAL_GLACIER_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: false,
    level: 'medium',
  },

  metadata: {
    routeType: 'TREKKING',
    totalDistanceKm: 4,
    estimatedDuration: 1,
    vehicleRequired: 'none',
    testId: 'AR_MARTIAL_GLACIER',
    philosophy: AR_MARTIAL_GLACIER_PHILOSOPHY,
  },
};
