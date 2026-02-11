/**
 * RouteDirection Fixture: 马特洪峰地区
 * Matterhorn Region (Zermatt)
 *
 * 路线性质：瑞士最经典的高山观景和徒步地区
 * RouteDirection 判断：推荐给想体验阿尔卑斯精华雪山的游客
 *
 * @source knowledge-base/switzerland/routes/matterhorn-region.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const CH_MATTERHORN_REGION_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '马特洪峰地区是阿尔卑斯最标志性的雪山区域，观景台、徒步和登山完美结合',
  mustVisitTags: ['马特洪峰观景', 'Gornergrat观景台', 'Sunnegga天堂', '冰川天堂Klein Matterhorn', '5湖徒步'],
  nonNegotiableRules: [
    '⚠️ 高海拔观景台有高反风险（Klein Matterhorn 3883m）',
    '⚠️ 登马特洪峰需要专业登山技能（不适合普通游客）',
    '⚠️ Zermatt禁止汽油车（仅电动车）',
    '⚠️ 天气变化快，必须准备防寒装备',
  ],
  flexibleParts: [
    '可3-7天灵活安排',
    '可选择缆车观景或徒步',
    '可选择不同难度的徒步路线',
  ],
  durationFlexibility: {
    minDays: 3,
    maxDays: 7,
    preferredDays: 5,
  },
};

export const CH_MATTERHORN_REGION: RouteDirection = {
  name: 'CH_MATTERHORN_REGION',
  nameCN: '马特洪峰地区',
  nameEN: 'Matterhorn Region (Zermatt)',
  countryCode: 'CH',
  regions: ['Zermatt'],
  entryHubs: ['Zurich', 'Geneva', 'Brig'],
  tags: ['雪山', '缆车', '徒步', '观景台', '马特洪峰'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
    avoidMonths: [],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 1500,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 3883,
      maxDailyAscentM: 1000,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.6,
      preferPhotography: 0.3,
      preferCulture: 0.0,
      preferNature: 0.1,
    },
  },

  signaturePois: {
    examples: ['matterhorn_peak', 'gornergrat_observatory', 'klein_matterhorn_glacier_paradise', '5_seenweg_hike'],
    weights: {
      matterhorn_peak: 1.0,
      gornergrat_observatory: 0.9,
      klein_matterhorn_glacier_paradise: 0.9,
      '5_seenweg_hike': 0.8,
    },
  },

  failureProfile: {
    commonFailureDays: [1, 2],
    typicalFailureReason: ['altitude_sickness', 'weather', 'ticket_unavailable'],
    rescueDifficulty: 'LOW',
    failureScenarios: [
      {
        day: 1,
        reason: 'Klein Matterhorn（3883m）出现高反症状',
        typicalUserProfile: '从低海拔直接上山、未适应的游客',
        mitigation: 'AI应建议：在Zermatt适应1天后再上山，如有高反症状立即下撤',
      },
      {
        day: 2,
        reason: '缆车票未预订导致无法上山',
        typicalUserProfile: '未提前预订、旺季前往的游客',
        mitigation: 'AI应建议至少提前1周预订缆车票，旺季至少2周',
      },
    ],
  },

  narrative: {
    internal: '马特洪峰地区是阿尔卑斯最安全的区域，但仍需注意高反',
    userFacing: '观赏阿尔卑斯最标志性的雪山马特洪峰，体验瑞士最经典的高山风光',
    philosophy: CH_MATTERHORN_REGION_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '对高反敏感的游客',
    '不愿提前预订的游客',
    '预算非常有限的游客（Zermatt物价极高）',
  ],

  philosophy: CH_MATTERHORN_REGION_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: true,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: false,
    level: 'medium',
  },

  metadata: {
    routeType: 'MOUNTAIN_SIGHTSEEING',
    totalDistanceKm: 80,
    estimatedDuration: 5,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'CH_MATTERHORN_REGION',
    philosophy: CH_MATTERHORN_REGION_PHILOSOPHY,
  },
};
