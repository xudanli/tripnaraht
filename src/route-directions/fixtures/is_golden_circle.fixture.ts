/**
 * RouteDirection Fixture: 冰岛黄金圈经典环线
 * Iceland Golden Circle Classic Route
 *
 * 路线性质：冰岛最成熟、最容易、最经典的一日自驾环线
 * RouteDirection 判断：强烈推荐给首次来冰岛的用户，风险极低
 *
 * @source knowledge-base/iceland/routes/golden-circle.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const IS_GOLDEN_CIRCLE_PHILOSOPHY: RoutePhilosophy = {
  coreStatement:
    '黄金圈是冰岛旅行的"必修课"，它将三个世界级地质奇观浓缩在一天的轻松环线中，是判断用户是否需要更深入冰岛体验的起点',
  mustVisitTags: [
    '辛格维利尔国家公园',
    '盖歇尔间歇泉',
    '黄金瀑布',
  ],
  nonNegotiableRules: [
    '不要靠近地热区的热泉边缘 -- 地面温度可超过100度，有致命烧伤风险',
    '瀑布观景台外禁止翻越栏杆 -- 湿滑的悬崖边缘极度危险',
    '冬季必须检查 road.is 路况 -- 冬季路面结冰可能导致事故',
  ],
  flexibleParts: [
    '凯瑞斯火山口湖为可选景点，可根据时间决定是否停留',
    '出发时间灵活，早出发避开人群，晚出发日落光线更美',
    '午餐可选景点附近餐厅或自带食物',
    '可与蓝湖温泉、南岸瀑布组合成2天行程',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 1,
    preferredDays: 1,
  },
};

export const IS_GOLDEN_CIRCLE: RouteDirection = {
  name: 'IS_GOLDEN_CIRCLE',
  nameCN: '黄金圈经典环线',
  nameEN: 'Golden Circle Classic Route',
  countryCode: 'IS',
  regions: ['Southwest Iceland'],
  entryHubs: ['Reykjavík'],
  tags: ['自驾', '经典', '一日游', '地质奇观', '初次访问'],

  seasonality: {
    bestMonths: [5, 6, 7, 8, 9],
    avoidMonths: [12, 1, 2],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 50,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 200,
      maxDailyAscentM: 50,
      bufferTimeMin: 120,
    },
    objectives: {
      preferViewpoints: 0.4,
      preferPhotography: 0.3,
      preferCulture: 0.2,
      preferNature: 0.1,
    },
  },

  signaturePois: {
    examples: ['thingvellir', 'geysir', 'gullfoss', 'kerid_crater'],
    weights: {
      thingvellir: 1.0,
      geysir: 1.0,
      gullfoss: 1.0,
      kerid_crater: 0.5,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['weather', 'logistics'],
    rescueDifficulty: 'LOW',
    failureScenarios: [
      {
        day: 1,
        reason: '冬季路面结冰导致驾驶困难或事故',
        typicalUserProfile: '无冰雪驾驶经验的游客',
        mitigation: 'AI必须在冬季提醒：检查road.is路况，租用四驱车+冬季轮胎',
      },
      {
        day: 1,
        reason: '旺季停车场爆满导致时间不够',
        typicalUserProfile: '旺季中午出发的游客',
        mitigation: 'AI应建议：早上8点前出发避开人群',
      },
      {
        day: 1,
        reason: '地热区烫伤事故',
        typicalUserProfile: '靠近热泉边缘或离开步道的游客',
        mitigation: 'AI必须明确警告：绝对不能靠近热泉边缘，地面温度可超过100度',
      },
    ],
  },

  narrative: {
    internal: '这条路线的价值不在于冒险或挑战，而在于以最低的门槛让用户理解冰岛地质的力量',
    userFacing: '冰岛最成熟、最容易的一日自驾环线，将三个世界级地质奇观浓缩在轻松的一天中',
    philosophy: IS_GOLDEN_CIRCLE_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '寻求人迹罕至的体验',
    '讨厌拥挤和商业化',
    '希望挑战自我',
    '更喜欢徒步而非开车',
    '已经来过冰岛多次',
  ],

  philosophy: IS_GOLDEN_CIRCLE_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: true,
    ferryDependent: false,
    weatherWindow: false,
    level: 'low',
  },

  metadata: {
    route_basic_info: { road_type: '柏油路' },
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 300,
    estimatedDuration: 1,
    vehicleRequired: '2wd',
    testId: 'IS_GOLDEN_CIRCLE',
    philosophy: IS_GOLDEN_CIRCLE_PHILOSOPHY,
    // 额外信息（从原始数据保留）
    loopRoute: true,
    physicalDemand: 'low',
    dailyWalkingKm: 2,
    crowdDensity: {
      peakSeason: 'very_high',
      shoulderSeason: 'medium',
      offSeason: 'low',
    },
    costEstimation: {
      currency: 'USD',
      budget: 130,
      standard: 180,
      premium: 280,
    },
  },
};
