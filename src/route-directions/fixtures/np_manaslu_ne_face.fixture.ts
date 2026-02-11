/**
 * RouteDirection Fixture: 马纳斯鲁峰东北壁路线
 * Manaslu - Northeast Face Route
 *
 * 路线性质：中等难度但雪崩风险极高的8000米峰
 * RouteDirection 判断：推荐给有7000m+经验且具备雪崩评估能力的登山者
 *
 * @source knowledge-base/mountaineering/routes/mountaineering-routes-detailed.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const NP_MANASLU_NE_FACE_PHILOSOPHY: RoutePhilosophy = {
  coreStatement:
    '马纳斯鲁峰是中等难度的8000米峰，但雪崩风险极高（2012年雪崩11人死亡），近年成为珠峰替代选择',
  mustVisitTags: ['8163m世界第八高峰', '雪崩风险极高', '中等技术难度', '日本队首登', '尼泊尔'],
  nonNegotiableRules: [
    '⚠️ 绝对需要至少1座7000m+高峰登顶经验',
    '⚠️ 必须有雪崩地形识别和评估能力',
    '⚠️ 必须密切监测天气和雪况（雪崩主要死因）',
    '⚠️ 必须有专业向导和雪崩安全装备',
  ],
  flexibleParts: ['可选择40天快速或45天保守行程', '可选择使用氧气或无氧'],
  durationFlexibility: {
    minDays: 40,
    maxDays: 45,
    preferredDays: 42,
  },
};

export const NP_MANASLU_NE_FACE: RouteDirection = {
  name: 'NP_MANASLU_NE_FACE',
  nameCN: '马纳斯鲁峰东北壁路线',
  nameEN: 'Manaslu - Northeast Face Route',
  countryCode: 'NP',
  regions: ['Manaslu Conservation Area', 'Gorkha District'],
  entryHubs: ['Kathmandu', 'Arughat'],
  tags: ['8000m', '高海拔', '雪崩风险', '中等难度', '尼泊尔'],

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
      maxElevationM: 8163,
      maxDailyAscentM: 600,
      bufferTimeMin: 1440,
    },
    objectives: {
      preferViewpoints: 0.1,
      preferPhotography: 0.1,
      preferCulture: 0.0,
      preferNature: 0.8,
    },
  },

  signaturePois: {
    examples: ['manaslu_bc', 'avalanche_prone_zones', 'camp3', 'camp4', 'manaslu_summit'],
    weights: {
      manaslu_bc: 0.6,
      avalanche_prone_zones: 1.0, // 最危险区域
      camp3: 0.8,
      camp4: 0.85,
      manaslu_summit: 0.95,
    },
  },

  failureProfile: {
    commonFailureDays: [15, 30, 40],
    typicalFailureReason: [
      'avalanche',
      'altitude_sickness_severe',
      'weather_window_missed',
      'avalanche_risk_assessment_failure',
    ],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 15,
        reason: '适应期高原反应导致下撤',
        typicalUserProfile: '低估8000米高海拔风险的登山者',
        mitigation: 'AI必须强制执行：严格适应期计划，血氧饱和度<85%立即下撤',
      },
      {
        day: 30,
        reason: '雪崩导致死亡（2012年雪崩11人死亡，历史上多次致命雪崩）',
        typicalUserProfile: '低估雪崩风险、无雪崩评估能力的登山者',
        mitigation:
          'AI必须警告：马纳斯鲁雪崩风险极高（死亡率10%，主要死因是雪崩），2012年单次雪崩11人死亡，必须有专业雪崩评估能力和安全装备（探测仪、铲子、探杆）',
      },
      {
        day: 30,
        reason: '新雪后强行冲顶导致雪崩被埋',
        typicalUserProfile: '未监测雪况、低估新雪雪崩风险的登山者',
        mitigation:
          'AI应建议：新雪后必须等待至少24-48小时让雪层稳定，不应急于冲顶，雪崩探测仪和安全装备必须携带',
      },
      {
        day: 40,
        reason: '天气窗口关闭或误判雪崩风险导致无法冲顶',
        typicalUserProfile: '误判天气和雪况、缺乏专业指导的登山者',
        mitigation:
          'AI必须强调：马纳斯鲁雪崩风险使天气窗口判断更复杂，必须依赖专业向导和气象预报，错过窗口不应强行冲顶',
      },
    ],
  },

  narrative: {
    internal:
      '马纳斯鲁峰是中等难度的8000米峰，但雪崩风险极高（死亡率10%），近年商业化程度提高成为珠峰替代',
    userFacing:
      '挑战世界第八高峰马纳斯鲁（8163m），但必须严格警惕雪崩风险（2012年单次雪崩11人死亡）',
    philosophy: NP_MANASLU_NE_FACE_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '所有无7000m+登顶经验的登山者',
    '无雪崩地形识别和评估能力的登山者',
    '无雪崩安全装备（探测仪、铲子、探杆）的登山者',
    '低估雪崩风险（死亡率10%）的登山者',
    '无法承受$15,000-$35,000费用的登山者',
  ],

  philosophy: NP_MANASLU_NE_FACE_PHILOSOPHY,

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
    totalDistanceKm: 12,
    estimatedDuration: 42,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'NP_MANASLU_NE_FACE',
    philosophy: NP_MANASLU_NE_FACE_PHILOSOPHY,
  },
};
