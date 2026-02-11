/**
 * RouteDirection Fixture: 多洛米蒂Alta Via 1
 * Dolomites Alta Via 1
 *
 * 路线性质：意大利多洛米蒂山脉经典高线路，岩石塔林和Rifugio系统
 * RouteDirection 判断：推荐给喜欢岩石地貌、有高山徒步经验的游客
 *
 * @source knowledge-base/italy/routes/dolomites-alta-via-1.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const IT_DOLOMITES_AV1_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '多洛米蒂Alta Via 1是意大利最经典的高线徒步，穿越岩石塔林和Rifugio山屋系统',
  mustVisitTags: ['Lagazuoi缆车', 'Rifugio山屋', '岩石塔林', 'Dolomite岩石地貌', 'Via Ferrata铁索路'],
  nonNegotiableRules: [
    '⚠️ 必须预订Rifugio床位（旺季提前2-3个月）',
    '⚠️ 必须有高山徒步经验',
    '⚠️ Via Ferrata铁索路需要专业装备和技能',
    '⚠️ 天气恶劣必须在Rifugio等待',
  ],
  flexibleParts: [
    '可选择7-12天完成',
    '可选择部分路段使用缆车',
    '可选择是否挑战Via Ferrata铁索路',
    '可选择Rifugio或露营',
  ],
  durationFlexibility: {
    minDays: 7,
    maxDays: 12,
    preferredDays: 10,
  },
};

export const IT_DOLOMITES_AV1: RouteDirection = {
  name: 'IT_DOLOMITES_AV1',
  nameCN: '多洛米蒂Alta Via 1',
  nameEN: 'Dolomites Alta Via 1',
  countryCode: 'IT',
  regions: ['Dolomites'],
  entryHubs: ['Venice', 'Bolzano', 'Cortina d\'Ampezzo'],
  tags: ['徒步', '多日', '岩石地貌', 'Via Ferrata', 'Rifugio'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
    avoidMonths: [10, 11, 12, 1, 2, 3, 4, 5],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 1000,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 2752,
      maxDailyAscentM: 800,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.5,
      preferPhotography: 0.3,
      preferCulture: 0.0,
      preferNature: 0.2,
    },
  },

  signaturePois: {
    examples: ['lagazuoi_cable_car', 'rifugio_lagazuoi', 'croda_da_lago', 'passo_giau'],
    weights: {
      lagazuoi_cable_car: 0.9,
      rifugio_lagazuoi: 1.0,
      croda_da_lago: 0.8,
      passo_giau: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [3, 5, 7],
    typicalFailureReason: ['exhaustion', 'weather', 'rifugio_unavailable', 'via_ferrata_failure'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 3,
        reason: 'Via Ferrata铁索路无经验导致恐高或失误',
        typicalUserProfile: '无Via Ferrata经验、恐高的徒步者',
        mitigation: 'AI应询问：是否有Via Ferrata经验，如无应建议跟团或跳过铁索路段',
      },
      {
        day: 5,
        reason: 'Rifugio床位未预订导致无处住宿',
        typicalUserProfile: '未提前预订的徒步者',
        mitigation: 'AI必须强调：Rifugio必须提前2-3个月预订',
      },
      {
        day: 7,
        reason: '极端天气导致高海拔路段无法通过',
        typicalUserProfile: '未检查天气、强行通过的徒步者',
        mitigation: 'AI应每日监控天气，如有极端天气应建议在Rifugio等待',
      },
    ],
  },

  narrative: {
    internal: '多洛米蒂Alta Via 1是意大利最经典的徒步，但Via Ferrata需要技能',
    userFacing: '穿越多洛米蒂岩石塔林，体验意大利Rifugio山屋系统和Via Ferrata铁索路',
    philosophy: IT_DOLOMITES_AV1_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '无高山徒步经验的游客',
    '恐高的游客',
    '不愿提前预订的游客',
    '冬季前往的游客',
  ],

  philosophy: IT_DOLOMITES_AV1_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'challenging',
  },

  metadata: {
    routeType: 'TREKKING',
    totalDistanceKm: 120,
    estimatedDuration: 10,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'IT_DOLOMITES_AV1',
    philosophy: IT_DOLOMITES_AV1_PHILOSOPHY,
  },
};
