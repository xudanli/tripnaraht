/**
 * RouteDirection Fixture: 斯奈山半岛环线
 * Snæfellsnes Peninsula Circuit
 *
 * 路线性质："冰岛缩影"，一天浓缩冰岛所有风光类型
 * RouteDirection 判断：推荐给想避开南线人群、深度体验多样风光的用户
 *
 * @source knowledge-base/iceland/routes/snaefellsnes.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const IS_SNAEFELLSNES_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '斯奈山半岛被称为"冰岛缩影"，浓缩了冰岛所有类型的风光于一条环线',
  mustVisitTags: ['教会山', '斯奈菲尔冰川', '黑沙滩', '海豹沙滩', '渔村'],
  nonNegotiableRules: [
    '教会山Kirkjufell是最上镜景点，必须安排拍摄时间',
    '海豹沙滩需保持至少20米距离，不可喂食',
    '冬季北侧道路可能封闭，需检查road.is',
  ],
  flexibleParts: [
    '可选择1天紧凑或2天舒适',
    '可与雷克雅未克组合成一日往返',
    '可选择顺时针或逆时针环线',
  ],
  durationFlexibility: {
    minDays: 1,
    maxDays: 2,
    preferredDays: 1,
  },
};

export const IS_SNAEFELLSNES: RouteDirection = {
  name: 'IS_SNAEFELLSNES',
  nameCN: '斯奈山半岛环线',
  nameEN: 'Snæfellsnes Peninsula Circuit',
  countryCode: 'IS',
  regions: ['West Iceland'],
  entryHubs: ['Reykjavik'],
  tags: ['自驾', '冰岛缩影', '教会山', '海豹', '摄影', '多样风光'],

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
      maxElevationM: 463,
      maxDailyAscentM: 100,
      bufferTimeMin: 120,
    },
    objectives: {
      preferViewpoints: 0.4,
      preferPhotography: 0.4,
      preferCulture: 0.1,
      preferNature: 0.1,
    },
  },

  signaturePois: {
    examples: ['kirkjufell', 'snaefellsjokull', 'ytri_tunga_seal_beach', 'djupalonssandur'],
    weights: {
      kirkjufell: 1.0,
      snaefellsjokull: 0.8,
      ytri_tunga_seal_beach: 0.7,
      djupalonssandur: 0.7,
    },
  },

  failureProfile: {
    commonFailureDays: [1],
    typicalFailureReason: ['weather', 'logistics'],
    rescueDifficulty: 'LOW',
    failureScenarios: [
      {
        day: 1,
        reason: '冬季北侧道路封闭导致无法完成环线',
        typicalUserProfile: '冬季未检查road.is的游客',
        mitigation: 'AI必须提醒冬季访客检查road.is道路状况',
      },
    ],
  },

  narrative: {
    internal: '斯奈山半岛是"冰岛缩影"，适合想避开南线人群、深度体验多样风光的用户',
    userFacing: '环绕斯奈山半岛的环线，一天浓缩冰岛所有类型的风光：冰川、火山、黑沙滩、渔村、瀑布',
    philosophy: IS_SNAEFELLSNES_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '只想看最著名景点（南线更合适）',
    '不想开车绕圈的游客',
  ],

  philosophy: IS_SNAEFELLSNES_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: true,
    weatherWindow: false,
    level: 'low',
  },

  metadata: {
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 340,
    estimatedDuration: 1,
    vehicleRequired: 'standard',
    testId: 'IS_SNAEFELLSNES',
    philosophy: IS_SNAEFELLSNES_PHILOSOPHY,
  },
};
