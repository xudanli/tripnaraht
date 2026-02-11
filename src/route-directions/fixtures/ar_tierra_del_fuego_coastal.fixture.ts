/**
 * RouteDirection Fixture: 阿根廷火地岛国家公园海岸步道
 * Tierra del Fuego National Park Coastal Trail
 *
 * 路线性质：世界最南端国家公园，泛美公路终点
 * RouteDirection 判断：推荐给想轻松体验火地岛的游客
 *
 * @source knowledge-base/argentina/routes/tierra-del-fuego-coastal.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const AR_TIERRA_DEL_FUEGO_COASTAL_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '火地岛国家公园海岸步道是世界最南端的国家公园体验，标志着泛美公路的终点',
  mustVisitTags: ['泛美公路终点', '比格尔海峡海岸线', '亚南极森林', '世界尽头邮局'],
  nonNegotiableRules: [
    '必须购买国家公园门票（外国人$15 USD）',
    '遵守步道标记，不要离开指定路径',
    '不要喂食或接近野生动物（海狸等）',
    '将所有垃圾带走，保护原始环境',
  ],
  flexibleParts: [
    '可选择全程8公里或部分完成',
    '行程可4-6小时灵活安排',
    '可与乌斯怀亚市区游览结合成一日游',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 1,
    preferredDays: 1,
  },
};

export const AR_TIERRA_DEL_FUEGO_COASTAL: RouteDirection = {
  name: 'AR_TIERRA_DEL_FUEGO_COASTAL',
  nameCN: '火地岛国家公园海岸步道',
  nameEN: 'Tierra del Fuego National Park Coastal Trail',
  countryCode: 'AR',
  regions: ['Tierra del Fuego'],
  entryHubs: ['Ushuaia'],
  tags: ['国家公园', '海岸徒步', '泛美公路终点', '亚南极森林', '轻松徒步'],

  seasonality: {
    bestMonths: [11, 12, 1, 2, 3],
    avoidMonths: [],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 150,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: true,
    },
    soft: {
      maxElevationM: 50,
      maxDailyAscentM: 150,
      bufferTimeMin: 120,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.3,
      preferCulture: 0.2,
      preferNature: 0.2,
    },
  },

  signaturePois: {
    examples: ['pan_american_highway_end', 'beagle_channel_coast', 'lapataia_bay'],
    weights: {
      pan_american_highway_end: 1.0,
      beagle_channel_coast: 0.8,
      lapataia_bay: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['weather', 'logistics'],
    rescueDifficulty: 'LOW',
    failureScenarios: [
      {
        day: 1,
        reason: '冬季部分路段关闭导致无法完成全程',
        typicalUserProfile: '冬季未提前确认路况的游客',
        mitigation: 'AI应提醒冬季访客提前确认国家公园路况',
      },
    ],
  },

  narrative: {
    internal: '火地岛国家公园是阿根廷最南端的国家公园，轻松易达，适合多数游客',
    userFacing: '世界最南端的国家公园，泛美公路终点，沿比格尔海峡海岸线穿越亚南极森林',
    philosophy: AR_TIERRA_DEL_FUEGO_COASTAL_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '寻找高难度徒步挑战的探险者',
  ],

  philosophy: AR_TIERRA_DEL_FUEGO_COASTAL_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: false,
    level: 'low',
  },

  metadata: {
    routeType: 'TREKKING',
    totalDistanceKm: 8,
    estimatedDuration: 1,
    vehicleRequired: 'none',
    testId: 'AR_TIERRA_DEL_FUEGO_COASTAL',
    philosophy: AR_TIERRA_DEL_FUEGO_COASTAL_PHILOSOPHY,
  },
};
