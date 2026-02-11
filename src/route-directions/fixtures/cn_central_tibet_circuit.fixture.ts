/**
 * RouteDirection Fixture: 西藏中部高海拔环线
 * Central Tibet High Altitude Circuit
 *
 * 路线性质：西藏中部高原环线，纳木措、羊湖、珠峰等多个高原湖泊和雪山
 * RouteDirection 判断：推荐给想体验西藏高原、有高海拔经验的游客
 *
 * @source knowledge-base/tibet/routes/central-tibet-circuit.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const CN_CENTRAL_TIBET_CIRCUIT_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '西藏中部是高原湖泊和雪山的天堂，纳木措、羊湖、珠峰大本营组成西藏最美环线',
  mustVisitTags: ['纳木措', '羊湖', '珠峰大本营', '念青唐古拉山', '高原湖泊'],
  nonNegotiableRules: [
    '⚠️ 必须有高海拔经验（3500-5200m）',
    '⚠️ 高反风险极高，必须随身携带高反药物',
    '⚠️ 必须进行充分的海拔适应',
    '⚠️ 必须遵守环保规则，不污染高原',
    '⚠️ 绝对不能独自行动',
  ],
  flexibleParts: [
    '可8-14天灵活安排',
    '可选择自驾或跟团',
    '可根据身体状况调整节奏',
    '可选择珠峰大本营或普通环线',
  ],
  durationFlexibility: {
    minDays: 8,
    maxDays: 14,
    preferredDays: 10,
  },
};

export const CN_CENTRAL_TIBET_CIRCUIT: RouteDirection = {
  name: 'CN_CENTRAL_TIBET_CIRCUIT',
  nameCN: '西藏中部高海拔环线',
  nameEN: 'Central Tibet High Altitude Circuit',
  countryCode: 'CN',
  regions: ['Central Tibet'],
  entryHubs: ['Lhasa', 'Gyangtse', 'Kathmandu'],
  tags: ['高原', '湖泊', '雪山', '高海拔', '环线'],

  seasonality: {
    bestMonths: [5, 6, 7, 8, 9],
    avoidMonths: [10, 11, 12, 1, 2, 3, 4],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 500,
      rapidAscentForbidden: true,
      requiresGuide: false,
      requiresPermit: true,
    },
    soft: {
      maxElevationM: 5200,
      maxDailyAscentM: 300,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.4,
      preferPhotography: 0.3,
      preferCulture: 0.2,
      preferNature: 0.1,
    },
  },

  signaturePois: {
    examples: ['namtso_lake', 'yamdrok_lake', 'everest_base_camp', 'nyenchen_tanglha_mountain'],
    weights: {
      namtso_lake: 1.0,
      yamdrok_lake: 1.0,
      everest_base_camp: 0.9,
      nyenchen_tanglha_mountain: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [1, 2, 3],
    typicalFailureReason: ['altitude_sickness', 'acute_mountain_sickness', 'weather', 'road_closure'],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 1,
        reason: '到达拉萨当晚即出现严重高反',
        typicalUserProfile: '从低海拔直接飞到拉萨(3656m)、无高反准备的游客',
        mitigation: 'AI必须强调：到达拉萨第一天必须休息适应，不能剧烈运动，最早第二天开始活动',
      },
      {
        day: 2,
        reason: '前往纳木措（4718m）途中出现高反',
        typicalUserProfile: '未充分适应、快速上升的游客',
        mitigation: 'AI应建议：拉萨至少停留2-3天再前往纳木措，每次升高不超过500m',
      },
      {
        day: 3,
        reason: '恶劣天气导致珠峰大本营无法到达或道路关闭',
        typicalUserProfile: '未检查天气和道路状况的游客',
        mitigation: 'AI应每日检查道路和天气状况，珠峰地区5月和9月天气最优',
      },
    ],
  },

  narrative: {
    internal: '西藏中部高原美景绝美，但高反是最大挑战',
    userFacing: '环游西藏最美的高原湖泊和雪山，体验世界屋脊的壮阔风光',
    philosophy: CN_CENTRAL_TIBET_CIRCUIT_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '对高反敏感的游客',
    '无高海拔经验的游客',
    '心脏或肺部疾病患者',
    '冬季前往的游客',
  ],

  philosophy: CN_CENTRAL_TIBET_CIRCUIT_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: true,
    roadClosure: true,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [5, 6, 7, 8, 9],
    level: 'challenging',
  },

  metadata: {
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 1500,
    estimatedDuration: 10,
    vehicleRequired: 'jeep',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'CN_CENTRAL_TIBET_CIRCUIT',
    philosophy: CN_CENTRAL_TIBET_CIRCUIT_PHILOSOPHY,
  },
};
