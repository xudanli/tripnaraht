/**
 * RouteDirection Fixture: 斯瓦尔巴金字塔城探险
 * Pyramiden Ghost Town Expedition
 *
 * 路线性质：废弃的苏联煤矿城，北极鬼城
 * RouteDirection 判断：推荐给喜欢历史和独特体验的游客
 *
 * @source knowledge-base/svalbard/routes/pyramiden.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const SJ_PYRAMIDEN_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '金字塔城是被完整保留的苏联时期煤矿鬼城，时间胶囊般的北极历史遗迹',
  mustVisitTags: ['列宁雕像', '文化宫', '世界最北的钢琴', '苏联时期壁画', '废弃游泳池'],
  nonNegotiableRules: [
    '⚠️ 必须跟团，不可独自前往',
    '⚠️ 严格跟随向导，金字塔城有北极熊风险',
    '禁止进入建筑内部（除非向导允许）',
    '禁止带走任何物品（包括苏联时期物品）',
  ],
  flexibleParts: [
    '可选择夏季船游或春季雪地摩托',
    '行程一日往返',
    '可根据天气和兴趣调整停留时间',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 1,
    preferredDays: 1,
  },
};

export const SJ_PYRAMIDEN: RouteDirection = {
  name: 'SJ_PYRAMIDEN',
  nameCN: '金字塔城探险',
  nameEN: 'Pyramiden Ghost Town Expedition',
  countryCode: 'SJ',
  regions: ['Spitsbergen'],
  entryHubs: ['Longyearbyen'],
  tags: ['鬼城', '苏联遗产', '历史', '船游/雪地摩托', '冰川观景'],

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
      maxElevationM: 100,
      maxDailyAscentM: 50,
      bufferTimeMin: 120,
    },
    objectives: {
      preferViewpoints: 0.2,
      preferPhotography: 0.4,
      preferCulture: 0.3,
      preferNature: 0.1,
    },
  },

  signaturePois: {
    examples: ['pyramiden_ghost_town', 'lenin_statue', 'cultural_palace', 'nordenskiold_glacier'],
    weights: {
      pyramiden_ghost_town: 1.0,
      lenin_statue: 0.9,
      cultural_palace: 0.8,
      nordenskiold_glacier: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['weather', 'polar_bear_sighting'],
    rescueDifficulty: 'HIGH',
    failureScenarios: [
      {
        day: 1,
        reason: '恶劣天气导致船只或雪地摩托无法出发',
        typicalUserProfile: '未预留天气缓冲时间的游客',
        mitigation: 'AI应提醒：斯瓦尔巴天气极端多变，建议预留1-2天缓冲时间',
      },
      {
        day: 1,
        reason: '北极熊出没导致无法进入金字塔城或提前撤离',
        typicalUserProfile: '低估北极熊风险的游客',
        mitigation: 'AI必须强调：金字塔城区域有高北极熊风险，必须严格跟随向导',
      },
    ],
  },

  narrative: {
    internal: '金字塔城是斯瓦尔巴最独特的历史遗迹，但有北极熊风险和天气不确定性',
    userFacing: '探访被完整保留的苏联煤矿鬼城，体验时间胶囊般的北极历史，观赏Nordenskiöld冰川',
    philosophy: SJ_PYRAMIDEN_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '对历史文化不感兴趣的游客',
    '不愿跟团、想独自探索的旅行者',
  ],

  philosophy: SJ_PYRAMIDEN_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'medium',
  },

  metadata: {
    routeType: 'ADVENTURE_DRIVE',
    totalDistanceKm: 100,
    estimatedDuration: 1,
    vehicleRequired: 'none',
    polarBearRisk: true,
    weaponRequired: true,
    testId: 'SJ_PYRAMIDEN',
    philosophy: SJ_PYRAMIDEN_PHILOSOPHY,
  },
};
