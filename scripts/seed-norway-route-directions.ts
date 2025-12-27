// scripts/seed-norway-route-directions.ts
/**
 * 🇳🇴 Norway RouteDirection Pack (Production Ready)
 * 
 * 挪威是「DEM × 海岸 × 气候 × 路线哲学」同时成立的国家
 * 这是 RouteDirection 引擎的天然试金石
 * 
 * 如果你的系统能把挪威跑顺，世界 80% 的目的地都会显得简单。
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

/**
 * 创建 PostGIS LINESTRING 几何数据
 * 格式: SRID=4326;LINESTRING(lng lat, lng lat, ...)
 */
function createLineString(coordinates: Array<[number, number]>): string {
  const points = coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `SRID=4326;LINESTRING(${points})`;
}

async function main() {
  console.log('🇳🇴 开始创建挪威 RouteDirection Pack...\n');

  // ========== RD-NO-01: Fjord Spine Traverse ==========
  console.log('📌 创建 RD-NO-01: Fjord Spine Traverse...');
  
  const no01Corridor = createLineString([
    [5.32, 60.39],   // Bergen
    [6.14, 62.47],   // Ålesund
    [7.20, 62.10],   // Geiranger
    [6.84, 60.12],   // Hardanger
    [6.00, 60.30],   // Odda (Trolltunga)
  ]);

  const rdNo01 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'NO',
      name: 'FJORD_SPINE_TRAVERSE',
      nameCN: '峡湾脊线纵贯（海 → 山脊）',
      nameEN: 'Fjord Spine Traverse · Sea to Ridge Axis',
      description: '每一天都从水面抬升到空中，用高度理解峡湾。连接卑尔根、奥勒松、盖朗厄尔的经典峡湾路线，融合海岸、山脊徒步和摄影体验。',
      tags: ['徒步', '峡湾', '摄影', '自然'],
      regions: ['Western Fjords', 'Hardanger', 'Sogn og Fjordane'],
      entryHubs: ['Bergen', 'Ålesund'],
      seasonality: {
        bestMonths: [6, 7, 8, 9],
        avoidMonths: [11, 12, 1, 2, 3],
        typicalDurationDays: 8,
      },
      constraints: {
        hardConstraints: {
          maxDailyRapidAscentM: 1100,
          rapidAscentForbidden: false,
        },
        softConstraints: {
          maxElevationM: 1800,
          maxDailyAscentM: 1200,
          maxSlopePct: 28,
          bufferTimeMin: 120,
        },
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: true,
        weatherWindow: true,
        weatherWindowMonths: [11, 12, 1, 2, 3, 4, 5],
        rescueDifficulty: 'MEDIUM',
      },
      signaturePois: {
        pois: [
          { poiId: 'trolltunga', weight: 1.0, name: 'Trolltunga' },
          { poiId: 'kjeragbolten', weight: 0.9, name: 'Kjeragbolten' },
          { poiId: 'geirangerfjord_viewpoints', weight: 0.8, name: 'Geirangerfjord Viewpoints' },
        ],
        types: ['VIEWPOINT', 'FJORD', 'TRAIL', 'MOUNTAIN_PASS'],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '峡湾游览', '山脊徒步', '观景日', '摄影日'],
        dailyPace: 'MODERATE',
        restDaysRequired: [],
        objectiveWeights: {
          preferViewpoints: 0.45,
          preferPhotography: 0.35,
          preferSolitude: 0.1,
        },
      },
      metadata: {
        routeType: 'HIKING',
        philosophy: '每一天都从水面抬升到空中，用高度理解峡湾。',
        demDecisionPoints: {
          rollingAscent3DaysThreshold: 2800, // 连续日爬升极强，rollingAscent 是核心否决点
          slopeStability: 'MEDIUM', // 单日坡度不极端，但连续日爬升极强
          weatherBufferRequired: true, // Dr.Dre 高频插入「天气缓冲日」
        },
        antiPersona: [
          '不接受天气变化',
          '不愿意临时调整计划',
          '低风险容忍',
        ],
        failureProfile: {
          commonFailureDays: [2, 3],
          typicalFailureReason: ['weather', 'fatigue'],
          rescueDifficulty: 'MEDIUM',
        },
      },
      isActive: true,
      status: 'active',
      updatedAt: new Date(),
    },
  });

  // 使用原始 SQL 更新 corridorGeom
  await prisma.$executeRawUnsafe(`
    UPDATE "RouteDirection"
    SET "corridorGeom" = ST_GeogFromText($1)
    WHERE id = ${rdNo01.id}
  `, no01Corridor);

  console.log(`✅ RD-NO-01 创建成功 (ID: ${rdNo01.id})\n`);

  // ========== RD-NO-02: Lofoten Arctic Coastline ==========
  console.log('📌 创建 RD-NO-02: Lofoten Arctic Coastline...');

  const no02Corridor = createLineString([
    [14.22, 67.28],  // Bodø
    [14.56, 68.23],  // Svolvær
    [13.88, 68.12],  // Reine
    [12.30, 68.05],  // Å (Lofoten)
  ]);

  const rdNo02 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'NO',
      name: 'LOFOTEN_ARCTIC_COASTLINE',
      nameCN: '罗弗敦北极海岸光线路线',
      nameEN: 'Lofoten Arctic Coastline · Light & Wind Route',
      description: '这是一条追逐光线与风的路线，而不是距离。罗弗敦群岛的北极海岸线，适合摄影和极光观测，天气与光线是第一决策变量。',
      tags: ['摄影', '海岸', '极光', '慢旅行'],
      regions: ['Lofoten Islands'],
      entryHubs: ['Bodø', 'Svolvær'],
      seasonality: {
        bestMonths: [2, 3, 9, 10], // 极光季节和光线最佳月份
        avoidMonths: [11, 12, 1, 4, 5, 6, 7, 8],
        typicalDurationDays: 6,
      },
      constraints: {
        hardConstraints: {
          maxElevationM: 900,
        },
        softConstraints: {
          bufferTimeMin: 90,
        },
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: true, // 冬季可能封路
        weatherWindow: true,
        weatherWindowMonths: [11, 12, 1, 2, 3, 4],
        rescueDifficulty: 'LOW',
      },
      signaturePois: {
        pois: [
          { poiId: 'reinebringen', weight: 1.0, name: 'Reinebringen' },
          { poiId: 'hamnoy', weight: 0.9, name: 'Hamnøy' },
          { poiId: 'aurora_viewpoints', weight: 0.8, name: 'Aurora Viewpoints' },
        ],
        types: ['COASTLINE', 'VIEWPOINT', 'PHOTOGRAPHY', 'AURORA'],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '海岸摄影', '光线等待', '极光观测'],
        dailyPace: 'RELAX',
        restDaysRequired: [],
        objectiveWeights: {
          preferPhotography: 0.5,
          preferLightConditions: 0.3,
        },
      },
      metadata: {
        routeType: 'SCENIC_DRIVE',
        philosophy: '这是一条追逐光线与风的路线，而不是距离。',
        demDecisionPoints: {
          demFriendly: true, // DEM 很友好
          weatherFirstPriority: true, // 天气与光线是第一决策变量
          climateOverDem: true, // 这是气候 > DEM 的经典 RD
        },
        antiPersona: [
          '讨厌自驾',
          '不接受天气等待',
        ],
        failureProfile: {
          commonFailureDays: [],
          typicalFailureReason: ['weather'],
          rescueDifficulty: 'LOW',
        },
      },
      isActive: true,
      status: 'active',
      updatedAt: new Date(),
    },
  });

  await prisma.$executeRawUnsafe(`
    UPDATE "RouteDirection"
    SET "corridorGeom" = ST_GeogFromText($1)
    WHERE id = ${rdNo02.id}
  `, no02Corridor);

  console.log(`✅ RD-NO-02 创建成功 (ID: ${rdNo02.id})\n`);

  // ========== RD-NO-03: Jotunheimen High Plateau ==========
  console.log('📌 创建 RD-NO-03: Jotunheimen High Plateau...');

  const no03Corridor = createLineString([
    [10.75, 59.91],  // Oslo
    [8.30, 61.50],   // Jotunheimen
    [8.60, 61.70],   // Galdhøpiggen
    [8.00, 61.40],   // Besseggen
  ]);

  const rdNo03 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'NO',
      name: 'JOTUNHEIMEN_HIGH_PLATEAU',
      nameCN: '尤通海门高原山屋纵走',
      nameEN: 'Jotunheimen High Plateau · Hut-to-Hut',
      description: '这是用连续性而不是高度来制造疲劳的路线。尤通海门高原的山屋纵走，适合高体能、愿意背包的徒步者。这是"低海拔但高消耗"的 DEM 反直觉样本。',
      tags: ['徒步', '高原', '挑战'],
      regions: ['Jotunheimen'],
      entryHubs: ['Oslo'],
      seasonality: {
        bestMonths: [7, 8, 9],
        avoidMonths: [11, 12, 1, 2, 3, 4, 5, 6, 10],
        typicalDurationDays: 7,
      },
      constraints: {
        hardConstraints: {
          maxElevationM: 2500,
          rapidAscentForbidden: true,
        },
        softConstraints: {
          maxDailyAscentM: 1000,
          maxSlopePct: 25,
          bufferTimeMin: 120,
        },
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: true,
        weatherWindow: true,
        weatherWindowMonths: [11, 12, 1, 2, 3, 4, 5, 6],
        rescueDifficulty: 'MEDIUM',
      },
      signaturePois: {
        pois: [
          { poiId: 'galdhøpiggen', weight: 1.0, name: 'Galdhøpiggen' },
          { poiId: 'besseggen', weight: 0.9, name: 'Besseggen' },
          { poiId: 'jotunheimen_huts', weight: 0.8, name: 'Jotunheimen Huts' },
        ],
        types: ['MOUNTAIN_PASS', 'ALPINE_HUT', 'TRAIL', 'PLATEAU'],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '高原徒步', '山屋过夜', '连续挑战'],
        dailyPace: 'INTENSE',
        restDaysRequired: [3],
        objectiveWeights: {
          preferChallenge: 0.4,
          preferSolitude: 0.3,
        },
      },
      metadata: {
        routeType: 'HIKING',
        philosophy: '这是用连续性而不是高度来制造疲劳的路线。',
        demDecisionPoints: {
          lowAltitudeHighConsumption: true, // "低海拔但高消耗"的 DEM 反直觉样本
          fatigueModelTraining: true, // 非常适合训练引擎的疲劳模型
          continuousFatigue: true, // 连续性疲劳是关键
        },
        antiPersona: [
          '体能不足',
          '不愿背包',
          '追求舒适',
        ],
        failureProfile: {
          commonFailureDays: [3],
          typicalFailureReason: ['fatigue'],
          rescueDifficulty: 'MEDIUM',
        },
      },
      isActive: true,
      status: 'active',
      updatedAt: new Date(),
    },
  });

  await prisma.$executeRawUnsafe(`
    UPDATE "RouteDirection"
    SET "corridorGeom" = ST_GeogFromText($1)
    WHERE id = ${rdNo03.id}
  `, no03Corridor);

  console.log(`✅ RD-NO-03 创建成功 (ID: ${rdNo03.id})\n`);

  // ========== RD-NO-04: Norwegian Scenic Routes ==========
  console.log('📌 创建 RD-NO-04: Norwegian Scenic Routes...');

  const no04Corridor = createLineString([
    [10.75, 59.91],  // Oslo
    [5.32, 60.39],   // Bergen
    [6.00, 60.30],   // Hardanger
    [7.20, 62.10],   // Geiranger
    [8.30, 63.45],   // Atlantic Road
  ]);

  const rdNo04 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'NO',
      name: 'NORWEGIAN_SCENIC_ROADS',
      nameCN: '挪威国家风景公路恢复路线',
      nameEN: 'Norwegian Scenic Routes · Recovery Drive',
      description: '这是为恢复和观察而存在的路线。沿着挪威国家风景公路，从奥斯陆到卑尔根，适合在完成高强度徒步后，或作为低强度旅行的选择。',
      tags: ['自驾', '风景', '慢节奏'],
      regions: ['Atlantic Road', 'Hardanger', 'Senja'],
      entryHubs: ['Oslo', 'Bergen'],
      seasonality: {
        bestMonths: [5, 6, 7, 8, 9],
        avoidMonths: [11, 12, 1, 2, 3],
        typicalDurationDays: 5,
      },
      constraints: {
        hardConstraints: {},
        softConstraints: {
          bufferTimeMin: 45,
        },
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: false,
        weatherWindow: false,
        rescueDifficulty: 'LOW',
      },
      signaturePois: {
        pois: [
          { poiId: 'atlantic_road', weight: 1.0, name: 'Atlantic Road' },
          { poiId: 'hardanger_fjord', weight: 0.9, name: 'Hardanger Fjord' },
          { poiId: 'senja_scenic', weight: 0.8, name: 'Senja Scenic Route' },
        ],
        types: ['SCENIC_ROAD', 'FJORD', 'VIEWPOINT'],
      },
      itinerarySkeleton: {
        dayThemes: ['风景公路', '观景日', '慢节奏游览'],
        dailyPace: 'RELAX',
        restDaysRequired: [],
        objectiveWeights: {
          preferComfort: 0.4,
          preferViewpoints: 0.3,
        },
      },
      metadata: {
        routeType: 'SCENIC_DRIVE',
        philosophy: '这是为恢复和观察而存在的路线。',
        failureProfile: {
          commonFailureDays: [],
          typicalFailureReason: [],
          rescueDifficulty: 'LOW',
        },
      },
      isActive: true,
      status: 'active',
      updatedAt: new Date(),
    },
  });

  await prisma.$executeRawUnsafe(`
    UPDATE "RouteDirection"
    SET "corridorGeom" = ST_GeogFromText($1)
    WHERE id = ${rdNo04.id}
  `, no04Corridor);

  console.log(`✅ RD-NO-04 创建成功 (ID: ${rdNo04.id})\n`);

  // ========== 总结 ==========
  console.log('================================================================================');
  console.log('🇳🇴 挪威 RouteDirection Pack 创建完成！');
  console.log('================================================================================');
  console.log(`✅ RD-NO-01: Fjord Spine Traverse (ID: ${rdNo01.id})`);
  console.log(`✅ RD-NO-02: Lofoten Arctic Coastline (ID: ${rdNo02.id})`);
  console.log(`✅ RD-NO-03: Jotunheimen High Plateau (ID: ${rdNo03.id})`);
  console.log(`✅ RD-NO-04: Norwegian Scenic Routes (ID: ${rdNo04.id})`);
  console.log('================================================================================');
  console.log('\n📊 系统价值：');
  console.log('  ✅ 海岸 × DEM 联合决策');
  console.log('  ✅ 天气作为第一变量');
  console.log('  ✅ 连续疲劳否决');
  console.log('  ✅ 同国 4 种完全不同路线哲学');
  console.log('\n👉 这就是"路线认知引擎"的标准形态');
  console.log('================================================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ 创建失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

