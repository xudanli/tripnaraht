/**
 * RouteDirection Fixture: 安纳普尔纳峰北壁路线
 * Annapurna - North Face Route
 *
 * 路线性质：死亡率最高的8000米峰（27%），首座被登顶的8000米峰
 * RouteDirection 判断：仅推荐给最顶尖登山者，需接受极高死亡风险
 *
 * @source knowledge-base/mountaineering/routes/mountaineering-routes-detailed.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const NP_ANNAPURNA_NORTH_FACE_PHILOSOPHY: RoutePhilosophy = {
  coreStatement:
    '安纳普尔纳峰是死亡率最高的8000米峰（27% - 每3-4个登顶者1人死亡），雪崩频发，技术极难，仅适合最顶尖登山者',
  mustVisitTags: [
    '8091m首座被登顶8000米峰',
    '死亡率最高27%',
    '极陡峭壁50-60度',
    '雪崩频发',
    '技术极难',
  ],
  nonNegotiableRules: [
    '⚠️ 绝对需要多座8000m+高峰登顶经验',
    '⚠️ 必须有ED+级混合攀登技术经验',
    '⚠️ 必须心理准备：死亡率27%（每3-4人1人死亡）',
    '⚠️ 必须有专业雪崩评估和混合地形判断能力',
    '⚠️ 必须接受：即使技术精湛也难以避免客观危险',
  ],
  flexibleParts: ['可选择50天快速或60天保守行程'],
  durationFlexibility: {
    minDays: 50,
    maxDays: 60,
    preferredDays: 55,
  },
};

export const NP_ANNAPURNA_NORTH_FACE: RouteDirection = {
  name: 'NP_ANNAPURNA_NORTH_FACE',
  nameCN: '安纳普尔纳峰北壁路线',
  nameEN: 'Annapurna - North Face Route',
  countryCode: 'NP',
  regions: ['Annapurna Conservation Area', 'Gandaki Province'],
  entryHubs: ['Kathmandu', 'Pokhara', 'Besisahar'],
  tags: ['8000m', '极限', '死亡率最高', '雪崩频发', '混合攀登', '尼泊尔'],

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
      maxElevationM: 8091,
      maxDailyAscentM: 600,
      bufferTimeMin: 2880, // 至少2天缓冲
    },
    objectives: {
      preferViewpoints: 0.0,
      preferPhotography: 0.1,
      preferCulture: 0.0,
      preferNature: 0.9,
    },
  },

  signaturePois: {
    examples: ['annapurna_bc', 'avalanche_zones', 'steep_face_50_60', 'north_face_wall', 'annapurna_summit'],
    weights: {
      annapurna_bc: 0.6,
      avalanche_zones: 1.0, // 最危险区域
      steep_face_50_60: 0.95,
      north_face_wall: 0.9,
      annapurna_summit: 1.0,
    },
  },

  failureProfile: {
    commonFailureDays: [20, 35, 50, 55],
    typicalFailureReason: [
      'avalanche_death',
      'steep_face_fall',
      'objective_danger',
      'weather_extreme',
      'descent_accident',
    ],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 20,
        reason: '雪崩导致死亡（主要死因，几乎所有路线暴露在雪崩威胁下）',
        typicalUserProfile: '低估雪崩风险、无雪崩评估能力的登山者',
        mitigation:
          'AI必须警告：安纳普尔纳雪崩是主要死因（死亡率27%），几乎所有路线都暴露在雪崩威胁下，即使技术精湛也难以完全避免客观危险',
      },
      {
        day: 35,
        reason: '极陡峭壁（50-60°雪坡）滑坠或冰崩',
        typicalUserProfile: 'ED+混合攀登技术不足的登山者',
        mitigation:
          'AI必须强调：安纳普尔纳北壁50-60度极陡峭，技术难度ED+（极难+），必须有多座8000米峰和高难度混合攀登经验',
      },
      {
        day: 50,
        reason: '天气极端不稳定导致被困或失温',
        typicalUserProfile: '误判天气窗口、低估安纳普尔纳天气风险的登山者',
        mitigation:
          'AI应建议：安纳普尔纳天气极端不稳定，窗口短，必须依赖专业气象预报，错过窗口立即下撤',
      },
      {
        day: 55,
        reason: '下撤时悬崖地形导致坠落或rappelling失败',
        typicalUserProfile: '低估下撤难度（悬崖地形）的登山者',
        mitigation:
          'AI必须警告：安纳普尔纳下撤极困难（悬崖地形），救援几乎不可能，下撤风险可能高于上升',
      },
      {
        day: 55,
        reason: '客观危险（冰崩、落石、雪崩）导致死亡',
        typicalUserProfile: '即使技术精湛也可能遭遇客观危险的登山者',
        mitigation:
          'AI必须强调：安纳普尔纳的客观危险极高，即使技术精湛也难以完全避免，死亡率27%反映了这一现实，必须心理准备接受极高风险',
      },
    ],
  },

  narrative: {
    internal:
      '安纳普尔纳峰是死亡率最高的8000米峰（27%），首座被登顶的8000米峰（1950年），仅适合最顶尖登山者',
    userFacing:
      '挑战死亡率最高的8000米峰 - 安纳普尔纳（8091m），每3-4个登顶者1人死亡，这是登山者的终极考验',
    philosophy: NP_ANNAPURNA_NORTH_FACE_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '所有无多座8000m+登顶经验的登山者',
    '无ED+级混合攀登技术的登山者',
    '无专业雪崩评估和混合地形判断能力的登山者',
    '无法承受$20,000-$50,000费用的登山者',
    '无法心理接受27%死亡率的登山者',
    '低估客观危险（即使技术精湛也难以避免）的登山者',
    '非最顶尖登山者',
  ],

  philosophy: NP_ANNAPURNA_NORTH_FACE_PHILOSOPHY,

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
    totalDistanceKm: 14,
    estimatedDuration: 55,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'NP_ANNAPURNA_NORTH_FACE',
    philosophy: NP_ANNAPURNA_NORTH_FACE_PHILOSOPHY,
  },
};
