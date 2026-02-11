/**
 * RouteDirection Fixture: 罗弗敦群岛经典徒步
 * Lofoten Islands Hiking Combination
 *
 * 路线性质：包含罗弗敦最经典的几条徒步路线组合
 * RouteDirection 判断：推荐给喜欢山峰和隐秘海滩的徒步者
 *
 * @source knowledge-base/lofoten-islands/routes/徒步路线.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const NO_LOFOTEN_HIKING_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '罗弗敦徒步是北极高山和隐秘海滩的完美组合，从Reinebringen的360度全景到Kvalvika的北极白沙',
  mustVisitTags: ['Reinebringen峰', 'Kvalvika隐秘海滩', 'Ryten山峰', 'Henningsvær北极威尼斯', '北极午夜太阳'],
  nonNegotiableRules: [
    '⚠️ 所有路线都需要防滑登山靴',
    '⚠️ 天气变化极快，必须准备全套雨具',
    '⚠️ 冬季（11月-4月）积雪严重，只建议夏季',
    '⚠️ 必须时刻检查海上天气变化',
  ],
  flexibleParts: [
    '可选择1-2天组合不同路线',
    '可选择快速登顶或停留观景',
    '可根据天气调整路线',
    '可选择自助或跟团',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 2,
    preferredDays: 1,
  },
};

export const NO_LOFOTEN_HIKING: RouteDirection = {
  name: 'NO_LOFOTEN_HIKING',
  nameCN: '罗弗敦群岛经典徒步',
  nameEN: 'Lofoten Islands Hiking Combination',
  countryCode: 'NO',
  regions: ['Lofoten Islands'],
  entryHubs: ['Reine', 'Henningsvær'],
  tags: ['徒步', '山峰', '海滩', '北极', '午夜太阳'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
    avoidMonths: [11, 12, 1, 2, 3, 4, 5],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 543,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 543,
      maxDailyAscentM: 543,
      bufferTimeMin: 120,
    },
    objectives: {
      preferViewpoints: 0.5,
      preferPhotography: 0.3,
      preferCulture: 0.1,
      preferNature: 0.1,
    },
  },

  signaturePois: {
    examples: ['reinebringen_peak', 'ryten_kvalvika_beach', 'henningsvær_viewpoint', 'arctic_midnight_sun'],
    weights: {
      reinebringen_peak: 1.0,
      ryten_kvalvika_beach: 0.95,
      henningsvær_viewpoint: 0.9,
      arctic_midnight_sun: 0.8,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['weather', 'sea_change', 'overestimation'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 1,
        reason: '天气突然转变导致迷向或不安全',
        typicalUserProfile: '未检查天气预报、过度估计体力的游客',
        mitigation: 'AI应每天检查天气预报，北极天气在数分钟内可能剧变，建议提前返回',
      },
      {
        day: 1,
        reason: 'Kvalvika海滩涉水时被冷水意外冲走',
        typicalUserProfile: '低估北极海水温度和浪高的游客',
        mitigation: 'AI必须警告：北极海水温度极低（致命），严格不要进入海水',
      },
    ],
  },

  narrative: {
    internal: '罗弗敦徒步是北极最美徒步，但天气和北极海环境有风险',
    userFacing: '徒步罗弗敦最经典的山峰和隐秘海滩，体验北极午夜太阳和独特地貌',
    philosophy: NO_LOFOTEN_HIKING_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '冬季前往的游客',
    '无防滑登山靴的游客',
    '体能不足的游客',
    '不愿听从天气警告的游客',
  ],

  philosophy: NO_LOFOTEN_HIKING_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'medium',
  },

  metadata: {
    routeType: 'TREKKING',
    totalDistanceKm: 20,
    estimatedDuration: 1,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'NO_LOFOTEN_HIKING',
    philosophy: NO_LOFOTEN_HIKING_PHILOSOPHY,
  },
};
