/**
 * RouteDirection Fixture: 珠穆朗玛峰南坳路线
 * Mount Everest - South Col Route
 *
 * 路线性质：世界最高峰商业登山路线
 * RouteDirection 判断：仅推荐给有7000m+登顶经验的专业高海拔登山者
 *
 * @source knowledge-base/mountaineering/routes/mountaineering-routes-detailed.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const NP_EVEREST_SOUTH_COL_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '珠穆朗玛峰南坳路线是世界最高峰的标准商业路线，虽然技术难度中等但死亡率仍达4%，绝对需要7000m+经验',
  mustVisitTags: ['Khumbu冰瀑', '洛子壁', '南坳', '希拉里台阶', '世界之巅8848.86m'],
  nonNegotiableRules: [
    '⚠️ 绝对需要至少1座7000m+高峰登顶经验',
    '⚠️ 必须通过专业医疗体检（心肺功能评估）',
    '⚠️ 必须有固定绳索攀登和冰壁技术经验',
    '⚠️ 14:00折返时间无例外（Summit Fever致命）',
    '⚠️ Khumbu冰瀑必须凌晨通过（最不稳定路段）',
    '⚠️ 必须使用专业向导和商业队伍',
  ],
  flexibleParts: [
    '可选择春季5月（最佳窗口）或秋季9-10月',
    '可选择使用氧气或无氧（极少数）',
    '可选择60天标准或65天保守行程',
  ],
  durationFlexibility: {
    minDays: 60,
    maxDays: 65,
    preferredDays: 60,
  },
};

export const NP_EVEREST_SOUTH_COL: RouteDirection = {
  name: 'NP_EVEREST_SOUTH_COL',
  nameCN: '珠穆朗玛峰南坳路线',
  nameEN: 'Mount Everest - South Col Route',
  countryCode: 'NP',
  regions: ['Khumbu', 'Sagarmatha National Park'],
  entryHubs: ['Kathmandu', 'Lukla'],
  tags: ['8000m', '极限', '高海拔', '冰川', '世界最高峰'],

  seasonality: {
    bestMonths: [5], // 5月中下旬最佳窗口
    avoidMonths: [6, 7, 8, 11, 12, 1, 2, 3], // 季风期和冬季
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 400, // 高海拔适应期严格限制
      rapidAscentForbidden: true,
      requiresGuide: true,
      requiresPermit: true,
    },
    soft: {
      maxElevationM: 8848,
      maxDailyAscentM: 600,
      bufferTimeMin: 1440, // 至少1天缓冲（天气窗口关键）
    },
    objectives: {
      preferViewpoints: 0.1,
      preferPhotography: 0.1,
      preferCulture: 0.0,
      preferNature: 0.8,
    },
  },

  signaturePois: {
    examples: ['khumbu_icefall', 'lhotse_face', 'south_col', 'hillary_step', 'everest_summit'],
    weights: {
      khumbu_icefall: 0.9, // 最危险路段
      lhotse_face: 0.8,
      south_col: 0.85,
      hillary_step: 0.95,
      everest_summit: 1.0,
    },
  },

  failureProfile: {
    commonFailureDays: [10, 15, 20, 30, 40, 50, 58],
    typicalFailureReason: [
      'altitude_sickness_severe',
      'weather_window_missed',
      'khumbu_icefall_accident',
      'summit_fever_violation',
      'oxygen_system_failure',
      'frostbite_severe',
    ],
    rescueDifficulty: 'EXTREME',
    failureScenarios: [
      {
        day: 10,
        reason: '适应期高原反应（HAPE/HACE）导致下撤',
        typicalUserProfile: '低估高海拔风险、快速上升的登山者',
        mitigation:
          'AI必须强制执行：严格适应期计划，每次上升后必须下降睡眠（Climb High Sleep Low），监测血氧饱和度<85%立即下撤',
      },
      {
        day: 20,
        reason: 'Khumbu冰瀑冰塔崩塌导致死亡或重伤',
        typicalUserProfile: '未在凌晨通过冰瀑、低估冰瀑风险的登山者',
        mitigation:
          'AI必须警告：Khumbu冰瀑是全程最危险路段（19%死亡发生于此），必须凌晨2-5点通过（冰最稳定），白天温度上升导致崩塌',
      },
      {
        day: 30,
        reason: '洛子壁滑坠或冰崩导致坠落',
        typicalUserProfile: '固定绳索技术不足、体力透支的登山者',
        mitigation:
          'AI应建议：洛子壁45-50度陡峭冰壁，必须熟练使用上升器和冰爪，分段上升避免连续攀登导致疲劳',
      },
      {
        day: 50,
        reason: '天气窗口关闭导致无法冲顶或被困',
        typicalUserProfile: '错误判断天气预报、过早或过晚冲顶的登山者',
        mitigation:
          'AI必须强调：5月中下旬有短暂稳定窗口（3-5天），必须依赖专业气象预报，错过窗口不应强行冲顶',
      },
      {
        day: 58,
        reason: 'Summit Fever导致违反14:00折返时间，下降时失温或坠落',
        typicalUserProfile: '过度执着登顶、无视折返时间的登山者',
        mitigation:
          'AI必须警告：80%的珠峰死亡发生在下山，14:00折返时间无例外（即使距离顶峰仅100米），夜间下降极度危险',
      },
      {
        day: 58,
        reason: '氧气系统故障或耗尽导致意识丧失',
        typicalUserProfile: '未检查备用氧气、低估氧气消耗的登山者',
        mitigation:
          'AI应建议：死亡地带（7950m+）必须使用氧气，携带2-3瓶+备用，检查阀门和面罩密封性，氧气耗尽速度极快',
      },
      {
        day: 60,
        reason: '严重冻伤导致截肢或死亡',
        typicalUserProfile: '装备不足、低估极寒风险（-40°C+强风）的登山者',
        mitigation:
          'AI必须强调：南坳和冲顶段温度-30至-40°C+强风，必须使用8000米专用羽绒服、手套、靴子，任何暴露皮肤立即冻伤',
      },
    ],
  },

  narrative: {
    internal:
      '珠穆朗玛峰南坳路线是世界最高峰的标准商业路线，死亡率4%，仅适合有7000m+经验的专业登山者',
    userFacing: '站在世界之巅8848.86米，但代价是极端风险和死亡威胁，仅适合最有经验的高海拔登山者',
    philosophy: NP_EVEREST_SOUTH_COL_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '所有无7000m+登顶经验的登山者',
    '无固定绳索和冰壁技术经验的登山者',
    '未通过专业医疗体检的登山者',
    '无法承受$35,000-$100,000费用的登山者',
    '夏季季风期（6-8月）或冬季（12-2月）前往的登山者',
    '低估死亡风险的登山者',
  ],

  philosophy: NP_EVEREST_SOUTH_COL_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: true, // 极高风险
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [5, 9, 10], // 5月最佳，9-10月次选
    level: 'extreme',
  },

  metadata: {
    routeType: 'MOUNTAINEERING',
    totalDistanceKm: 19, // 垂直距离Base Camp到顶峰
    estimatedDuration: 60,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'NP_EVEREST_SOUTH_COL',
    philosophy: NP_EVEREST_SOUTH_COL_PHILOSOPHY,
  },
};
