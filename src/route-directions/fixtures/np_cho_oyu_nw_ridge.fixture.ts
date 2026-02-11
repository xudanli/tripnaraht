/**
 * RouteDirection Fixture: 卓奥友峰西北山脊路线
 * Cho Oyu - Northwest Ridge Route
 *
 * 路线性质：技术难度最低的8000米峰，适合首座8000米峰
 * RouteDirection 判断：推荐给有6000m+经验、想尝试首座8000米峰的登山者
 *
 * @source knowledge-base/mountaineering/routes/mountaineering-routes-detailed.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const NP_CHO_OYU_NW_RIDGE_PHILOSOPHY: RoutePhilosophy = {
  coreStatement:
    '卓奥友峰是技术难度最低的8000米峰，成功率60-65%（最高），死亡率仅1%（最低），适合作为首座8000米峰',
  mustVisitTags: ['8188m世界第六高峰', '技术难度最低', '高成功率', '商业化程度高', '尼泊尔-中国边境'],
  nonNegotiableRules: [
    '⚠️ 建议至少有6000m+高峰登顶经验',
    '⚠️ 必须完成完整适应期计划（35-40天）',
    '⚠️ 虽然技术简单，但仍是8000米峰，不可轻视高原反应',
    '⚠️ 必须有基本雪坡行进和冰爪技术',
  ],
  flexibleParts: ['可选择35天快速或40天保守行程', '可选择使用氧气或无氧（许多人无氧登顶）'],
  durationFlexibility: {
    minDays: 35,
    maxDays: 40,
    preferredDays: 38,
  },
};

export const NP_CHO_OYU_NW_RIDGE: RouteDirection = {
  name: 'NP_CHO_OYU_NW_RIDGE',
  nameCN: '卓奥友峰西北山脊路线',
  nameEN: 'Cho Oyu - Northwest Ridge Route',
  countryCode: 'NP',
  regions: ['Khumbu', 'Nepal-China Border'],
  entryHubs: ['Kathmandu', 'Lukla', 'Tingri'],
  tags: ['8000m', '高海拔', '技术简单', '高成功率', '首座8000米峰'],

  seasonality: {
    bestMonths: [5, 9, 10],
    avoidMonths: [6, 7, 8, 11, 12, 1, 2],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 500,
      rapidAscentForbidden: true,
      requiresGuide: true,
      requiresPermit: true,
    },
    soft: {
      maxElevationM: 8188,
      maxDailyAscentM: 700,
      bufferTimeMin: 1440,
    },
    objectives: {
      preferViewpoints: 0.2,
      preferPhotography: 0.1,
      preferCulture: 0.0,
      preferNature: 0.7,
    },
  },

  signaturePois: {
    examples: ['cho_oyu_bc', 'abc', 'camp1', 'camp2', 'cho_oyu_summit'],
    weights: {
      cho_oyu_bc: 0.6,
      abc: 0.7,
      camp1: 0.75,
      camp2: 0.85,
      cho_oyu_summit: 1.0,
    },
  },

  failureProfile: {
    commonFailureDays: [10, 20, 35],
    typicalFailureReason: [
      'altitude_sickness_mild',
      'weather_window_missed',
      'underestimation_of_8000m',
    ],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 10,
        reason: '适应期高原反应导致下撤',
        typicalUserProfile: '低估8000米高度、快速上升的登山者',
        mitigation:
          'AI必须强制执行：虽然卓奥友技术简单，但仍是8000米峰，严格适应期计划，血氧饱和度<85%立即下撤',
      },
      {
        day: 20,
        reason: '雪坡滑坠或裂缝坠落',
        typicalUserProfile: '冰爪技术不足、低估雪坡风险的登山者',
        mitigation:
          'AI应建议：虽然坡度适中（30-40°），但仍需熟练冰爪和冰镐技术，固定绳使用不当可能滑坠',
      },
      {
        day: 35,
        reason: '天气窗口关闭导致无法冲顶',
        typicalUserProfile: '误判天气窗口、过早或过晚冲顶的登山者',
        mitigation:
          'AI应强调：卓奥友天气窗口相对长，但仍需依赖专业气象预报，5月和9-10月是最佳窗口',
      },
      {
        day: 35,
        reason: '低估8000米高度导致体能不足或高反',
        typicalUserProfile: '因"技术简单"而轻视8000米高度的登山者',
        mitigation:
          'AI必须警告：卓奥友虽然技术难度最低，但仍是8000米峰，高原反应和体能消耗不可低估，不应因"简单"而轻视',
      },
    ],
  },

  narrative: {
    internal:
      '卓奥友峰是技术难度最低的8000米峰，成功率60-65%，死亡率仅1%，适合作为首座8000米峰尝试',
    userFacing:
      '挑战你的首座8000米峰 - 卓奥友峰（8188m），技术难度最低但仍需尊重高海拔风险',
    philosophy: NP_CHO_OYU_NW_RIDGE_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '无6000m+高峰登顶经验的登山者',
    '无基本冰爪和雪坡行进技术的登山者',
    '因"技术简单"而轻视8000米高度的登山者',
    '无法承受$15,000-$30,000费用的登山者',
    '夏季季风期（6-8月）或冬季前往的登山者',
  ],

  philosophy: NP_CHO_OYU_NW_RIDGE_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: true,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [5, 9, 10],
    level: 'extreme', // 仍是8000米峰
  },

  metadata: {
    routeType: 'MOUNTAINEERING',
    totalDistanceKm: 10,
    estimatedDuration: 38,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'NP_CHO_OYU_NW_RIDGE',
    philosophy: NP_CHO_OYU_NW_RIDGE_PHILOSOPHY,
  },
};
