/**
 * RouteDirection Fixture: 格陵兰伊卢利萨特冰峡湾UNESCO世界遗产探险
 * Ilulissat Ice Fjord UNESCO World Heritage Expedition
 *
 * 路线性质：世界最活跃冰川地带，UNESCO世界遗产
 * RouteDirection 判断：格陵兰最标志性体验，必须跟团，有冰崩风险
 *
 * @source knowledge-base/greenland/routes/ilulissat-ice-fjord.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const GL_ILULISSAT_ICE_FJORD_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '伊卢利萨特冰峡湾是全球最活跃的冰川之一，每天产生大量冰山，是格陵兰的标志性体验',
  mustVisitTags: ['Sermeq Kujalleq冰川', 'UNESCO世界遗产', '冰山景观', '因纽特文化'],
  nonNegotiableRules: [
    '必须跟团，不可独自前往冰峡湾',
    '皮划艇活动需中级以上技能和冷水救生装备',
    '必须尊重冰崩安全距离，听从向导指挥',
    '夏季（6-9月）才可访问，冬季冰层不稳定',
  ],
  flexibleParts: [
    '可选择船游、皮划艇或徒步多种方式',
    '行程可1-3天灵活安排',
    '可与伊卢利萨特镇观光结合',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 3,
    preferredDays: 2,
  },
};

export const GL_ILULISSAT_ICE_FJORD: RouteDirection = {
  name: 'GL_ILULISSAT_ICE_FJORD',
  nameCN: '伊卢利萨特冰峡湾UNESCO世界遗产探险',
  nameEN: 'Ilulissat Ice Fjord UNESCO World Heritage Expedition',
  countryCode: 'GL',
  regions: ['West Greenland'],
  entryHubs: ['Ilulissat'],
  tags: ['冰川', 'UNESCO世界遗产', '皮划艇', '船游', '徒步', '极地探险'],

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
      maxDailyAscentM: 100,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.3,
      preferCulture: 0.2,
      preferNature: 0.2,
    },
  },

  signaturePois: {
    examples: ['sermeq_kujalleq_glacier', 'ilulissat_icefjord', 'disko_bay'],
    weights: {
      sermeq_kujalleq_glacier: 1.0,
      ilulissat_icefjord: 1.0,
      disko_bay: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['weather', 'ice_calving'],
    rescueDifficulty: 'HIGH',
    failureScenarios: [
      {
        day: 1,
        reason: '皮划艇活动中冷水失温或冰崩风险',
        typicalUserProfile: '低估冷水风险或无中级皮划艇经验的用户',
        mitigation: 'AI必须询问皮划艇经验和冷水救生装备，强烈建议新手选择船游',
      },
      {
        day: 1,
        reason: '冬季访问冰层不稳定导致危险',
        typicalUserProfile: '冬季访问的用户',
        mitigation: 'AI必须明确告知仅夏季（6-9月）可安全访问',
      },
    ],
  },

  narrative: {
    internal: '伊卢利萨特是格陵兰最标志性体验，但有冰崩和冷水风险，必须跟团且夏季访问',
    userFacing: '世界最活跃的冰川地带，UNESCO世界遗产，结合皮划艇、船游和徒步的极地探险',
    philosophy: GL_ILULISSAT_ICE_FJORD_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '冬季访问格陵兰的游客',
    '不愿跟团的独立旅行者',
    '无皮划艇经验但坚持要皮划艇的用户',
  ],

  philosophy: GL_ILULISSAT_ICE_FJORD_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'high',
  },

  metadata: {
    routeType: 'ADVENTURE_DRIVE',
    totalDistanceKm: 40,
    estimatedDuration: 2,
    vehicleRequired: 'none',
    guideRecommended: true,
    testId: 'GL_ILULISSAT_ICE_FJORD',
    philosophy: GL_ILULISSAT_ICE_FJORD_PHILOSOPHY,
  },
};
