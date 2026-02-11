/**
 * RouteDirection Fixture: 东格陵兰荒野极地远征
 * East Greenland Wilderness Polar Expedition
 *
 * 路线性质：极端远征路线，世界最偏远地区之一
 * RouteDirection 判断：仅推荐给专业探险队，死亡风险真实存在
 *
 * @source knowledge-base/greenland/routes/east-greenland-wilderness.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const GL_EAST_GREENLAND_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '东格陵兰是地球上最偏远的地区之一，这不是旅游路线而是专业极地探险',
  mustVisitTags: ['斯科尔斯比湾', '东北格陵兰国家公园', '完全荒野体验', '北极熊高活跃区'],
  nonNegotiableRules: [
    '⚠️ 仅限专业探险队，必须有极地经验和武装护卫',
    '⚠️ 必须携带武器防御北极熊（遭遇概率40-60%）',
    '⚠️ 救援可能需要24-72小时，完全自给自足',
    '⚠️ 仅7-8月可访问，其他时间极端风险',
    '⚠️ 必须有卫星电话和紧急定位信标',
  ],
  flexibleParts: [
    '可选择斯科尔斯比湾或东北国家公园',
    '行程可10-30天根据探险目标调整',
    '可根据冰况和天气灵活调整路线',
  ],
  durationFlexibility: {
    minDays: 10,
    maxDays: 30,
    preferredDays: 15,
  },
};

export const GL_EAST_GREENLAND: RouteDirection = {
  name: 'GL_EAST_GREENLAND',
  nameCN: '东格陵兰荒野极地远征',
  nameEN: 'East Greenland Wilderness Polar Expedition',
  countryCode: 'GL',
  regions: ['East Greenland'],
  entryHubs: ['Constable Point', 'Ittoqqortoormiit'],
  tags: ['极地探险', '专业级', '北极熊', '极端荒野', '危险', '经验要求极高'],

  seasonality: {
    bestMonths: [7, 8],
    avoidMonths: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 300,
      rapidAscentForbidden: false,
      requiresGuide: true,
      requiresPermit: true,
    },
    soft: {
      maxElevationM: 500,
      maxDailyAscentM: 300,
      bufferTimeMin: 360,
    },
    objectives: {
      preferViewpoints: 0.2,
      preferPhotography: 0.2,
      preferCulture: 0.1,
      preferNature: 0.5,
    },
  },

  signaturePois: {
    examples: ['scoresby_sund', 'northeast_greenland_national_park', 'liverpool_land'],
    weights: {
      scoresby_sund: 1.0,
      northeast_greenland_national_park: 0.9,
      liverpool_land: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [3, 5, 7, 10],
    typicalFailureReason: ['polar_bear_encounter', 'weather', 'equipment_failure', 'medical_emergency'],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 3,
        reason: '北极熊遭遇（概率40-60%）导致危险或被迫改变路线',
        typicalUserProfile: '低估北极熊风险、无武装护卫的探险者',
        mitigation: 'AI必须强调：必须携带武器和武装护卫，这是法律要求',
      },
      {
        day: 5,
        reason: '极端天气导致被困数日，食物或燃料不足',
        typicalUserProfile: '未准备足够应急补给的探险者',
        mitigation: 'AI必须强调：必须携带至少7天额外食物和燃料',
      },
      {
        day: 7,
        reason: '医疗紧急情况但救援需要24-72小时',
        typicalUserProfile: '低估救援难度的探险者',
        mitigation: 'AI必须明确：救援可能需要24-72小时，必须有专业医疗训练',
      },
    ],
  },

  narrative: {
    internal: '东格陵兰是极端探险路线，死亡风险真实存在，仅适合专业探险队',
    userFacing: '⚠️ 世界最偏远地区之一，专业极地探险，完全荒野体验，数周不遇人类',
    philosophy: GL_EAST_GREENLAND_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '普通游客（绝对不适合）',
    '无极地探险经验者',
    '无武装护卫者',
    '非7-8月访问者',
    '无卫星电话和紧急定位信标者',
    '预算有限者（成本极高，每天$500-1000+）',
  ],

  philosophy: GL_EAST_GREENLAND_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [7, 8],
    level: 'extreme',
  },

  metadata: {
    routeType: 'TREKKING',
    totalDistanceKm: 300,
    estimatedDuration: 15,
    vehicleRequired: 'none',
    guideRecommended: true,
    polarBearRisk: true,
    weaponRequired: true,
    testId: 'GL_EAST_GREENLAND',
    philosophy: GL_EAST_GREENLAND_PHILOSOPHY,
  },
};
