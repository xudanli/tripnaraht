/**
 * RouteDirection Fixture: 冰岛 Laugavegur 经典步道（融资 Demo 样板间）
 * Iceland Laugavegur Trail — Landmannalaugar → Þórsmörk
 *
 * @demo Phase 1 — 不接入 TripDecisionEngine POI 主路径替换
 */

import { IS_LAUGAVEGUR_HIKING_DETAIL_OVERRIDE } from '../../hiking-demo/constants/is-laugavegur-hiking-detail.constants';
import { RouteDirection, RoutePhilosophy } from './types';

export const IS_LAUGAVEGUR_PHILOSOPHY: RoutePhilosophy = {
  coreStatement:
    '从彩色流纹岩高地走到三冰川峡谷，用四天完成冰岛最具标志性的步道穿越',
  mustVisitTags: ['Landmannalaugar', '彩色流纹岩', '冰川河谷', 'Þórsmörk', '山屋预订'],
  nonNegotiableRules: [
    '⚠️ 仅在 7–8 月窗口期开放（其余月份封路或极端危险）',
    '⚠️ 必须提前预订 FÍ 山屋或携带完整露营装备',
    '⚠️ 冰川融水河流在午后暴涨，涉水须选早晨窗口',
    '⚠️ 高地无手机信号，需卫星通讯或结伴',
    '⚠️ 禁止低估单日爬升与负重对体能的消耗',
  ],
  flexibleParts: [
    '可 4 日标准节奏或 5 日加缓冲日',
    '可从雷克雅未克巴士接驳起点',
    '终点可延伸 Bus 4x4 至 Seljalandsfoss',
  ],
  durationFlexibility: {
    minDays: 4,
    maxDays: 6,
    preferredDays: 4,
  },
};

export const IS_LAUGAVEGUR: RouteDirection = {
  name: 'IS_LAUGAVEGUR',
  nameCN: '朗格迈维卢尔步道',
  nameEN: 'Laugavegur Trail',
  countryCode: 'IS',
  regions: ['Highlands'],
  entryHubs: ['Reykjavik', 'Landmannalaugar'],
  tags: ['徒步', '高地', '山屋', '多日', '冰川河谷'],

  seasonality: {
    bestMonths: [7, 8],
    avoidMonths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12],
  },

  constraints: {
    hard: {
      maxDailyRapidAscentM: 600,
      rapidAscentForbidden: false,
      requiresGuide: false,
      requiresPermit: false,
    },
    soft: {
      maxElevationM: 1100,
      maxDailyAscentM: 600,
      bufferTimeMin: 180,
    },
    objectives: {
      preferViewpoints: 0.35,
      preferPhotography: 0.25,
      preferCulture: 0.1,
      preferNature: 0.3,
    },
  },

  signaturePois: {
    examples: [
      'froad-landmannalaugar',
      'hut-landmannalaugar',
      'hut-nyidalur',
      'froad-thorsmork',
      'hut-thorsmork',
    ],
    weights: {
      'froad-landmannalaugar': 1.0,
      'froad-thorsmork': 0.95,
      'hut-landmannalaugar': 0.85,
      'hut-nyidalur': 0.8,
    },
  },

  failureProfile: {
    commonFailureDays: [2, 3],
    typicalFailureReason: ['river_crossing_failure', 'extreme_weather', 'fatigue'],
    rescueDifficulty: 'HIGH',
    failureScenarios: [
      {
        day: 2,
        reason: 'Emstrur 区域融水河流午后暴涨',
        typicalUserProfile: '低估涉水风险、午后过河的徒步者',
        mitigation: 'AI 应提示早晨窗口过河，并监控当日降水',
      },
      {
        day: 3,
        reason: '大风与能见度下降导致迷路',
        typicalUserProfile: '无 GPS/地图经验的游客',
        mitigation: '强制携带离线地图与卫星通讯设备',
      },
    ],
  },

  narrative: {
    internal: 'Laugavegur 是冰岛高地徒步融资 Demo 锚点路线',
    userFacing: '四天穿越彩色流纹岩与三冰川峡谷，冰岛最经典的多日步道',
    philosophy: IS_LAUGAVEGUR_PHILOSOPHY.coreStatement,
  },

  antiPersona: ['无多日徒步经验', '未预订山屋且无露营装备', '单独行动且无卫星通讯'],

  philosophy: IS_LAUGAVEGUR_PHILOSOPHY,

  riskProfile: {
    altitudeSickness: false,
    roadClosure: true,
    ferryDependent: false,
    weatherWindow: true,
    weatherWindowMonths: [7, 8],
    level: 'high',
  },

  metadata: {
    routeType: 'TREKKING',
    totalDistanceKm: 55,
    estimatedDuration: 4,
    vehicleRequired: 'bus_shuttle',
    demoAnchor: 'laugavegur',
    demoPolylinePoiIds: [
      'froad-landmannalaugar',
      'hut-landmannalaugar',
      'hut-nyidalur',
      'froad-thorsmork',
      'hut-thorsmork',
    ],
    demoSupplyPoiIds: ['hut-landmannalaugar', 'hut-nyidalur', 'hut-thorsmork'],
    testId: 'IS_LAUGAVEGUR',
    philosophy: IS_LAUGAVEGUR_PHILOSOPHY,
    /** 满配四 Tab：风险表 / 许可 / 准备清单 — Admin PUT 可 deep-merge 覆盖 */
    hikingDetailOverride: IS_LAUGAVEGUR_HIKING_DETAIL_OVERRIDE,
  },
};
