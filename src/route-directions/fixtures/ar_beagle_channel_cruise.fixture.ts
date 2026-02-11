/**
 * RouteDirection Fixture: 阿根廷比格尔海峡游船
 * Beagle Channel Boat Tour
 *
 * 路线性质：乌斯怀亚最经典的水上活动，观赏企鹅和海狮
 * RouteDirection 判断：强烈推荐给所有来乌斯怀亚的游客
 *
 * @source knowledge-base/argentina/routes/beagle-channel-cruise.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const AR_BEAGLE_CHANNEL_CRUISE_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '比格尔海峡游船是乌斯怀亚最经典的体验，近距离观察企鹅、海狮和世界尽头灯塔',
  mustVisitTags: ['Les Eclaireurs灯塔', '海狮岛', '企鹅岛', '比格尔海峡风光'],
  nonNegotiableRules: [
    '提前预订，旺季（11-3月）船票紧张',
    '出发前30分钟到达港口check-in',
    '观察野生动物时保持安全距离，听从向导指挥',
    '企鹅岛登陆时遵守时间限制和路线规定',
  ],
  flexibleParts: [
    '可选择2.5小时经典线、4-5小时企鹅线或5-6小时农场线',
    '可根据预算和时间选择不同档次的游船',
    '可选择是否登陆企鹅岛或农场',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 1,
    preferredDays: 1,
  },
};

export const AR_BEAGLE_CHANNEL_CRUISE: RouteDirection = {
  name: 'AR_BEAGLE_CHANNEL_CRUISE',
  nameCN: '比格尔海峡游船',
  nameEN: 'Beagle Channel Boat Tour',
  countryCode: 'AR',
  regions: ['Tierra del Fuego'],
  entryHubs: ['Ushuaia'],
  tags: ['游船', '企鹅', '海狮', '灯塔', '野生动物观察', '轻松活动'],

  seasonality: {
    bestMonths: [10, 11, 12, 1, 2, 3],
    avoidMonths: [],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 0,
      rapidAscentForbidden: false,
      requiresGuide: true,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 0,
      maxDailyAscentM: 0,
      bufferTimeMin: 60,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.4,
      preferCulture: 0.1,
      preferNature: 0.2,
    },
  },

  signaturePois: {
    examples: ['les_eclaireurs_lighthouse', 'sea_lion_island', 'penguin_island'],
    weights: {
      les_eclaireurs_lighthouse: 0.9,
      sea_lion_island: 0.8,
      penguin_island: 1.0,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['weather', 'seasickness'],
    rescueDifficulty: 'LOW',
    failureScenarios: [
      {
        day: 1,
        reason: '恶劣天气导致游船取消',
        typicalUserProfile: '未预留天气缓冲时间的游客',
        mitigation: 'AI应提醒：南部巴塔哥尼亚天气多变，建议预留1天缓冲时间',
      },
      {
        day: 1,
        reason: '晕船导致体验不佳',
        typicalUserProfile: '容易晕船但未提前准备的游客',
        mitigation: 'AI应询问用户是否容易晕船，建议提前服用晕船药',
      },
    ],
  },

  narrative: {
    internal: '比格尔海峡游船是乌斯怀亚最经典的活动，适合所有年龄和体能水平',
    userFacing: '乘船游览比格尔海峡，近距离观察麦哲伦企鹅、海狮，参观世界尽头灯塔',
    philosophy: AR_BEAGLE_CHANNEL_CRUISE_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '极度晕船且不愿服药的游客',
  ],

  philosophy: AR_BEAGLE_CHANNEL_CRUISE_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: false,
    level: 'low',
  },

  metadata: {
    routeType: 'ADVENTURE_DRIVE',
    totalDistanceKm: 60,
    estimatedDuration: 1,
    vehicleRequired: 'none',
    testId: 'AR_BEAGLE_CHANNEL_CRUISE',
    philosophy: AR_BEAGLE_CHANNEL_CRUISE_PHILOSOPHY,
  },
};
