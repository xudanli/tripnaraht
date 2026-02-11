/**
 * RouteDirection Fixture: Haute Route徒步
 * Haute Route (Chamonix to Zermatt)
 *
 * 路线性质：欧洲最经典的高线徒步，从勃朗峰到马特洪峰
 * RouteDirection 判断：推荐给有多日高山徒步经验、体能优秀的极限徒步者
 *
 * @source knowledge-base/alps/routes/haute-route.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const HAUTE_ROUTE_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: 'Haute Route是阿尔卑斯最经典的高线徒步，12天180公里从勃朗峰到马特洪峰',
  mustVisitTags: ['高山山口（多个3000m+）', '冰川穿越', '山屋系统', 'Grand Combin观景', '欧洲最美徒步'],
  nonNegotiableRules: [
    '⚠️ 必须有冰川穿越经验和技能',
    '⚠️ 必须预订山屋床位（提前3-6个月）',
    '⚠️ 必须有多日高山徒步经验',
    '⚠️ 必须携带冰爪、冰镐、安全绳等冰川装备',
    '⚠️ 天气恶劣必须在山屋等待',
  ],
  flexibleParts: [
    '可选择10-14天完成',
    '可选择Walker\'s Haute Route（无冰川）或Glacier Haute Route（冰川版）',
    '可选择部分路段使用缆车',
  ],
  durationFlexibility: {
    minDays: 10,
    maxDays: 14,
    preferredDays: 12,
  },
};

export const HAUTE_ROUTE: RouteDirection = {
  name: 'HAUTE_ROUTE',
  nameCN: 'Haute Route徒步',
  nameEN: 'Haute Route (Chamonix to Zermatt)',
  countryCode: 'FR',
  regions: ['Chamonix', 'Zermatt'],
  entryHubs: ['Geneva', 'Chamonix', 'Zermatt'],
  tags: ['徒步', '多日', '高山', '冰川', '极限'],

  seasonality: {
    bestMonths: [7, 8, 9],
    avoidMonths: [10, 11, 12, 1, 2, 3, 4, 5, 6],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 1500,
      rapidAscentForbidden: false,
      requiresGuide: true,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 3300,
      maxDailyAscentM: 1200,
      bufferTimeMin: 240,
    },
    objectives: {
      preferViewpoints: 0.5,
      preferPhotography: 0.2,
      preferCulture: 0.0,
      preferNature: 0.3,
    },
  },

  signaturePois: {
    examples: ['col_de_prafleuri', 'glacier_crossings', 'grand_combin', 'mont_blanc_massif'],
    weights: {
      col_de_prafleuri: 0.8,
      glacier_crossings: 1.0,
      grand_combin: 0.9,
      mont_blanc_massif: 0.9,
    },
  },

  failureProfile: {
    commonFailureDays: [4, 6, 8, 10],
    typicalFailureReason: ['glacier_crossing_failure', 'exhaustion', 'weather', 'altitude_sickness'],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 4,
        reason: '冰川穿越失败或冰裂缝坠落',
        typicalUserProfile: '无冰川穿越经验、无绳组技能的徒步者',
        mitigation: 'AI必须强调：Haute Route需要专业冰川技能，必须跟随向导',
      },
      {
        day: 6,
        reason: '体力不支导致无法继续',
        typicalUserProfile: '高估自身体能、未做充分准备的徒步者',
        mitigation: 'AI应建议：Haute Route需要每天8-10小时徒步，必须有TMB或类似经验',
      },
      {
        day: 8,
        reason: '高海拔山口（3000m+）出现高反或天气恶劣',
        typicalUserProfile: '未适应高海拔、强行通过的徒步者',
        mitigation: 'AI应每日监控天气和用户状态，如有异常应建议在山屋休息',
      },
    ],
  },

  narrative: {
    internal: 'Haute Route是欧洲最具挑战性的徒步，需要专业技能和极佳体能',
    userFacing: '从勃朗峰徒步到马特洪峰，穿越阿尔卑斯最美的高山地带和冰川',
    philosophy: HAUTE_ROUTE_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '无冰川穿越经验的游客',
    '无多日高山徒步经验的游客',
    '体能不足的游客',
    '不愿跟团的游客',
  ],

  philosophy: HAUTE_ROUTE_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: true,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [7, 8, 9],
    level: 'extreme',
  },

  metadata: {
    routeType: 'TREKKING',
    totalDistanceKm: 180,
    estimatedDuration: 12,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'HAUTE_ROUTE',
    philosophy: HAUTE_ROUTE_PHILOSOPHY,
  },
};
