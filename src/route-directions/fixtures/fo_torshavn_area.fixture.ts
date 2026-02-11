/**
 * RouteDirection Fixture: 法罗群岛托尔斯港地区
 * Faroe Islands Tórshavn Area
 *
 * 路线性质：法罗群岛首府及周边探索，崖壁和极地风光
 * RouteDirection 判断：推荐给喜欢维京文化和北大西洋海岸风光的游客
 *
 * @source knowledge-base/faroe-islands/routes/torshavn-area.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const FO_TORSHAVN_AREA_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '法罗群岛是北大西洋的绿色宝石，托尔斯港周边是维京文化和崖壁风光的完美结合',
  mustVisitTags: ['托尔斯港老城', 'Saksun教堂', 'Múlafossur瀑布', '海崖徒步', '草屋顶'],
  nonNegotiableRules: [
    '⚠️ 绝对不能靠近悬崖边缘（法罗群岛崖壁经常坍塌）',
    '⚠️ 天气变化极快，必须随时准备撤退',
    '⚠️ 海岸边必须时刻警惕巨浪',
    '⚠️ 不要触碰野生羊（可能攻击性）',
  ],
  flexibleParts: [
    '可3-5天灵活安排',
    '可根据天气调整岛屿访问顺序',
    '可选择自驾或公交',
  ],
  durationFlexibility: {
    minDays: 3,
    maxDays: 5,
    preferredDays: 4,
  },
};

export const FO_TORSHAVN_AREA: RouteDirection = {
  name: 'FO_TORSHAVN_AREA',
  nameCN: '托尔斯港地区',
  nameEN: 'Tórshavn Area',
  countryCode: 'FO',
  regions: ['Tórshavn', 'Vágar', 'Streymoy'],
  entryHubs: ['Vágar Airport'],
  tags: ['维京', '海崖', '瀑布', '草屋顶', '北大西洋'],

  seasonality: {
    bestMonths: [6, 7, 8, 9],
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
      maxElevationM: 400,
      maxDailyAscentM: 300,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.4,
      preferPhotography: 0.4,
      preferCulture: 0.1,
      preferNature: 0.1,
    },
  },

  signaturePois: {
    examples: ['torshavn_old_town', 'saksun_church', 'mulafossur_waterfall', 'sea_cliffs'],
    weights: {
      torshavn_old_town: 0.8,
      saksun_church: 0.9,
      mulafossur_waterfall: 1.0,
      sea_cliffs: 0.9,
    },
  },

  failureProfile: {
    commonFailureDays: [2, 3],
    typicalFailureReason: ['cliff_accident', 'weather', 'sea_wave_incident'],
    rescueDifficulty: 'MEDIUM',
    failureScenarios: [
      {
        day: 2,
        reason: '崖壁坍塌导致游客坠落',
        typicalUserProfile: '不尊重警告标志、靠近崖壁边缘拍照的游客',
        mitigation: 'AI必须强调：法罗群岛崖壁经常坍塌，必须保持至少3米距离',
      },
      {
        day: 3,
        reason: '天气突然转变导致被困户外',
        typicalUserProfile: '未检查天气、无雨具的游客',
        mitigation: 'AI应每日检查天气，法罗群岛天气极端多变，必须携带全套雨具',
      },
    ],
  },

  narrative: {
    internal: '法罗群岛崖壁风险较高，但风景壮美',
    userFacing: '探索北大西洋绿色宝石，体验维京文化和崖壁瀑布的震撼风光',
    philosophy: FO_TORSHAVN_AREA_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '不尊重崖壁安全规则的游客',
    '无雨具和防风装备的游客',
    '体能不足的游客',
  ],

  philosophy: FO_TORSHAVN_AREA_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: true,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'medium',
  },

  metadata: {
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 200,
    estimatedDuration: 4,
    vehicleRequired: 'car',
    polarBearRisk: false,
    weaponRequired: false,
    testId: 'FO_TORSHAVN_AREA',
    philosophy: FO_TORSHAVN_AREA_PHILOSOPHY,
  },
};
