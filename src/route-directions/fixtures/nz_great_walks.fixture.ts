/**
 * RouteDirection Fixture: 新西兰伟大步道
 * New Zealand Great Walks
 *
 * 路线性质：新西兰最经典的多日徒步系统，9条不同难度的路线
 * RouteDirection 判断：推荐给想体验新西兰自然、有徒步经验的游客
 *
 * @source knowledge-base/new-zealand/routes/great-walks.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const NZ_GREAT_WALKS_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '新西兰伟大步道是南半球最经典的多日徒步系统，雨林、山峰、冰川、湖泊完整体验',
  mustVisitTags: ['Milford Track', 'Routeburn Track', 'Kepler Track', '雨林穿越', '新西兰自然遗产'],
  nonNegotiableRules: [
    '⚠️ 必须预订山屋或营地（提前1-3个月）',
    '⚠️ 新西兰天气多变，必须准备全套雨具',
    '⚠️ 长距离徒步需要良好体能',
    '⚠️ 绝对不能独自完成多日徒步',
  ],
  flexibleParts: [
    '可选择不同难度的伟大步道（3-5天不同路线）',
    '可选择自助或跟团',
    '可选择不同季节前往',
  ],
  durationFlexibility: {
    minDays: 3,
    maxDays: 5,
    preferredDays: 4,
  },
};

export const NZ_GREAT_WALKS: RouteDirection = {
  name: 'NZ_GREAT_WALKS',
  nameCN: '伟大步道',
  nameEN: 'New Zealand Great Walks',
  countryCode: 'NZ',
  regions: ['Fiordland', 'Mount Aspiring', 'Aoraki'],
  entryHubs: ['Queenstown', 'Glenorchy', 'Te Anau'],
  tags: ['徒步', '多日', '雨林', '山峰', '冰川'],

  seasonality: {
    bestMonths: [11, 12, 1, 2, 3, 4],
    avoidMonths: [6, 7, 8, 9],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 800,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 2000,
      maxDailyAscentM: 700,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.4,
      preferPhotography: 0.3,
      preferCulture: 0.1,
      preferNature: 0.2,
    },
  },

  signaturePois: {
    examples: ['milford_sound', 'routeburn_flats', 'kepler_mountain', 'lake_manapouri'],
    weights: {
      milford_sound: 1.0,
      routeburn_flats: 0.9,
      kepler_mountain: 0.8,
      lake_manapouri: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [1, 2, 3],
    typicalFailureReason: ['weather', 'exhaustion', 'hut_unavailable', 'dehydration'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 1,
        reason: '未预订山屋导致无处住宿',
        typicalUserProfile: '未提前预订的徒步者',
        mitigation: 'AI必须强调：伟大步道山屋必须提前1-3个月预订',
      },
      {
        day: 2,
        reason: '恶劣天气导致被困或无法继续',
        typicalUserProfile: '低估新西兰天气变化的游客',
        mitigation: 'AI应提醒：新西兰天气在5分钟内可能完全改变，必须准备全套雨具',
      },
      {
        day: 3,
        reason: '长距离徒步导致体力不支',
        typicalUserProfile: '高估自身体能的徒步者',
        mitigation: 'AI应建议：伟大步道每天需要6-8小时徒步，需要良好基础体能',
      },
    ],
  },

  narrative: {
    internal: '伟大步道是新西兰最经典的徒步，但天气变化大',
    userFacing: '完成新西兰最经典的伟大步道系统，体验南半球独特的山地和雨林生态',
    philosophy: NZ_GREAT_WALKS_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '不愿提前预订的游客',
    '冬季前往的游客',
    '体能不足的游客',
    '对雨林不感兴趣的游客',
  ],

  philosophy: NZ_GREAT_WALKS_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: true,
    weatherWindow: true,
    weatherWindowMonths: [11, 12, 1, 2, 3, 4],
    level: 'moderate',
  },

  metadata: {
    routeType: 'TREKKING',
    totalDistanceKm: 80,
    estimatedDuration: 4,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'NZ_GREAT_WALKS',
    philosophy: NZ_GREAT_WALKS_PHILOSOPHY,
  },
};
