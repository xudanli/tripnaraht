/**
 * RouteDirection Fixture: 格陵兰迪斯科湾浮冰探险
 * Disko Bay Iceberg Expedition
 *
 * 路线性质：世界最大浮冰场之一，提供船游、皮划艇等探索方式
 * RouteDirection 判断：推荐给想深度体验格陵兰冰山的用户
 *
 * @source knowledge-base/greenland/routes/disko-bay.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const GL_DISKO_BAY_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '迪斯科湾是世界最大浮冰场之一，在浮冰间划皮划艇与百米高冰山面对面',
  mustVisitTags: ['迪斯科湾浮冰区', '百米高冰山', '迪斯科岛温泉', '因纽特渔村'],
  nonNegotiableRules: [
    '必须跟团，不可独自前往浮冰区',
    '保持至少500米距离远离大型不稳定冰山',
    '仅夏季（6-9月）可访问，冬季冰封',
    '皮划艇活动需向导评估天气和冰况',
  ],
  flexibleParts: [
    '可选择船游、皮划艇或徒步多种方式',
    '行程可2-5天灵活安排',
    '可加入迪斯科岛温泉和渔村访问',
  ],
  durationFlexibility: {
    minDays: 2,
    maxDays: 5,
    preferredDays: 3,
  },
};

export const GL_DISKO_BAY: RouteDirection = {
  name: 'GL_DISKO_BAY',
  nameCN: '迪斯科湾浮冰探险',
  nameEN: 'Disko Bay Iceberg Expedition',
  countryCode: 'GL',
  regions: ['West Greenland', 'Disko Bay'],
  entryHubs: ['Ilulissat'],
  tags: ['浮冰', '冰山', '皮划艇', '船游', '温泉', '鲸鱼观察'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
    avoidMonths: [10, 11, 12, 1, 2, 3, 4, 5],
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
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.4,
      preferCulture: 0.15,
      preferNature: 0.15,
    },
  },

  signaturePois: {
    examples: ['disko_bay_ice_field', 'disko_island', 'qasigiannguit_village'],
    weights: {
      disko_bay_ice_field: 1.0,
      disko_island: 0.8,
      qasigiannguit_village: 0.6,
    },
  },

  failureProfile: {
    commonFailureDays: [1, 2],
    typicalFailureReason: ['weather', 'ice_conditions'],
    rescueDifficulty: 'HIGH',
    failureScenarios: [
      {
        day: 1,
        reason: '天气恶化或冰况不佳导致活动取消',
        typicalUserProfile: '未预留天气缓冲时间的游客',
        mitigation: 'AI应提醒格陵兰天气多变，建议预留1-2天缓冲时间',
      },
      {
        day: 2,
        reason: '皮划艇活动中靠近不稳定冰山导致危险',
        typicalUserProfile: '不听从向导指挥、擅自靠近冰山的用户',
        mitigation: 'AI必须强调必须保持500米安全距离，听从向导指挥',
      },
    ],
  },

  narrative: {
    internal: '迪斯科湾是格陵兰最壮观的浮冰区之一，适合想深度体验冰山的用户',
    userFacing: '在世界最大浮冰场之一划皮划艇，与百米高冰山面对面，探索迪斯科岛温泉和因纽特渔村',
    philosophy: GL_DISKO_BAY_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '冬季访问格陵兰的游客（冰封）',
    '不愿跟团的独立旅行者',
    '时间紧迫、无法预留天气缓冲的游客',
  ],

  philosophy: GL_DISKO_BAY_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'medium-high',
  },

  metadata: {
    routeType: 'ADVENTURE_DRIVE',
    totalDistanceKm: 100,
    estimatedDuration: 3,
    vehicleRequired: 'none',
    guideRecommended: true,
    testId: 'GL_DISKO_BAY',
    philosophy: GL_DISKO_BAY_PHILOSOPHY,
  },
};
