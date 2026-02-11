/**
 * RouteDirection Fixture: 斯瓦尔巴冰川探险
 * Svalbard Glacier Expedition
 *
 * 路线性质：高山冰川多日探险，需要专业技能
 * RouteDirection 判断：推荐给有冰川徒步和爬冰技能的探险者
 *
 * @source knowledge-base/svalbard/routes/glacier-expedition.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const SJ_GLACIER_EXPEDITION_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '斯瓦尔巴冰川探险是北极高山冰川体验，在冰川上露营、爬冰、跨冰裂缝',
  mustVisitTags: ['冰川露营', '爬冰技能', '极昼', '冰裂缝穿越', '北极极端条件'],
  nonNegotiableRules: [
    '⚠️ 必须有冰川和爬冰专业技能',
    '⚠️ 必须携带冰爪、冰镐、安全绳等专业装备',
    '⚠️ 必须跟随有北极经验的向导',
    '⚠️ 必须携带武器防御北极熊',
    '⚠️ 绝对不能单独行动',
  ],
  flexibleParts: [
    '可选择5-7天或7-10天路线',
    '可根据冰川条件调整路线',
    '可选择不同的目标冰川',
  ],
  durationFlexibility: {
    minDays: 5,
    maxDays: 10,
    preferredDays: 7,
  },
};

export const SJ_GLACIER_EXPEDITION: RouteDirection = {
  name: 'SJ_GLACIER_EXPEDITION',
  nameCN: '冰川探险',
  nameEN: 'Svalbard Glacier Expedition',
  countryCode: 'SJ',
  regions: ['Spitsbergen'],
  entryHubs: ['Longyearbyen'],
  tags: ['冰川', '爬冰', '多日探险', '极昼', '北极极端'],

  seasonality: {
    bestMonths: [7, 8],
    avoidMonths: [],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 800,
      rapidAscentForbidden: false,
      requiresGuide: true,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 1500,
      maxDailyAscentM: 600,
      bufferTimeMin: 240,
    },
    objectives: {
      preferViewpoints: 0.4,
      preferPhotography: 0.2,
      preferCulture: 0.0,
      preferNature: 0.4,
    },
  },

  signaturePois: {
    examples: ['glacier_camps', 'ice_climbing_routes', 'crevasse_fields', 'arctic_summit'],
    weights: {
      glacier_camps: 1.0,
      ice_climbing_routes: 0.9,
      crevasse_fields: 0.8,
      arctic_summit: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [2, 3, 4, 5],
    typicalFailureReason: ['crevasse_fall', 'extreme_weather', 'polar_bear_encounter', 'altitude_exhaustion'],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 2,
        reason: '冰裂缝坠落',
        typicalUserProfile: '低估冰裂缝隐蔽性、无绳组经验的登冰者',
        mitigation: 'AI必须强调：冰川上必须全程绳组行动，任何时刻都不能离开绳组',
      },
      {
        day: 3,
        reason: '北极熊遭遇导致营地被迫撤离',
        typicalUserProfile: '低估北极熊风险、无武器防护的探险者',
        mitigation: 'AI应强调：必须携带武器，每晚必须设置熊警卫轮班',
      },
      {
        day: 4,
        reason: '极端天气（暴风雪、白出）导致迷向',
        typicalUserProfile: '天气转变突然、无极地经验的探险者',
        mitigation: 'AI应每天监测天气，如有极端天气预警立即建议返回',
      },
    ],
  },

  narrative: {
    internal: '斯瓦尔巴冰川探险是最危险的北极体验，需要专业能力',
    userFacing: '在北极冰川上露营、爬冰，体验极昼下的冰川极地探险',
    philosophy: SJ_GLACIER_EXPEDITION_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '无冰川和爬冰经验的游客',
    '无北极探险经验的游客',
    '不愿携带武器的游客',
    '独自行动的探险者',
  ],

  philosophy: SJ_GLACIER_EXPEDITION_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [7, 8],
    level: 'extreme',
  },

  metadata: {
    routeType: 'MOUNTAINEERING',
    totalDistanceKm: 60,
    estimatedDuration: 7,
    vehicleRequired: 'none',
    polarBearRisk: true,
    weaponRequired: true,
    testId: 'SJ_GLACIER_EXPEDITION',
    philosophy: SJ_GLACIER_EXPEDITION_PHILOSOPHY,
  },
};
