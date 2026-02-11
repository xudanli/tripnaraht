/**
 * RouteDirection Fixture: 冰岛环岛公路南线精华
 * Iceland Ring Road South Coast Highlights
 *
 * 路线性质：冰岛最壮观的海岸线，包含瀑布、冰川、黑沙滩
 * RouteDirection 判断：强烈推荐给首次来冰岛的用户，风景最精华
 *
 * @source knowledge-base/iceland/routes/ring-road-south.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

export const IS_RING_ROAD_SOUTH_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '南线是冰岛最精华的风景走廊，展现从瀑布到冰川到黑沙滩的完整地质变化',
  mustVisitTags: ['塞里雅兰瀑布', '斯科加瀑布', '雷尼斯黑沙滩', '冰河湖（可选）'],
  nonNegotiableRules: [
    '黑沙滩潜行波致命危险，绝对不能背对大海',
    '冰河湖不可独自靠近冰川',
    'Vík→Höfn 190km无加油站，必须在Vík加满油',
  ],
  flexibleParts: [
    '可选择2天返回或3天延伸到冰河湖',
    '冰川徒步、冰河湖游船等活动可自由选择',
    '住宿地点可根据行程调整（Vík或Höfn）',
  ],
  durationFlexibility: {
    minDays: 2,
    maxDays: 3,
    preferredDays: 2,
  },
};

export const IS_RING_ROAD_SOUTH: RouteDirection = {
  name: 'IS_RING_ROAD_SOUTH',
  nameCN: '冰岛环岛公路南线精华',
  nameEN: 'Ring Road South Coast Highlights',
  countryCode: 'IS',
  regions: ['South Coast'],
  entryHubs: ['Reykjavik'],
  tags: ['自驾', '瀑布', '冰川', '黑沙滩', '摄影天堂'],

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
      maxElevationM: 100,
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
    examples: ['seljalandsfoss', 'skogafoss', 'reynisfjara_black_beach', 'jokulsarlon'],
    weights: {
      seljalandsfoss: 0.9,
      skogafoss: 1.0,
      reynisfjara_black_beach: 1.0,
      jokulsarlon: 0.8,
    },
  },

  failureProfile: {
    commonFailureDays: [1, 2],
    typicalFailureReason: ['weather', 'fatigue'],
    rescueDifficulty: 'LOW',
    failureScenarios: [
      {
        day: 1,
        reason: '黑沙滩潜行波事故',
        typicalUserProfile: '不了解潜行波危险，背对大海拍照的游客',
        mitigation: 'AI必须在推荐黑沙滩时明确警告：绝对不能背对大海，潜行波可致命',
      },
      {
        day: 2,
        reason: 'Vík→Höfn段燃料耗尽',
        typicalUserProfile: '未在Vík加满油的自驾游客',
        mitigation: 'AI必须提醒：Vík是最后加油站，之后190km无加油站',
      },
    ],
  },

  narrative: {
    internal: '南线是冰岛最精华的路线，景点密集且可达性高，但黑沙滩有致命风险，必须明确警告',
    userFacing: '冰岛最壮观的海岸线，包含瀑布、冰川、黑沙滩和冰河湖，适合首次来冰岛的游客',
    philosophy: IS_RING_ROAD_SOUTH_PHILOSOPHY.coreStatement,
  },

  antiPersona: [
    '寻找人迹罕至路线的探险者',
    '极度讨厌游客的人（夏季很拥挤）',
  ],

  philosophy: IS_RING_ROAD_SOUTH_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: false,
    ferryDependent: false,
    weatherWindow: false,
    level: 'low-medium',
  },

  metadata: {
    routeType: 'ROAD_TRIP',
    totalDistanceKm: 460,
    estimatedDuration: 2,
    vehicleRequired: 'standard',
    testId: 'IS_RING_ROAD_SOUTH',
    philosophy: IS_RING_ROAD_SOUTH_PHILOSOPHY,
  },
};
