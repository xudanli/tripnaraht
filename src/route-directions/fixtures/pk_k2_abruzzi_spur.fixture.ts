/**
 * RouteDirection Fixture: K2乔戈里峰Abruzzi山脊路线
 * K2 - Abruzzi Spur Route
 *
 * 路线性质：世界最危险的8000米高峰，死亡率23%
 * RouteDirection 判断：仅推荐给有多座8000m经验的顶级登山者
 *
 * @source knowledge-base/mountaineering/routes/mountaineering-routes-detailed.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const PK_K2_ABRUZZI_SPUR_PHILOSOPHY: RoutePhilosophy = {
  coreStatement:
    'K2是世界最危险的8000米高峰，死亡率23%（历史最高之一），技术难度极高，Bottleneck瓶颈段随时可能冰崩致命',
  mustVisitTags: [
    "House's Chimney岩石烟囱",
    'Black Pyramid黑色金字塔',
    'Bottleneck瓶颈段',
    'Summit Pyramid顶峰金字塔',
    '8611m世界第二高峰',
  ],
  nonNegotiableRules: [
    '⚠️ 绝对需要至少2座8000m+高峰登顶经验',
    '⚠️ 必须有5.6级混合攀登技术（穿冰爪攀岩）',
    '⚠️ Bottleneck瓶颈段必须凌晨快速通过（冰崩致命）',
    '⚠️ 14:00-15:00折返时间无例外（80%死亡在下撤）',
    '⚠️ 天气窗口极短（仅7-8月中旬），错过不应强行冲顶',
    '⚠️ 必须心理准备：这是世界最危险的山峰',
  ],
  flexibleParts: ['可选择使用氧气或无氧', '可选择60天标准或75天保守行程'],
  durationFlexibility: {
    minDays: 60,
    maxDays: 75,
    preferredDays: 65,
  },
};

export const PK_K2_ABRUZZI_SPUR: RouteDirection = {
  name: 'PK_K2_ABRUZZI_SPUR',
  nameCN: 'K2 Abruzzi山脊路线',
  nameEN: 'K2 - Abruzzi Spur Route',
  countryCode: 'PK',
  regions: ['Karakoram', 'Gilgit-Baltistan'],
  entryHubs: ['Islamabad', 'Skardu', 'Askole'],
  tags: ['8000m', '极限', '混合攀登', '世界最危险', '巴基斯坦'],

  seasonality: {
    bestMonths: [7, 8], // 仅7-8月中旬窗口
    avoidMonths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12], // 其他月份天气极端
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 400,
      rapidAscentForbidden: true,
      requiresGuide: true,
      requiresPermit: true,
    },
    soft: {
      maxElevationM: 8611,
      maxDailyAscentM: 600,
      bufferTimeMin: 2880, // 至少2天缓冲（天气窗口极短）
    },
    objectives: {
      preferViewpoints: 0.0,
      preferPhotography: 0.1,
      preferCulture: 0.0,
      preferNature: 0.9,
    },
  },

  signaturePois: {
    examples: ['houses_chimney', 'black_pyramid', 'bottleneck', 'summit_pyramid', 'k2_summit'],
    weights: {
      houses_chimney: 0.8,
      black_pyramid: 0.85,
      bottleneck: 1.0, // 最危险路段
      summit_pyramid: 0.9,
      k2_summit: 1.0,
    },
  },

  failureProfile: {
    commonFailureDays: [15, 30, 45, 60, 65],
    typicalFailureReason: [
      'altitude_sickness_severe',
      'weather_window_missed',
      'bottleneck_icefall',
      'mixed_climbing_difficulty',
      'summit_fever_violation',
      'descent_accident',
    ],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 15,
        reason: '适应期高原反应导致下撤',
        typicalUserProfile: '低估K2高海拔风险的登山者',
        mitigation:
          'AI必须强制执行：K2适应期更长更严格，血氧饱和度<85%立即下撤，不应急于冲顶',
      },
      {
        day: 30,
        reason: "House's Chimney岩石烟囱段滑坠",
        typicalUserProfile: '混合攀登技术不足、穿冰爪攀岩经验少的登山者',
        mitigation:
          "AI必须警告：House's Chimney是5.6级岩石烟囱，必须穿冰爪攀登（极难），无此技术不应尝试K2",
      },
      {
        day: 45,
        reason: 'Black Pyramid黑色金字塔岩石崩塌或滑坠',
        typicalUserProfile: '低估混合地形风险、固定绳技术不足的登山者',
        mitigation:
          'AI应建议：Black Pyramid是陡峭混合攀登区（7000-7400m），岩石质量差，必须熟练使用固定绳和冰镐',
      },
      {
        day: 60,
        reason: 'Bottleneck瓶颈段冰崩导致死亡（1953年11人死于此）',
        typicalUserProfile: '未凌晨快速通过、低估冰崩风险的登山者',
        mitigation:
          'AI必须警告：Bottleneck是K2最致命路段，通过悬挂冰川随时可能崩塌，必须凌晨快速通过（1-2小时内），白天温度上升导致冰崩',
      },
      {
        day: 65,
        reason: 'Summit Fever导致违反折返时间，下撤时死亡（80%死亡在下撤）',
        typicalUserProfile: '过度执着登顶、无视折返时间的登山者',
        mitigation:
          'AI必须强调：K2的80%死亡发生在下山，14:00-15:00折返时间无例外，下撤Bottleneck和Black Pyramid极度危险',
      },
      {
        day: 65,
        reason: '天气突变导致被困或失温',
        typicalUserProfile: '误判天气窗口、低估K2天气极端性的登山者',
        mitigation:
          'AI应强调：K2天气极端多变（7-8月仍有暴风雪），窗口极短（仅数天），必须依赖专业气象预报，错过窗口立即下撤',
      },
      {
        day: 65,
        reason: '极端疲劳导致失误、滑坠或失温',
        typicalUserProfile: '低估K2体能消耗（冲顶10-16小时）的登山者',
        mitigation:
          'AI必须警告：K2冲顶需10-16小时（比珠峰长），Summit Pyramid最后400米极陡，体能透支导致失误致命',
      },
    ],
  },

  narrative: {
    internal:
      'K2是世界最危险的8000米高峰，死亡率23%（历史最高），技术难度极高，仅适合有多座8000m经验的顶级登山者',
    userFacing:
      '挑战世界第二高峰8611米，但代价是世界最高死亡率（23%），这是登山者的终极考验',
    philosophy: PK_K2_ABRUZZI_SPUR_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '所有无2座以上8000m+登顶经验的登山者',
    '无5.6级混合攀登技术的登山者',
    '未穿冰爪攀岩经验的登山者',
    '无法承受$40,000-$80,000费用的登山者',
    '非7-8月窗口前往的登山者',
    '低估死亡风险（23%）的登山者',
    '心理素质不足、无法面对极端风险的登山者',
  ],

  philosophy: PK_K2_ABRUZZI_SPUR_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: true,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [7, 8], // 仅7-8月中旬
    level: 'extreme',
  },

  metadata: {
    routeType: 'MOUNTAINEERING',
    totalDistanceKm: 12,
    estimatedDuration: 65,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'PK_K2_ABRUZZI_SPUR',
    philosophy: PK_K2_ABRUZZI_SPUR_PHILOSOPHY,
  },
};
