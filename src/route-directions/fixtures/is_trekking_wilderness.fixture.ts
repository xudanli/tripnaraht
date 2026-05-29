/**
 * RouteDirection Fixture: 冰岛荒野徒步探险
 * Iceland Wilderness Trekking Adventure
 *
 * 路线性质：多日无人区徒步，需要野营和自给能力
 * RouteDirection 判断：推荐给有徒步经验、喜欢野营的极限爱好者
 *
 * @source knowledge-base/iceland/routes/trekking-wilderness.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const IS_TREKKING_WILDERNESS_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '冰岛荒野徒步是与原始自然最亲密的接触，多日野营在火山地形和冰川脚下',
  mustVisitTags: ['多日野营', '火山地形', '冰川河流穿越', '无人区', '完全自给'],
  nonNegotiableRules: [
    '⚠️ 必须有多日徒步和野营经验',
    '⚠️ 必须携带专业帐篷、睡袋和防寒装备',
    '⚠️ 必须知道如何涉水过河（冰川河流致命）',
    '⚠️ 绝对不能单独行动',
    '⚠️ 必须有PLB（个人定位信标）或卫星通讯',
  ],
  flexibleParts: [
    '可选择5-7天或7-10天路线',
    '可根据天气和体力调整每日公里数',
    '可选择不同的高地路线组合',
  ],
  durationFlexibility: {
    minDays: 5,
    maxDays: 10,
    preferredDays: 7,
  },
};

export const IS_TREKKING_WILDERNESS: RouteDirection = {
  name: 'IS_TREKKING_WILDERNESS',
  nameCN: '荒野徒步探险',
  nameEN: 'Iceland Wilderness Trekking Adventure',
  countryCode: 'IS',
  regions: ['Highlands'],
  entryHubs: ['Reykjavik'],
  tags: ['徒步', '野营', '多日', '冰川', '无人区'],

  seasonality: {
    bestMonths: [7, 8, 9],
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
      maxElevationM: 1200,
      maxDailyAscentM: 500,
      bufferTimeMin: 240,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.2,
      preferCulture: 0.0,
      preferNature: 0.5,
    },
  },

  signaturePois: {
    examples: ['landmannalaugar_geothermal', 'thorsmork_wilderness', 'glacier_river_crossing', 'volcanic_plateau'],
    weights: {
      landmannalaugar_geothermal: 0.9,
      thorsmork_wilderness: 0.8,
      glacier_river_crossing: 0.9,
      volcanic_plateau: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [2, 3, 4, 5],
    typicalFailureReason: ['river_crossing_failure', 'extreme_weather', 'injury', 'altitude_exhaustion'],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 2,
        reason: '冰川河流涉水失败，游客被冲走',
        typicalUserProfile: '低估冰川河流风险、无涉水经验的徒步者',
        mitigation: 'AI必须警告：冰川河流可能在数小时内因冰川融水暴涨，涉水极其危险，必须有专业指导',
      },
      {
        day: 3,
        reason: '极端天气（风暴、冰雹）导致失温或迷路',
        typicalUserProfile: '低估冰岛天气变化、装备不足的游客',
        mitigation: 'AI应每日检查天气预报，如有极端天气预警应强制建议取消或延期',
      },
      {
        day: 4,
        reason: '疲劳和高海拔导致决策能力下降',
        typicalUserProfile: '过度估计自身体力、无多日徒步经验的游客',
        mitigation: 'AI应监控进度，如落后计划应建议更早休息或加速',
      },
    ],
  },

  narrative: {
    internal: '冰岛荒野徒步是最极端的冰岛体验，但风险非常高',
    userFacing: '多日野营在冰岛火山高地和冰川脚下，体验完全的荒野沉浸',
    philosophy: IS_TREKKING_WILDERNESS_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '无徒步和野营经验的游客',
    '无PLB或通讯设备的游客',
    '独自行动的徒步者',
    '装备不专业的游客',
  ],

  philosophy: IS_TREKKING_WILDERNESS_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [7, 8, 9],
    level: 'extreme',
  },

  metadata: {
    routeType: 'TREKKING',
    totalDistanceKm: 80,
    estimatedDuration: 7,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'IS_TREKKING_WILDERNESS',
    philosophy: IS_TREKKING_WILDERNESS_PHILOSOPHY,
    laugavegurCorridor: true,
    demoPolylinePoiIds: [
      'froad-landmannalaugar',
      'hut-landmannalaugar',
      'hut-nyidalur',
      'froad-thorsmork',
      'hut-thorsmork',
    ],
    demoSupplyPoiIds: ['hut-landmannalaugar', 'hut-nyidalur', 'hut-thorsmork'],
  },
};
