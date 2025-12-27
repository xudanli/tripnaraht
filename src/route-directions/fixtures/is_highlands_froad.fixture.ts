// src/route-directions/fixtures/is_highlands_froad.fixture.ts
/**
 * Iceland Highlands F-Road Expedition RouteDirection Fixture
 * 
 * 冰岛高地 F 路穿越 RouteDirection 测试数据
 */

import { RouteDirectionData } from '../interfaces/route-direction.interface';

export const IS_HIGHLANDS_F_ROAD_EXPEDITION: RouteDirectionData = {
  name: 'ICELAND_HIGHLANDS_F_ROAD_EXPEDITION',
  nameCN: '冰岛高地 F 路穿越',
  countryCode: 'IS',
  tags: ['越野', '高地', '徒步', '自然'],
  regions: ['Highlands', 'Landmannalaugar', 'Askja'],
  entryHubs: ['Reykjavík', 'Ring Road Turnoff'],
  seasonality: {
    bestMonths: [7, 8], // 高地典型可通行期
    avoidMonths: [11, 12, 1, 2, 3, 4, 5, 6], // 5月仍在封闭期
  },
  constraints: {
    hard: {
      maxDailyRapidAscentM: 900,
      rapidAscentForbidden: false,
      requiresGuide: false,
    },
    soft: {
      maxElevationM: 1200,
      maxDailyAscentM: 900,
      bufferTimeMin: 90,
    },
    objectives: {
      preferViewpoints: 0.4,
      preferPhotography: 0.3,
      preferHotSpring: 0.3,
    },
  },
  signaturePois: {
    examples: ['landmannalaugar', 'askja', 'sprengisandur_viewpoint'],
    weights: {
      landmannalaugar: 1.0,
      askja: 0.9,
      sprengisandur_viewpoint: 0.8,
    },
  },
  failureProfile: {
    commonFailureDays: [1, 2],
    typicalFailureReason: ['weather', 'logistics'],
    rescueDifficulty: 'HIGH',
  },
  narrative: {
    internal: '路线的核心是体验从文明世界进入高地荒原，再回到人间，而不是在一号公路上兜圈子。',
    userFacing: '这是一条穿越冰岛高地的 F 路探险路线，适合有越野经验的旅行者。',
    philosophy: '路线的核心是体验从文明世界进入高地荒原，再回到人间，而不是在一号公路上兜圈子。',
  },
  antiPersona: [
    '第一次来冰岛',
    '无越野经验',
    '风险容忍低',
    '不接受行程调整',
  ],
  metadata: {
    routeType: 'ADVENTURE_DRIVE',
    corridorGeom: 'LINESTRING(-21.9 64.1, -19.0 64.5, -16.5 65.0)', // 简化示意
    vehicleRequired: '4x4',
    riverCrossing: true,
    weatherWindowRequired: true,
    fRoadForbidden: false, // F 路是必需的
    glacierCrossingForbidden: false,
    // 用于测试的 ID
    testId: 'IS_HIGHLANDS_F_ROAD_EXPEDITION',
  },
};

