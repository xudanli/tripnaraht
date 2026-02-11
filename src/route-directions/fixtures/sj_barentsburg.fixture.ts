/**
 * RouteDirection Fixture: 斯瓦尔巴巴伦支堡俄罗斯小镇探索
 * Barentsburg Russian Settlement Expedition
 *
 * 路线性质：斯瓦尔巴唯一的活跃俄罗斯社区
 * RouteDirection 判断：推荐给想体验跨文化和苏联遗产的游客
 *
 * @source knowledge-base/svalbard/routes/barentsburg.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const SJ_BARENTSBURG_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '巴伦支堡是斯瓦尔巴唯一的活跃俄罗斯社区，融合了苏联遗产和北极现代生活',
  mustVisitTags: ['列宁雕像', '波莫尔博物馆', '世界最北啤酒厂', '活跃煤矿社区'],
  nonNegotiableRules: [
    '必须跟团，不可独自前往',
    '尊重当地居民和俄罗斯文化',
    '部分区域需要许可才能参观',
    '听从向导安排，注意北极熊风险',
  ],
  flexibleParts: [
    '可选择夏季船游或春季雪地摩托',
    '行程一日往返',
    '可选择是否参观博物馆和品尝俄罗斯餐',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 1,
    preferredDays: 1,
  },
};

export const SJ_BARENTSBURG: RouteDirection = {
  name: 'SJ_BARENTSBURG',
  nameCN: '巴伦支堡俄罗斯小镇探索',
  nameEN: 'Barentsburg Russian Settlement Expedition',
  countryCode: 'SJ',
  regions: ['Spitsbergen'],
  entryHubs: ['Longyearbyen'],
  tags: ['俄罗斯社区', '苏联遗产', '文化体验', '船游', '啤酒厂'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
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
      maxElevationM: 50,
      maxDailyAscentM: 50,
      bufferTimeMin: 120,
    },
    objectives: {
      preferViewpoints: 0.2,
      preferPhotography: 0.3,
      preferCulture: 0.4,
      preferNature: 0.1,
    },
  },

  signaturePois: {
    examples: ['barentsburg_town', 'lenin_statue', 'pomor_museum', 'northernmost_brewery'],
    weights: {
      barentsburg_town: 1.0,
      lenin_statue: 0.8,
      pomor_museum: 0.9,
      northernmost_brewery: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['weather', 'logistics'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 1,
        reason: '恶劣天气导致船只无法出发',
        typicalUserProfile: '未预留天气缓冲时间的游客',
        mitigation: 'AI应提醒：斯瓦尔巴天气多变，建议预留缓冲时间',
      },
    ],
  },

  narrative: {
    internal: '巴伦支堡是斯瓦尔巴独特的跨文化体验，相比金字塔城更安全和可预测',
    userFacing: '探访斯瓦尔巴唯一的活跃俄罗斯社区，体验苏联遗产和北极俄罗斯文化',
    philosophy: SJ_BARENTSBURG_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '对文化体验不感兴趣的游客',
  ],

  philosophy: SJ_BARENTSBURG_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'low-medium',
  },

  metadata: {
    routeType: 'ADVENTURE_DRIVE',
    totalDistanceKm: 55,
    estimatedDuration: 1,
    vehicleRequired: 'none',
    polarBearRisk: true,
    weaponRequired: true,
    testId: 'SJ_BARENTSBURG',
    philosophy: SJ_BARENTSBURG_PHILOSOPHY,
  },
};
