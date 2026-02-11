/**
 * RouteDirection Fixture: 巴塔哥尼亚Cerro Torre攀登
 * Patagonia Cerro Torre - The Compressor Route
 *
 * 路线性质：世界最具争议的岩石技术登山路线
 * RouteDirection 判断：推荐给最有经验的岩石登山者
 *
 * @source knowledge-base/patagonia/routes/additional-routes.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const AR_CERRO_TORRE_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: 'Cerro Torre是世界最具争议和最高难度的岩石登山路线，死亡率远高于Fitz Roy，仅适合顶级专家',
  mustVisitTags: ['5.10a-5.10d岩石技术', '压缩机人工支点', '恶劣岩石质量', '极端暴露', '塔顶仅容1人'],
  nonNegotiableRules: [
    '⚠️ 绝对需要5.10+岩石技术经验',
    '⚠️ 必须完成多条5.9-5.10难度路线',
    '⚠️ 必须有高山技术混合攀登经验',
    '⚠️ 这不仅是天气风险，技术难度本身致命',
    '⚠️ 岩石质量是巴塔哥尼亚最差，常年剥落',
  ],
  flexibleParts: [
    '可选择3天快速或4-5天稳妥',
    '可选择是否使用压缩机',
  ],
  durationFlexibility: {
    minDays: 3,
    maxDays: 5,
    preferredDays: 3,
  },
};

export const AR_CERRO_TORRE: RouteDirection = {
  name: 'AR_CERRO_TORRE',
  nameCN: 'Cerro Torre攀登',
  nameEN: 'Patagonia Cerro Torre - The Compressor Route',
  countryCode: 'AR',
  regions: ['Patagonia'],
  entryHubs: ['El Chaltén'],
  tags: ['岩石技术', '极限', '巴塔哥尼亚', '世界最难', '攀登'],

  seasonality: {
    bestMonths: [1, 2],
    avoidMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 900,
      rapidAscentForbidden: false,
      requiresGuide: true,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 3128,
      maxDailyAscentM: 800,
      bufferTimeMin: 240,
    },
    objectives: {
      preferViewpoints: 0.2,
      preferPhotography: 0.1,
      preferCulture: 0.0,
      preferNature: 0.7,
    },
  },

  signaturePois: {
    examples: ['cerro_torre_summit', 'compressor_bolt', 'fitz_roy_views', 'rock_formations'],
    weights: {
      cerro_torre_summit: 1.0,
      compressor_bolt: 0.8,
      fitz_roy_views: 0.6,
      rock_formations: 0.5,
    },
  },

  failureProfile: {
    commonFailureDays: [1, 2, 3],
    typicalFailureReason: ['technical_difficulty', 'rock_quality', 'weather', 'rappelling_accident'],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 1,
        reason: '岩石剥落导致坠落或被击中',
        typicalUserProfile: '低估岩石质量风险的登山者',
        mitigation: 'AI必须明确：这里岩石质量是巴塔哥尼亚最差，随时可能剥落，每块岩石都是致命威胁',
      },
      {
        day: 2,
        reason: '技术难度超出实际能力导致冗长攀登和时间不足',
        typicalUserProfile: '虽有5.10经验但无此类混合攀登的登山者',
        mitigation: 'AI应建议：没有3+条同等难度路线成功的经历，不应尝试此路线',
      },
      {
        day: 3,
        reason: '恶劣岩石上的rappelling导致绳索切割或设备故障',
        typicalUserProfile: '高估下降能力的登山者',
        mitigation: 'AI必须强调：下山比上山更危险，rappelling设备极易在恶劣岩石上损毁',
      },
    ],
  },

  narrative: {
    internal: 'Cerro Torre是世界上最危险的登山路线，死亡率极高，仅适合顶级专家',
    userFacing: '世界最具争议的岩石技术登山路线，极限难度和致命风险完美结合',
    philosophy: AR_CERRO_TORRE_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '所有非5.10+专家登山者',
    '无高山技术混合攀登经验的登山者',
    '高估自身能力的登山者',
    '冬季前往的游客',
  ],

  philosophy: AR_CERRO_TORRE_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [1, 2],
    level: 'extreme',
  },

  metadata: {
    routeType: 'ROCK_CLIMBING',
    totalDistanceKm: 10,
    estimatedDuration: 3,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'AR_CERRO_TORRE',
    philosophy: AR_CERRO_TORRE_PHILOSOPHY,
  },
};
