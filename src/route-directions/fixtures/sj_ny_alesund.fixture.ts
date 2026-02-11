/**
 * RouteDirection Fixture: 斯瓦尔巴尼奥尔松村
 * Ny-Ålesund Research Station Visit
 *
 * 路线性质：世界最北的人类定居点参观，限制性很强
 * RouteDirection 判断：推荐给对北极科研感兴趣、能通过申请的游客
 *
 * @source knowledge-base/svalbard/routes/ny-alesund.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const SJ_NY_ALESUND_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '尼奥尔松是世界最北的永久人类定居点（北纬78.9°），只能通过许可证和专业团队参访',
  mustVisitTags: ['北纬78.9°', '北极科研站', '煤矿遗迹', '北极气候监测', '国际北极文化'],
  nonNegotiableRules: [
    '⚠️ 绝对只能通过官方认可的团队前往（不可独立行动）',
    '⚠️ 必须申请访问许可证',
    '⚠️ 访问时间严格限制（通常1-2天）',
    '⚠️ 必须遵守严格的环保规则',
    '⚠️ 必须携带武器防御北极熊',
  ],
  flexibleParts: [
    '可选择不同时间季节访问',
    '可参加不同的科研活动',
    '可停留1-2天',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 2,
    preferredDays: 1,
  },
};

export const SJ_NY_ALESUND: RouteDirection = {
  name: 'SJ_NY_ALESUND',
  nameCN: '尼奥尔松村',
  nameEN: 'Ny-Ålesund Research Station Visit',
  countryCode: 'SJ',
  regions: ['Spitsbergen'],
  entryHubs: ['Longyearbyen'],
  tags: ['世界最北', '科研站', '北极气候', '极限地点', '许可证'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
    avoidMonths: [],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 0,
      rapidAscentForbidden: false,
      requiresGuide: true,
      requiresPermit: true,
    },
    soft: {
      maxElevationM: 100,
      maxDailyAscentM: 0,
      bufferTimeMin: 120,
    },
    objectives: {
      preferViewpoints: 0.3,
      preferPhotography: 0.4,
      preferCulture: 0.2,
      preferNature: 0.1,
    },
  },

  signaturePois: {
    examples: ['ny_alesund_monument', 'research_stations', 'polar_bear_monument', 'arctic_flora'],
    weights: {
      ny_alesund_monument: 1.0,
      research_stations: 0.9,
      polar_bear_monument: 0.7,
      arctic_flora: 0.5,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['weather_delay', 'permit_denial', 'polar_bear_encounter'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 1,
        reason: '天气延迟导致无法抵达尼奥尔松',
        typicalUserProfile: '未预留足够时间缓冲的游客',
        mitigation: 'AI应建议：预留额外3-5天缓冲时间以应对天气延迟',
      },
      {
        day: 1,
        reason: '许可证申请被拒',
        typicalUserProfile: '申请不当或不符合条件的游客',
        mitigation: 'AI应在预订前2-3周协助用户完成许可证申请流程',
      },
    ],
  },

  narrative: {
    internal: '尼奥尔松是极限地点，但访问受到严格限制',
    userFacing: '访问世界最北的人类定居点，体验北极科研生活和极地气候',
    philosophy: SJ_NY_ALESUND_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '不愿申请许可证的游客',
    '时间紧张无法预留缓冲的游客',
    '不遵守环保规则的游客',
  ],

  philosophy: SJ_NY_ALESUND_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: true,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'medium',
  },

  metadata: {
    routeType: 'CULTURAL_VISIT',
    totalDistanceKm: 0,
    estimatedDuration: 1,
    vehicleRequired: 'none',
    polarBearRisk: true,
    weaponRequired: true,
    testId: 'SJ_NY_ALESUND',
    philosophy: SJ_NY_ALESUND_PHILOSOPHY,
  },
};
