/**
 * RouteDirection Fixture: 少女峰地区
 * Jungfrau Region
 *
 * 路线性质：瑞士最经典的阿尔卑斯山地区，高山缆车和徒步
 * RouteDirection 判断：推荐给想体验阿尔卑斯精华且不愿野营的游客
 *
 * @source knowledge-base/switzerland/routes/jungfrau-region.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const CH_JUNGFRAU_REGION_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '少女峰地区是阿尔卑斯最成熟的山地系统，雪山、湖泊、缆车相结合的完美体验',
  mustVisitTags: ['少女峰Top of Europe', 'Grindelwald缆车', 'Lauterbrunnen瀑布小镇', '艾格峰北壁', '劳特布龙嫩72瀑布'],
  nonNegotiableRules: [
    '⚠️ 高山缆车必须预订（旺季可提前数月满座）',
    '⚠️ 少女峰海拔3454m，有高反风险',
    '⚠️ 徒步路线必须携带地图和GPS',
    '⚠️ 天气变化快，必须准备防寒装备',
  ],
  flexibleParts: [
    '可3-7天灵活安排',
    '可选择缆车观景或徒步',
    '可选择不同难度的徒步路线',
    '可选择不同小镇居住（Grindelwald/Lauterbrunnen/Wengen）',
  ],
  durationFlexibility: {
    minDays: 3,
    maxDays: 7,
    preferredDays: 5,
  },
};

export const CH_JUNGFRAU_REGION: RouteDirection = {
  name: 'CH_JUNGFRAU_REGION',
  nameCN: '少女峰地区',
  nameEN: 'Jungfrau Region',
  countryCode: 'CH',
  regions: ['Bernese Oberland'],
  entryHubs: ['Zurich', 'Bern', 'Interlaken'],
  tags: ['高山', '缆车', '徒步', '瀑布', '阿尔卑斯'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
    avoidMonths: [],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 1000,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 3454,
      maxDailyAscentM: 1000,
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
    examples: ['jungfraujoch_top_of_europe', 'grindelwald_first', 'lauterbrunnen_72_waterfalls', 'eiger_north_face'],
    weights: {
      jungfraujoch_top_of_europe: 1.0,
      grindelwald_first: 0.9,
      lauterbrunnen_72_waterfalls: 0.8,
      eiger_north_face: 0.9,
    },
  },

  failureProfile: {
    commonFailureDays: [1, 2],
    typicalFailureReason: ['altitude_sickness', 'weather', 'ticket_unavailable'],
    rescueDifficulty: 'LOW',
    failureScenarios: [
      {
        day: 1,
        reason: '少女峰缆车票未预订导致无法上山',
        typicalUserProfile: '未提前预订、旺季前往的游客',
        mitigation: 'AI应建议至少提前2周预订少女峰缆车票，旺季至少1个月',
      },
      {
        day: 2,
        reason: '在3454m海拔出现高反症状',
        typicalUserProfile: '从低海拔直接上山、未适应的游客',
        mitigation: 'AI应建议：在Interlaken或Grindelwald适应1天后再上山，如有高反症状立即下撤',
      },
    ],
  },

  narrative: {
    internal: '少女峰地区是阿尔卑斯最安全的区域，但仍需注意高反和缆车预订',
    userFacing: '瑞士最经典的阿尔卑斯体验，雪山、湖泊、缆车完美结合',
    philosophy: CH_JUNGFRAU_REGION_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '对高反敏感的游客',
    '不愿提前预订的游客',
    '预算非常有限的游客（缆车票昂贵）',
  ],

  philosophy: CH_JUNGFRAU_REGION_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: true,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: false,
    level: 'medium',
  },

  metadata: {
    routeType: 'MOUNTAIN_SIGHTSEEING',
    totalDistanceKm: 100,
    estimatedDuration: 5,
    vehicleRequired: 'none',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'CH_JUNGFRAU_REGION',
    philosophy: CH_JUNGFRAU_REGION_PHILOSOPHY,
  },
};
