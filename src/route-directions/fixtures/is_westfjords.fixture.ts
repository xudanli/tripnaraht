/**
 * RouteDirection Fixture: 冰岛西峡湾
 * West Fjords Explorer
 *
 * 路线性质：冰岛最偏远地区，未被游客破坏的荒野
 * RouteDirection 判断：推荐给二次访问冰岛、追求深度体验的探险者
 *
 * @source knowledge-base/iceland/routes/westfjords.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const IS_WESTFJORDS_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '西峡湾是冰岛最后的荒野，保留了最原始的风景和最少的游客',
  mustVisitTags: ['Dynjandi瀑布', 'Látrabjarg海鸟悬崖', '红沙滩', '极度荒野'],
  nonNegotiableRules: [
    '仅夏季（6-8月）可行，冬季道路关闭',
    'Ísafjörður是唯一主要补给点，必须规划燃料和食物',
    '大部分区域无手机信号，需离线地图和PLB',
    '需中级以上驾驶经验，四驱车推荐',
  ],
  flexibleParts: [
    '可3天快速、5天舒适或7天深度体验',
    '可选择徒步Hornstrandir自然保护区',
    '可灵活选择停留地点',
  ],
  durationFlexibility: {
    minDays: 3,
    maxDays: 7,
    preferredDays: 5,
  },
};

export const IS_WESTFJORDS: RouteDirection = {
  name: 'IS_WESTFJORDS',
  nameCN: '冰岛西峡湾',
  nameEN: 'West Fjords Explorer',
  countryCode: 'IS',
  regions: ['West Fjords'],
  entryHubs: ['Reykjavik'],
  tags: ['自驾', '荒野', '海鸟', '冒险', '偏远地带', '二次访问'],

  seasonality: {
    bestMonths: [6, 7, 8],
    avoidMonths: [9, 10, 11, 12, 1, 2, 3, 4, 5],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 0,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 300,
      maxDailyAscentM: 100,
      bufferTimeMin: 150,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.3,
      preferCulture: 0.1,
      preferNature: 0.3,
    },
  },

  signaturePois: {
    examples: ['dynjandi_waterfall', 'latrabjarg_cliffs', 'hornstrandir_wilderness'],
    weights: {
      dynjandi_waterfall: 1.0,
      latrabjarg_cliffs: 0.9,
      hornstrandir_wilderness: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [2, 3, 4],
    typicalFailureReason: ['road_closure', 'fuel_logistics', 'weather'],
    rescueDifficulty: 'HIGH',
    failureScenarios: [
      {
        day: 2,
        reason: 'Ísafjörður之后燃料规划不足导致困境',
        typicalUserProfile: '未在Ísafjörður加满油的自驾者',
        mitigation: 'AI必须强调Ísafjörður是唯一补给点，必须加满油',
      },
      {
        day: 3,
        reason: '无手机信号导致迷路或紧急救援延误',
        typicalUserProfile: '依赖手机导航、未下载离线地图的用户',
        mitigation: 'AI必须强调需离线地图和PLB设备',
      },
    ],
  },

  narrative: {
    internal: '西峡湾是冰岛最偏远和最原始的地区，仅适合经验丰富的自驾者',
    userFacing: '冰岛最后的荒野，保留了最原始的峡湾风景和最少的游客干扰',
    philosophy: IS_WESTFJORDS_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '首次来冰岛的游客',
    '驾驶经验不足的自驾者',
    '冬季访问冰岛的游客',
    '无PLB设备的探险者',
  ],

  philosophy: IS_WESTFJORDS_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: true,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8],
    level: 'high',
  },

  metadata: {
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 950,
    estimatedDuration: 5,
    vehicleRequired: 'standard',
    testId: 'IS_WESTFJORDS',
    philosophy: IS_WESTFJORDS_PHILOSOPHY,
  },
};
