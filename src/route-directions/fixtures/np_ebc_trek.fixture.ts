// src/route-directions/fixtures/np_ebc_trek.fixture.ts
/**
 * Nepal EBC (Everest Base Camp) Trek RouteDirection Fixture
 * 
 * 尼泊尔珠峰大本营徒步 RouteDirection 测试数据
 * 
 * 2026-02-11 创建：添加完整的 RoutePhilosophy 对象
 */

import { RouteDirectionData } from '../interfaces/route-direction.interface';
import { NEPAL_EBC_PHILOSOPHY as _NEPAL_EBC_PHILOSOPHY } from '../../trips/decision/models/route-philosophy.model';

// 重新导出 NEPAL_EBC_PHILOSOPHY 以便 index.ts 可以导出
export const NEPAL_EBC_PHILOSOPHY = _NEPAL_EBC_PHILOSOPHY;

export const NP_EBC_TREK: RouteDirectionData = {
  name: 'NEPAL_EBC_TREK',
  nameCN: '尼泊尔珠峰大本营徒步',
  countryCode: 'NP',
  tags: ['徒步', '高海拔', '珠峰', '夏尔巴文化', '茶屋'],
  regions: ['Khumbu', 'Solukhumbu', 'Sagarmatha National Park'],
  entryHubs: ['Lukla', 'Kathmandu'],
  seasonality: {
    bestMonths: [3, 4, 5, 10, 11], // 春季和秋季
    avoidMonths: [6, 7, 8, 12, 1, 2], // 雨季和严冬
  },
  constraints: {
    hard: {
      maxDailyRapidAscentM: 500, // 高海拔每日爬升限制
      rapidAscentForbidden: true, // 禁止快速爬升（高反风险）
      requiresGuide: false, // 不强制但强烈建议
      requiresPermit: true, // 需要 TIMS 卡和 Sagarmatha 国家公园入园证
    },
    soft: {
      maxElevationM: 5545, // Kala Patthar 最高点
      maxDailyAscentM: 400, // 建议每日爬升
      bufferTimeMin: 120, // 高海拔需要更多缓冲时间
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.3,
      preferCulture: 0.4, // 夏尔巴文化体验
    },
  },
  signaturePois: {
    examples: ['namche_bazaar', 'tengboche_monastery', 'gorak_shep', 'ebc', 'kala_patthar'],
    weights: {
      ebc: 1.0, // 珠峰大本营是核心目标
      kala_patthar: 0.95, // 观景点
      namche_bazaar: 0.85, // 夏尔巴首都
      tengboche_monastery: 0.8, // 文化体验
      gorak_shep: 0.75, // 最高住宿点
    },
  },
  failureProfile: {
    commonFailureDays: [4, 5, 8, 9], // 高海拔适应期和冲顶期
    typicalFailureReason: ['altitude', 'fatigue', 'weather'],
    rescueDifficulty: 'HIGH', // 高海拔救援困难
    failureScenarios: [
      {
        day: 4,
        reason: '高反症状在 Namche Bazaar（3440m）出现',
        typicalUserProfile: '无高海拔经验的平原用户',
        mitigation: '在 Namche 增加适应日，服用高反药物，必要时下撤',
      },
      {
        day: 5,
        reason: '适应不足导致在 Tengboche（3860m）出现严重头痛',
        typicalUserProfile: '赶时间跳过适应日的用户',
        mitigation: '强制休息日，下撤至 Namche 如症状加重',
      },
      {
        day: 8,
        reason: '在 Lobuche（4940m）到 Gorak Shep（5164m）段体力不支',
        typicalUserProfile: '体能中等但过于乐观的用户',
        mitigation: '放慢节奏，考虑放弃 Kala Patthar 只去 EBC',
      },
      {
        day: 9,
        reason: '冲顶 Kala Patthar 时天气突变',
        typicalUserProfile: '所有用户',
        mitigation: '密切关注天气预报，凌晨出发，准备备选日期',
      },
    ],
  },
  narrative: {
    internal: '路线的核心是渐进适应高海拔，确保安全抵达珠峰大本营，同时体验夏尔巴文化。不是竞速，是与身体对话的过程。',
    userFacing: '这是一条经典的珠峰大本营徒步路线，沿途可以欣赏壮丽的喜马拉雅山脉景色，体验独特的夏尔巴文化。',
    philosophy: '路线的核心是渐进适应高海拔，确保安全抵达珠峰大本营，同时体验夏尔巴文化。',
  },
  antiPersona: [
    '赶时间，无法安排适应日',
    '有严重心肺疾病',
    '无法接受基础住宿条件',
    '体能极低且无法提前训练',
    '对高海拔有恐惧',
  ],
  // 顶层 philosophy 字段：使用完整的 RoutePhilosophy 对象
  philosophy: _NEPAL_EBC_PHILOSOPHY,
  riskProfile: {
    altitudeSickness: true, // 高反风险高
    roadClosure: false, // 徒步不涉及道路
    ferryDependent: false,
    weatherWindow: true, // 天气窗口重要
    weatherWindowMonths: [3, 4, 5, 10, 11],
    level: 'high', // 高风险路线
  },
  metadata: {
    routeType: 'TREKKING',
    maxAltitudeM: 5545, // Kala Patthar
    totalDistanceKm: 130, // 往返约 130km
    estimatedDuration: 14, // 推荐 12-16 天
    teaHouseAvailable: true, // 全程有茶屋
    campingRequired: false, // 不需要露营
    porterRecommended: true, // 建议雇佣背夫
    guideRecommended: true, // 建议雇佣向导
    // 高海拔适应计划
    acclimatizationPlan: {
      day3: 'Namche Bazaar (3440m) - 适应日',
      day5: 'Dingboche (4410m) - 适应日或 side trip',
    },
    // 紧急撤离点
    evacuationPoints: [
      { name: 'Lukla', altitude: 2860, hasAirstrip: true },
      { name: 'Namche', altitude: 3440, hasHelipad: true },
      { name: 'Pheriche', altitude: 4371, hasClinic: true },
    ],
    // 用于测试的 ID
    testId: 'NP_EBC_TREK',
    // 完整的哲学模型（metadata 中也保留一份，便于服务层提取）
    philosophy: _NEPAL_EBC_PHILOSOPHY,
  },
};
