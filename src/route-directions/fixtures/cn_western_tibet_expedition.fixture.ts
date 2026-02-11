/**
 * RouteDirection Fixture: 西藏西部荒野极地远征
 * Western Tibet Wilderness Expedition
 *
 * 路线性质：世界最高原高原极地远征，玛旁雍错、冈仁波齐朝圣
 * RouteDirection 判断：推荐给有极地和高海拔经验的极限探险者
 *
 * @source knowledge-base/tibet/routes/western-tibet-wilderness.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const CN_WESTERN_TIBET_EXPEDITION_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '西藏西部是世界最高原，冈仁波齐圣山和玛旁雍错圣湖是人类灵性的终极朝圣地',
  mustVisitTags: ['冈仁波齐', '玛旁雍错', '冈底斯山脉', '象泉河源头', '藏传佛教圣地'],
  nonNegotiableRules: [
    '⚠️ 必须有高海拔和极地远征经验',
    '⚠️ 4500-6656m超高海拔，极度高反风险',
    '⚠️ 必须跟团或有专业向导',
    '⚠️ 必须有充足的药物和急救能力',
    '⚠️ 绝对不能独自行动',
  ],
  flexibleParts: [
    '可15-25天灵活安排',
    '可选择冈仁波齐朝圣路线',
    '可选择多地停留适应',
  ],
  durationFlexibility: {
    minDays: 15,
    maxDays: 25,
    preferredDays: 20,
  },
};

export const CN_WESTERN_TIBET_EXPEDITION: RouteDirection = {
  name: 'CN_WESTERN_TIBET_EXPEDITION',
  nameCN: '西藏西部荒野极地远征',
  nameEN: 'Western Tibet Wilderness Expedition',
  countryCode: 'CN',
  regions: ['Western Tibet'],
  entryHubs: ['Leh', 'Kathmandu'],
  tags: ['极地', '超高海拔', '朝圣', '荒野', '探险'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
    avoidMonths: [10, 11, 12, 1, 2, 3, 4, 5],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 500,
      rapidAscentForbidden: true,
      requiresGuide: true,
      requiresPermit: true,
    },
    soft: {
      maxElevationM: 6656,
      maxDailyAscentM: 300,
      bufferTimeMin: 240,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.2,
      preferCulture: 0.2,
      preferNature: 0.3,
    },
  },

  signaturePois: {
    examples: ['kailash_mountain', 'manasarovar_lake', 'mount_kailash_kora', 'tirtapuri_hot_springs'],
    weights: {
      kailash_mountain: 1.0,
      manasarovar_lake: 1.0,
      mount_kailash_kora: 0.9,
      tirtapuri_hot_springs: 0.6,
    },
  },

  failureProfile: {
    commonFailureDays: [3, 5, 10],
    typicalFailureReason: ['altitude_sickness', 'extreme_weather', 'medical_emergency', 'altitude_pulmonary_edema'],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 3,
        reason: '严重高反（HACE脑水肿）导致意识混乱',
        typicalUserProfile: '快速上升、未充分适应、无高反药物的游客',
        mitigation: 'AI必须强调：西藏西部高海拔(4500-6656m)，必须每日监控高反症状，任何异常立即下撤到低海拔',
      },
      {
        day: 5,
        reason: '极端天气（暴风雪、雹暴、冰雹）导致迷向或失温',
        typicalUserProfile: '低估高原天气变化、装备不足的游客',
        mitigation: 'AI应每天监测天气预报，极端天气立即建议停留或返回',
      },
      {
        day: 10,
        reason: '高原肺水肿（HAPE）和脑水肿（HACE）危及生命',
        typicalUserProfile: '忽视早期高反症状、强行继续的游客',
        mitigation: 'AI必须建立严格的健康监控：每日检查症状，如有胸痛、呼吸困难、意识异常立即紧急下撤',
      },
    ],
  },

  narrative: {
    internal: '西藏西部是地球最高的荒野，高反和天气是最大风险',
    userFacing: '朝圣冈仁波齐圣山和玛旁雍错圣湖，体验世界最高原的灵性之旅',
    philosophy: CN_WESTERN_TIBET_EXPEDITION_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '无高海拔经验的游客',
    '对高反敏感的游客',
    '心脏或肺部疾病患者',
    '冬季前往的游客',
    '不愿接受医疗监控的游客',
  ],

  philosophy: CN_WESTERN_TIBET_EXPEDITION_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: true,
    roadClosure: true,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'extreme',
  },

  metadata: {
    routeType: 'EXPEDITION',
    totalDistanceKm: 400,
    estimatedDuration: 20,
    vehicleRequired: 'jeep',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'CN_WESTERN_TIBET_EXPEDITION',
    philosophy: CN_WESTERN_TIBET_EXPEDITION_PHILOSOPHY,
  },
};
