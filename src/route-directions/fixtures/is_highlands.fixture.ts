/**
 * RouteDirection Fixture: 冰岛内陆高地F路
 * Highlands F-Roads Extreme Adventure
 *
 * 路线性质：冰岛最极端的自驾体验，完全无人区
 * RouteDirection 判断：仅推荐给经验丰富的极限探险者
 *
 * @source knowledge-base/iceland/routes/highlands.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const IS_HIGHLANDS_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '内陆高地F路是冰岛最极端的挑战，完全无人区、河流穿越、极限天气',
  mustVisitTags: ['Landmannalaugar彩色火山', 'Þórsmörk雷神之谷', '完全无人区', '极致荒野体验'],
  nonNegotiableRules: [
    '必须驾驶四驱车（法律要求），违反者罚款',
    '仅夏季（6月中旬至9月中旬）开放，其他时间违法进入',
    '至少2车同行，强烈推荐携带PLB定位信标',
    '必须有河流穿越经验，无经验者必须雇佣向导',
    '准备3天额外食物、水、燃料，购买含搜救的保险',
  ],
  flexibleParts: [
    '可3天快速、5天标准或7天深度路线',
    '可选择Landmannalaugar环线或Askja火山口湖',
    '可灵活调整停留地点',
  ],
  durationFlexibility: {
    minDays: 3,
    maxDays: 7,
    preferredDays: 5,
  },
};

export const IS_HIGHLANDS: RouteDirection = {
  name: 'IS_HIGHLANDS',
  nameCN: '冰岛内陆高地F路',
  nameEN: 'Highlands F-Roads Extreme Adventure',
  countryCode: 'IS',
  regions: ['Central Highlands'],
  entryHubs: ['Reykjavik'],
  tags: ['F路', '四驱车', '河流穿越', '极限探险', '极致荒野', '经验要求高'],

  seasonality: {
    bestMonths: [7, 8],
    avoidMonths: [10, 11, 12, 1, 2, 3, 4, 5, 6],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 500,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 700,
      maxDailyAscentM: 500,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.25,
      preferPhotography: 0.25,
      preferCulture: 0.1,
      preferNature: 0.4,
    },
  },

  signaturePois: {
    examples: ['landmannalaugar', 'thorsmark', 'askja_caldera', 'kerlingarfjoll'],
    weights: {
      landmannalaugar: 1.0,
      thorsmark: 1.0,
      askja_caldera: 0.8,
      kerlingarfjoll: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [1, 2, 3],
    typicalFailureReason: ['river_crossing_failure', 'vehicle_failure', 'weather', 'altitude'],
    rescueDifficulty: 'VERY_HIGH',
    failureScenarios: [
      {
        day: 1,
        reason: '河流穿越失败导致车辆被冲走',
        typicalUserProfile: '低估河流风险、无穿越经验的驾驶者',
        mitigation: 'AI必须强调河流穿越是高地最危险的挑战，必须要有经验或雇佣向导',
      },
      {
        day: 2,
        reason: '极端天气变化（30分钟从晴天变暴风雪）',
        typicalUserProfile: '低估高地天气变化的用户',
        mitigation: 'AI必须明确：高地天气极端多变，需购买含搜救的保险',
      },
      {
        day: 3,
        reason: '完全无通讯导致紧急救援延误',
        typicalUserProfile: '无PLB或卫星电话的探险者',
        mitigation: 'AI强烈推荐携带PLB定位信标或卫星电话',
      },
    ],
  },

  narrative: {
    internal: '高地是冰岛最极端的路线，仅适合经验丰富的极限探险者，有多个致命风险',
    userFacing: '冰岛最极端的探险，完全无人区、河流穿越、彩色火山和冰川valley',
    philosophy: IS_HIGHLANDS_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '首次来冰岛的游客',
    '无四驱驾驶经验者',
    '无河流穿越经验者（除非雇佣向导）',
    '非夏季访问者',
    '独自旅行者',
    '无PLB/卫星电话者',
  ],

  philosophy: IS_HIGHLANDS_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: true,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'extreme',
  },

  metadata: {
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 500,
    estimatedDuration: 5,
    vehicleRequired: '4x4',
    guideRecommended: true,
    testId: 'IS_HIGHLANDS',
    philosophy: IS_HIGHLANDS_PHILOSOPHY,
  },
};
