/**
 * RouteDirection Fixture: 斯瓦尔巴朗伊尔城周边探索
 * Longyearbyen Surroundings Exploration
 *
 * 路线性质：世界最北的城市周边一日游
 * RouteDirection 判断：推荐给首次来斯瓦尔巴、想轻松探索的游客
 *
 * @source knowledge-base/svalbard/routes/longyearbyen-surroundings.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const SJ_LONGYEARBYEN_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '朗伊尔城周边是斯瓦尔巴最容易到达的区域，适合首次体验北极78度的游客',
  mustVisitTags: ['斯瓦尔巴博物馆', '全球种子库', '矿区遗迹', '北极野生动物'],
  nonNegotiableRules: [
    '⚠️ 离开定居点边界必须携带武器防御北极熊（法律要求）',
    '⚠️ 强烈建议跟团或结伴前往，不要独自探索',
    '⚠️ 必须随时警惕北极熊，保持360度观察',
    '夏季（6-8月）是最佳季节，极夜期需特殊装备',
  ],
  flexibleParts: [
    '可选择半日或全日游',
    '可根据天气和兴趣灵活调整景点',
    '可选择自助或跟团',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 1,
    preferredDays: 1,
  },
};

export const SJ_LONGYEARBYEN: RouteDirection = {
  name: 'SJ_LONGYEARBYEN',
  nameCN: '朗伊尔城周边探索',
  nameEN: 'Longyearbyen Surroundings Exploration',
  countryCode: 'SJ',
  regions: ['Spitsbergen'],
  entryHubs: ['Longyearbyen'],
  tags: ['北极78度', '种子库', '博物馆', '矿区', '北极熊风险', '极昼/极夜'],

  seasonality: {
    bestMonths: [6, 7, 8],
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
      maxElevationM: 100,
      maxDailyAscentM: 50,
      bufferTimeMin: 120,
    },
    objectives: {
      preferViewpoints: 0.2,
      preferPhotography: 0.3,
      preferCulture: 0.3,
      preferNature: 0.2,
    },
  },

  signaturePois: {
    examples: ['svalbard_museum', 'global_seed_vault', 'mining_heritage'],
    weights: {
      svalbard_museum: 1.0,
      global_seed_vault: 0.9,
      mining_heritage: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['polar_bear_encounter', 'weather'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 1,
        reason: '独自前往种子库途中遭遇北极熊',
        typicalUserProfile: '低估北极熊风险、独自行动的游客',
        mitigation: 'AI必须强调：离开定居点边界必须携带武器或跟团，强烈建议结伴前往',
      },
      {
        day: 1,
        reason: '极夜期或恶劣天气导致迷路',
        typicalUserProfile: '极夜期独自探索、无头灯和GPS的游客',
        mitigation: 'AI应建议夏季访问或跟团，极夜期需特殊装备和经验',
      },
    ],
  },

  narrative: {
    internal: '朗伊尔城周边是斯瓦尔巴最安全的区域，但北极熊风险依然存在',
    userFacing: '世界最北的城市周边探索，包括全球种子库、博物馆和矿区遗迹',
    philosophy: SJ_LONGYEARBYEN_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '不愿遵守北极熊安全规则的游客',
    '坚持独自行动的游客',
    '冬季无头灯和GPS装备的游客',
  ],

  philosophy: SJ_LONGYEARBYEN_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: false,
    level: 'medium',
  },

  metadata: {
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 15,
    estimatedDuration: 1,
    vehicleRequired: 'none',
    polarBearRisk: true,
    weaponRequired: true,
    testId: 'SJ_LONGYEARBYEN',
    philosophy: SJ_LONGYEARBYEN_PHILOSOPHY,
  },
};
