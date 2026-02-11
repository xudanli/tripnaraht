/**
 * RouteDirection Fixture: 勃朗峰环线
 * Tour du Mont Blanc
 *
 * 路线性质：欧洲最经典的多日徒步，穿越法国、瑞士、意大利三国
 * RouteDirection 判断：推荐给有多日徒步经验、体能良好的徒步者
 *
 * @source knowledge-base/alps/routes/tour-du-mont-blanc.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const TMB_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '勃朗峰环线（TMB）是阿尔卑斯最经典的徒步路线，11天170公里环绕欧洲之巅',
  mustVisitTags: ['Col de la Seigne山口', 'Lac Blanc', 'Aiguille du Midi缆车', '三国边界', 'Alpine木屋'],
  nonNegotiableRules: [
    '⚠️ 必须预订山屋床位（旺季提前3-6个月）',
    '⚠️ 必须有多日高山徒步经验',
    '⚠️ 必须携带专业徒步装备',
    '⚠️ 天气恶劣必须在山屋等待',
  ],
  flexibleParts: [
    '可选择7-11天完成',
    '可逆时针或顺时针',
    '可选择部分路段使用缆车',
    '可选择山屋或帐篷（部分区域）',
  ],
  durationFlexibility: {
    minDays: 7,
    maxDays: 11,
    preferredDays: 10,
  },
};

export const TMB_TOUR_DU_MONT_BLANC: RouteDirection = {
  name: 'TMB_TOUR_DU_MONT_BLANC',
  nameCN: '勃朗峰环线',
  nameEN: 'Tour du Mont Blanc',
  countryCode: 'FR',
  regions: ['Chamonix', 'Courmayeur', 'Champex'],
  entryHubs: ['Geneva', 'Chamonix'],
  tags: ['徒步', '多日', '高山', '跨国', 'TMB'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
    avoidMonths: [10, 11, 12, 1, 2, 3, 4, 5],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 1200,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 2665,
      maxDailyAscentM: 1000,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.4,
      preferPhotography: 0.2,
      preferCulture: 0.1,
      preferNature: 0.3,
    },
  },

  signaturePois: {
    examples: ['col_de_la_seigne', 'lac_blanc', 'aiguille_du_midi', 'mont_blanc_massif'],
    weights: {
      col_de_la_seigne: 0.9,
      lac_blanc: 0.8,
      aiguille_du_midi: 0.9,
      mont_blanc_massif: 1.0,
    },
  },

  failureProfile: {
    commonFailureDays: [3, 5, 7],
    typicalFailureReason: ['exhaustion', 'weather', 'refuge_unavailable', 'injury'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 3,
        reason: '体力不支导致无法继续',
        typicalUserProfile: '高估自身体能、未做充分准备的徒步者',
        mitigation: 'AI应建议：TMB需要每天6-8小时徒步，必须有多日徒步经验',
      },
      {
        day: 5,
        reason: '山屋床位未预订导致无处住宿',
        typicalUserProfile: '未提前预订床位的徒步者',
        mitigation: 'AI必须强调：旺季山屋必须提前3-6个月预订',
      },
      {
        day: 7,
        reason: '极端天气导致高海拔山口无法通过',
        typicalUserProfile: '未检查天气、强行通过的徒步者',
        mitigation: 'AI应每日监控天气，如有极端天气应建议在山屋等待或绕道',
      },
    ],
  },

  narrative: {
    internal: 'TMB是欧洲最经典的徒步，但需要良好体能和充分准备',
    userFacing: '11天环绕欧洲之巅勃朗峰，穿越法国、瑞士、意大利三国阿尔卑斯山地',
    philosophy: TMB_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '无多日徒步经验的游客',
    '体能不足的游客',
    '不愿提前预订的游客',
    '冬季前往的游客',
  ],

  philosophy: TMB_PHILOSOPHY,

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
    totalDistanceKm: 170,
    estimatedDuration: 10,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'TMB_TOUR_DU_MONT_BLANC',
    philosophy: TMB_PHILOSOPHY,
  },
};
