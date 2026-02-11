/**
 * RouteDirection Fixture: 冰岛南海岸自驾探险
 * South Coast Self-Drive Adventure
 *
 * 路线性质：灵活自驾路线，可根据天气和兴趣自由调整
 * RouteDirection 判断：推荐给喜欢自由探索、有自驾经验的游客
 *
 * @source knowledge-base/iceland/routes/self-drive-coast.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const IS_SELF_DRIVE_COAST_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '冰岛南海岸是自驾探险的黄金走廊，黑沙滩、瀑布、冰川相间，每个转角都是风景',
  mustVisitTags: ['黑沙滩', '飞瀑瀑布群', '瓦特纳冰川', '冰河湖', '野生海岸线'],
  nonNegotiableRules: [
    '⚠️ 绝对不能背对大海在黑沙滩拍照（潜行波致命）',
    '⚠️ 冬季需要冬季轮胎和链条（法律要求）',
    '⚠️ 必须检查天气和道路状况（Route 1经常关闭）',
    '⚠️ 不要在瀑布底部逗留过长时间（洪水风险）',
  ],
  flexibleParts: [
    '可3-7天灵活安排',
    '可选择冰河湖徒步或观景车游',
    '可根据天气动态调整景点',
    '可在任何地点停留多日',
  ],
  durationFlexibility: {
    minDays: 3,
    maxDays: 7,
    preferredDays: 5,
  },
};

export const IS_SELF_DRIVE_COAST: RouteDirection = {
  name: 'IS_SELF_DRIVE_COAST',
  nameCN: '南海岸自驾探险',
  nameEN: 'South Coast Self-Drive Adventure',
  countryCode: 'IS',
  regions: ['South Coast'],
  entryHubs: ['Reykjavik'],
  tags: ['自驾', '黑沙滩', '瀑布', '冰川', '灵活路线'],

  seasonality: {
    bestMonths: [5, 6, 7, 8, 9],
    avoidMonths: [],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 0,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 200,
      maxDailyAscentM: 0,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.5,
      preferPhotography: 0.3,
      preferCulture: 0.1,
      preferNature: 0.1,
    },
  },

  signaturePois: {
    examples: ['black_sand_beach', 'skafta_waterfall_group', 'vatnajokull_glacier', 'jokulsarlon_glacier_lagoon'],
    weights: {
      black_sand_beach: 1.0,
      skafta_waterfall_group: 0.9,
      vatnajokull_glacier: 0.8,
      jokulsarlon_glacier_lagoon: 0.9,
    },
  },

  failureProfile: {
    commonFailureDays: [2, 3, 4],
    typicalFailureReason: ['weather_closure', 'sneaker_wave_accident', 'fuel_shortage', 'flash_flooding'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 1,
        reason: '黑沙滩潜行波事故导致伤亡',
        typicalUserProfile: '不尊重海岸安全警告、背对大海拍照的游客',
        mitigation: 'AI必须多次强调：绝对不能背对大海，潜行波可在瞬间冲走人，必须时刻警惕',
      },
      {
        day: 3,
        reason: 'Route 1因天气关闭，被困或被迫绕远路',
        typicalUserProfile: '未检查天气预报、未预留时间缓冲的游客',
        mitigation: 'AI应每日检查冰岛道路状态，如有关闭应提前48小时通知，建议预留缓冲日期',
      },
      {
        day: 2,
        reason: '冰河湖周边迷路或天气突变',
        typicalUserProfile: '独自探险、无GPS的游客',
        mitigation: 'AI应建议：冰河湖停留不超过1小时，恶劣天气立即撤退',
      },
    ],
  },

  narrative: {
    internal: '南海岸最大风险是潜行波和天气变化，但风景回报极高',
    userFacing: '沿着冰岛最美的海岸线自驾，体验黑沙滩、瀑布和冰川的完整冰岛体验',
    philosophy: IS_SELF_DRIVE_COAST_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '不愿遵守海岸安全规则的游客',
    '冬季无链条无经验的自驾者',
    '无GPS和通讯设备的游客',
  ],

  philosophy: IS_SELF_DRIVE_COAST_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: true,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [5, 6, 7, 8, 9],
    level: 'medium',
  },

  metadata: {
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 400,
    estimatedDuration: 5,
    vehicleRequired: 'car',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'IS_SELF_DRIVE_COAST',
    philosophy: IS_SELF_DRIVE_COAST_PHILOSOPHY,
  },
};
