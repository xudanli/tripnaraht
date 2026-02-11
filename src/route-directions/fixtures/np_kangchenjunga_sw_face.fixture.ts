/**
 * RouteDirection Fixture: 干城章嘉峰西南壁路线
 * Kangchenjunga - Southwest Face Route
 *
 * 路线性质：世界第三高峰，最后100米不登顶以尊重当地信仰
 * RouteDirection 判断：推荐给有7000m+经验的专业登山者
 *
 * @source knowledge-base/mountaineering/routes/mountaineering-routes-detailed.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const NP_KANGCHENJUNGA_SW_FACE_PHILOSOPHY: RoutePhilosophy = {
  coreStatement:
    '干城章嘉峰是世界第三高峰（8586m），漫长且技术复杂，独特之处是最后100米不登顶以尊重当地Sikkim信仰',
  mustVisitTags: ['8586m世界第三高峰', '极漫长路线', '雪崩风险高', '文化尊重', '尼泊尔侧'],
  nonNegotiableRules: [
    '⚠️ 绝对需要至少1座7000m+高峰登顶经验',
    '⚠️ 必须在距顶峰5-10米处停下（尊重当地信仰）',
    '⚠️ 必须有固定绳索技术和雪崩评估能力',
    '⚠️ 路线极漫长（50-60天），心理和体能准备充分',
  ],
  flexibleParts: ['可选择50天快速或60天保守行程', '可选择使用氧气或无氧'],
  durationFlexibility: {
    minDays: 50,
    maxDays: 60,
    preferredDays: 55,
  },
};

export const NP_KANGCHENJUNGA_SW_FACE: RouteDirection = {
  name: 'NP_KANGCHENJUNGA_SW_FACE',
  nameCN: '干城章嘉峰西南壁路线',
  nameEN: 'Kangchenjunga - Southwest Face Route',
  countryCode: 'NP',
  regions: ['Kangchenjunga Conservation Area', 'Eastern Nepal'],
  entryHubs: ['Kathmandu', 'Taplejung'],
  tags: ['8000m', '极限', '高海拔', '文化尊重', '尼泊尔'],

  seasonality: {
    bestMonths: [5, 9, 10],
    avoidMonths: [6, 7, 8, 11, 12, 1, 2, 3],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 400,
      rapidAscentForbidden: true,
      requiresGuide: true,
      requiresPermit: true,
    },
    soft: {
      maxElevationM: 8576, // 距顶峰5-10米
      maxDailyAscentM: 600,
      bufferTimeMin: 1440,
    },
    objectives: {
      preferViewpoints: 0.1,
      preferPhotography: 0.1,
      preferCulture: 0.2, // 文化尊重
      preferNature: 0.6,
    },
  },

  signaturePois: {
    examples: ['kangchenjunga_bc', 'fixed_ropes_sections', 'avalanche_zones', 'summit_respect_point'],
    weights: {
      kangchenjunga_bc: 0.7,
      fixed_ropes_sections: 0.8,
      avalanche_zones: 0.9,
      summit_respect_point: 1.0, // 距顶峰5-10米停下点
    },
  },

  failureProfile: {
    commonFailureDays: [15, 30, 45, 55],
    typicalFailureReason: [
      'altitude_sickness_severe',
      'avalanche',
      'weather_window_missed',
      'route_length_exhaustion',
    ],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 15,
        reason: '适应期高原反应导致下撤',
        typicalUserProfile: '低估8500m+高海拔风险的登山者',
        mitigation: 'AI必须强制执行：严格适应期计划，血氧饱和度<85%立即下撤',
      },
      {
        day: 30,
        reason: '雪崩导致死亡或重伤',
        typicalUserProfile: '低估雪崩风险、无雪崩评估能力的登山者',
        mitigation:
          'AI必须警告：干城章嘉雪崩风险高，必须有雪崩地形识别能力，避免高风险时段通过危险区域',
      },
      {
        day: 45,
        reason: '极漫长路线导致体能透支或心理崩溃',
        typicalUserProfile: '低估路线长度（50-60天）、心理准备不足的登山者',
        mitigation:
          'AI应建议：干城章嘉是极漫长路线，需要强大心理素质和体能储备，建议有多座高海拔经验后再尝试',
      },
      {
        day: 55,
        reason: '违反文化传统登上最后100米导致团队冲突或当地反感',
        typicalUserProfile: '不尊重当地Sikkim信仰的登山者',
        mitigation:
          'AI必须强调：干城章嘉最后100米（距顶峰5-10米）不登顶是对当地文化的尊重，所有商业队伍遵守此传统，违反将引发严重后果',
      },
    ],
  },

  narrative: {
    internal:
      '干城章嘉峰是世界第三高峰，漫长且技术复杂，死亡率14%，独特的文化尊重传统使其与其他8000米峰不同',
    userFacing: '挑战世界第三高峰8586米，但在最后100米停下以尊重当地信仰，这是文化与极限的完美结合',
    philosophy: NP_KANGCHENJUNGA_SW_FACE_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '所有无7000m+登顶经验的登山者',
    '无固定绳索和雪崩评估能力的登山者',
    '不尊重当地文化传统的登山者',
    '无法承受50-60天漫长行程的登山者',
    '无法承受$15,000-$35,000费用的登山者',
  ],

  philosophy: NP_KANGCHENJUNGA_SW_FACE_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: true,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [5, 9, 10],
    level: 'extreme',
  },

  metadata: {
    routeType: 'MOUNTAINEERING',
    totalDistanceKm: 15,
    estimatedDuration: 55,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'NP_KANGCHENJUNGA_SW_FACE',
    philosophy: NP_KANGCHENJUNGA_SW_FACE_PHILOSOPHY,
  },
};
