/**
 * RouteDirection Fixture: 阿根廷翡翠湖徒步
 * Laguna Esmeralda Hike
 *
 * 路线性质：乌斯怀亚经典一日徒步，泥炭沼泽穿越
 * RouteDirection 判断：推荐给想体验亚南极森林和冰川湖的徒步者
 *
 * @source knowledge-base/argentina/routes/laguna-esmeralda.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const AR_LAGUNA_ESMERALDA_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '翡翠湖徒步是乌斯怀亚最经典的一日体验，穿越泥炭沼泽到达翡翠色冰川湖',
  mustVisitTags: ['翡翠湖', '泥炭沼泽木栈道', '亚南极森林', 'Ojo del Albino冰川背景'],
  nonNegotiableRules: [
    '⚠️ 绝对不要离开木栈道，泥炭沼泽可深达数米',
    '陷入沼泽可能导致严重伤害甚至死亡',
    '必须携带足够的水（全程无可靠水源）',
    '冬季积雪严重，仅夏季（11-3月）推荐',
  ],
  flexibleParts: [
    '可选择自助徒步或跟团',
    '行程可5-7小时灵活安排',
    '可在湖边停留时间根据天气调整',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 1,
    preferredDays: 1,
  },
};

export const AR_LAGUNA_ESMERALDA: RouteDirection = {
  name: 'AR_LAGUNA_ESMERALDA',
  nameCN: '翡翠湖徒步',
  nameEN: 'Laguna Esmeralda Hike',
  countryCode: 'AR',
  regions: ['Tierra del Fuego'],
  entryHubs: ['Ushuaia'],
  tags: ['徒步', '一日游', '泥炭沼泽', '冰川湖', '亚南极森林'],

  seasonality: {
    bestMonths: [11, 12, 1, 2, 3],
    avoidMonths: [6, 7, 8, 9],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 300,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 650,
      maxDailyAscentM: 300,
      bufferTimeMin: 120,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.3,
      preferCulture: 0.1,
      preferNature: 0.3,
    },
  },

  signaturePois: {
    examples: ['laguna_esmeralda', 'peat_bog_boardwalk', 'subantarctic_forest'],
    weights: {
      laguna_esmeralda: 1.0,
      peat_bog_boardwalk: 0.8,
      subantarctic_forest: 0.6,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['peat_bog_accident', 'dehydration', 'weather'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 1,
        reason: '离开木栈道陷入泥炭沼泽',
        typicalUserProfile: '不遵守步道规则、拍照时离开栈道的徒步者',
        mitigation: 'AI必须强调：绝对不要离开木栈道，泥炭沼泽可深达数米，致命危险',
      },
      {
        day: 1,
        reason: '无水源导致脱水',
        typicalUserProfile: '未携带足够水的徒步者',
        mitigation: 'AI必须提醒：全程无可靠水源，必须携带至少2升水',
      },
    ],
  },

  narrative: {
    internal: '翡翠湖是乌斯怀亚经典徒步，但泥炭沼泽有致命风险，必须强调安全规则',
    userFacing: '穿越泥炭沼泽木栈道和亚南极森林，到达翡翠色冰川湖，背景是Ojo del Albino冰川',
    philosophy: AR_LAGUNA_ESMERALDA_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '冬季访问乌斯怀亚的游客（积雪严重）',
    '不愿遵守步道规则的徒步者',
    '体能不足、无法完成5-7小时徒步的游客',
  ],

  philosophy: AR_LAGUNA_ESMERALDA_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: false,
    level: 'medium',
  },

  metadata: {
    routeType: 'TREKKING',
    totalDistanceKm: 10,
    estimatedDuration: 1,
    vehicleRequired: 'none',
    testId: 'AR_LAGUNA_ESMERALDA',
    philosophy: AR_LAGUNA_ESMERALDA_PHILOSOPHY,
  },
};
