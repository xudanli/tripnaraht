// scripts/seed-switzerland-route-directions.ts
/**
 * 🇨🇭 Switzerland RouteDirection Pack (Production Ready)
 * 
 * 瑞士的本质不是"好看"，而是：在极高 DEM 复杂度下，维持极低失败率。
 * 这是一个"纪律极强"的国家，非常适合作为路线引擎的标杆样本。
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
  console.log('🇨🇭 开始创建瑞士 RouteDirection Pack...\n');

  // ========== RD-CH-01: Alpine Panorama Traverse ==========
  console.log('📌 创建 RD-CH-01: Alpine Panorama Traverse...');
  
  const ch01Corridor = createLineString([
    [7.85, 46.69],   // Interlaken
    [7.96, 46.54],   // Grindelwald
    [8.03, 46.50],   // First
    [7.75, 46.20],   // Zermatt
    [9.53, 46.85],   // Chur
  ]);

  // 先创建记录（不包含 corridorGeom）
  const rdCh01 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'CH',
      name: 'ALPINE_PANORAMA_TRAVERSE',
      nameCN: '阿尔卑斯全景纵贯（湖泊 × 山脊 × 铁路）',
      nameEN: 'Alpine Panorama Traverse · Lakes, Ridges & Rail',
      description: '每天的攀升都是为了视野，而不是为了完成距离。连接因特拉肯、采尔马特、库尔的经典阿尔卑斯路线，融合湖泊、山脊徒步和铁路体验。',
      tags: ['徒步', '摄影', '自然', '湖泊', '高山'],
      regions: ['Bernese Oberland', 'Valais', 'Graubünden'],
      entryHubs: ['Interlaken', 'Zermatt', 'Chur'],
      seasonality: {
        bestMonths: [6, 7, 8, 9],
        avoidMonths: [11, 12, 1, 2, 3],
        typicalDurationDays: 7,
      },
      constraints: {
        hardConstraints: {
          maxDailyRapidAscentM: 1000,
          rapidAscentForbidden: false,
          requiresGuide: false,
        },
        softConstraints: {
          maxElevationM: 3000,
          maxDailyAscentM: 1100,
          maxSlopePct: 25,
          bufferTimeMin: 90,
        },
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: true,
        weatherWindow: true,
        weatherWindowMonths: [11, 12, 1, 2, 3, 4],
        rescueDifficulty: 'LOW',
      },
      signaturePois: {
        pois: [
          { poiId: 'harder_kulm', weight: 0.7, name: 'Harder Kulm' },
          { poiId: 'first_cliff_walk', weight: 0.9, name: 'First Cliff Walk' },
          { poiId: 'matterhorn_viewpoints', weight: 1.0, name: 'Matterhorn Viewpoints' },
        ],
        types: ['VIEWPOINT', 'LAKE', 'MOUNTAIN_PASS', 'TRAIL'],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '湖区游览', '山脊徒步', '观景日', '铁路体验'],
        dailyPace: 'MODERATE',
        restDaysRequired: [],
        objectiveWeights: {
          preferViewpoints: 0.45,
          preferPhotography: 0.35,
          preferVillages: 0.1,
        },
      },
      metadata: {
        routeType: 'HIKING',
        philosophy: '每天的攀升都是为了视野，而不是为了完成距离。',
        demDecisionPoints: {
          rollingAscent3DaysThreshold: 2600, // 3天累计爬升 > 2600m → 强制 Dr.Dre 拆天
          slopeStability: 'HIGH', // 高山湖泊区 slope 波动小 → 稳定 corridor
        },
        antiPersona: [
          '时间极度紧张',
          '拒绝徒步',
          '只想城市打卡',
        ],
        failureProfile: {
          commonFailureDays: [3, 4],
          typicalFailureReason: ['fatigue', 'weather'],
          rescueDifficulty: 'LOW',
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
    WHERE id = ${rdCh01.id}
  `, ch01Corridor);

  console.log(`✅ RD-CH-01 创建成功 (ID: ${rdCh01.id})\n`);

  // ========== RD-CH-02: Glacier Express Corridor ==========
  console.log('📌 创建 RD-CH-02: Glacier Express Corridor...');

  const ch02Corridor = createLineString([
    [7.75, 46.20],   // Zermatt
    [8.40, 46.50],   // Andermatt
    [8.55, 46.50],   // Disentis
    [9.53, 46.85],   // Chur
    [9.84, 46.49],   // St. Moritz
  ]);

  const rdCh02 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'CH',
      name: 'GLACIER_EXPRESS_SCENIC_AXIS',
      nameCN: '冰川快车慢旅行轴线',
      nameEN: 'Glacier Express Corridor · Slow Scenic Axis',
      description: '不是移动你的位置，而是展开你的视野。沿着冰川快车路线，从采尔马特到圣莫里茨，体验世界上最慢的快车，每一帧都是明信片。',
      tags: ['铁路', '摄影', '风景', '慢旅行'],
      regions: ['Valais', 'Uri', 'Graubünden'],
      entryHubs: ['Zermatt', 'St. Moritz'],
      seasonality: {
        bestMonths: [5, 6, 7, 8, 9, 10],
        avoidMonths: [11, 12, 1, 2, 3],
        typicalDurationDays: 5,
      },
      constraints: {
        hardConstraints: {
          maxElevationM: 2900,
        },
        softConstraints: {
          bufferTimeMin: 60,
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
          { poiId: 'oberalp_pass', weight: 0.9, name: 'Oberalp Pass' },
          { poiId: 'landwasser_viaduct', weight: 1.0, name: 'Landwasser Viaduct' },
        ],
        types: ['RAILWAY', 'VIEWPOINT', 'MOUNTAIN_PASS'],
      },
      itinerarySkeleton: {
        dayThemes: ['冰川快车体验', '观景日', '慢节奏游览'],
        dailyPace: 'RELAX',
        restDaysRequired: [],
        objectiveWeights: {
          preferViewpoints: 0.5,
          preferComfort: 0.3,
        },
      },
      metadata: {
        routeType: 'RAIL',
        philosophy: '不是移动你的位置，而是展开你的视野。',
        demDecisionPoints: {
          failureRate: 'VERY_LOW', // 极低失败率 RD，是 Abu 的"安全锚点"
        },
        antiPersona: [
          '追求强体能挑战',
          '讨厌铁路',
        ],
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
    WHERE id = ${rdCh02.id}
  `, ch02Corridor);

  console.log(`✅ RD-CH-02 创建成功 (ID: ${rdCh02.id})\n`);

  // ========== RD-CH-03: High Alpine Pass Challenge ==========
  console.log('📌 创建 RD-CH-03: High Alpine Pass Challenge...');

  const ch03Corridor = createLineString([
    [7.75, 46.20],   // Zermatt
    [7.96, 46.54],   // Grindelwald
    [8.03, 46.50],   // First
    [8.10, 46.60],   // Jungfraujoch
    [7.85, 46.69],   // Interlaken
  ]);

  const rdCh03 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'CH',
      name: 'HIGH_ALPINE_PASS_CHALLENGE',
      nameCN: '高阿尔卑斯山口挑战（山屋接力）',
      nameEN: 'High Alpine Pass Challenge · Hut-to-Hut',
      description: '每天都在山口结束，因为山口是理解地形的方式。这是瑞士最"像尼泊尔"的路线，DEM 是绝对裁判。适合高体能、高风险容忍的徒步者。',
      tags: ['徒步', '挑战', '高山', '山口'],
      regions: ['Valais', 'Bernese Oberland'],
      entryHubs: ['Zermatt', 'Grindelwald'],
      seasonality: {
        bestMonths: [7, 8, 9],
        avoidMonths: [11, 12, 1, 2, 3, 4, 5, 6],
        typicalDurationDays: 6,
      },
      constraints: {
        hardConstraints: {
          maxDailyRapidAscentM: 1200,
          maxElevationM: 3600,
          rapidAscentForbidden: true,
          requiresGuide: false,
        },
        softConstraints: {
          maxDailyAscentM: 1400,
          maxSlopePct: 30,
          bufferTimeMin: 120,
        },
      },
      riskProfile: {
        altitudeSickness: true,
        roadClosure: true,
        weatherWindow: true,
        weatherWindowMonths: [11, 12, 1, 2, 3, 4, 5, 6],
        rescueDifficulty: 'MEDIUM',
      },
      signaturePois: {
        pois: [
          { poiId: 'jungfraujoch', weight: 1.0, name: 'Jungfraujoch' },
          { poiId: 'matterhorn_base', weight: 0.9, name: 'Matterhorn Base' },
        ],
        types: ['MOUNTAIN_PASS', 'ALPINE_HUT', 'TRAIL'],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '山口挑战', '山屋过夜', '高海拔适应'],
        dailyPace: 'INTENSE',
        restDaysRequired: [3],
        objectiveWeights: {
          preferChallenge: 0.4,
          preferViewpoints: 0.3,
        },
      },
      metadata: {
        routeType: 'HIKING',
        philosophy: '每天都在山口结束，因为山口是理解地形的方式。',
        demDecisionPoints: {
          rollingAscent3DaysThreshold: 3000, // 更严格的阈值
          neptuneRepairStrategy: 'SWITCH_PASS', // Neptune 常用修复：换山口，而不是降难度
          demIsAbsoluteJudge: true, // DEM 是绝对裁判
        },
        antiPersona: [
          '低体能',
          '低风险容忍',
          '不愿拆天',
        ],
        failureProfile: {
          commonFailureDays: [2, 3],
          typicalFailureReason: ['fatigue', 'weather', 'altitude'],
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
    WHERE id = ${rdCh03.id}
  `, ch03Corridor);

  console.log(`✅ RD-CH-03 创建成功 (ID: ${rdCh03.id})\n`);

  // ========== RD-CH-04: Swiss Cities & Lakes Recovery ==========
  console.log('📌 创建 RD-CH-04: Swiss Cities & Lakes Recovery...');

  const ch04Corridor = createLineString([
    [8.54, 47.38],   // Zurich
    [8.31, 47.05],   // Lucerne
    [6.14, 46.20],   // Geneva
    [6.63, 46.52],   // Lausanne
  ]);

  const rdCh04 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'CH',
      name: 'SWISS_CITIES_LAKES_RECOVERY',
      nameCN: '瑞士城市与湖泊恢复路线',
      nameEN: 'Swiss Cities & Lakes · Recovery Route',
      description: '这是为恢复而存在的路线，不是挑战。适合在完成高强度徒步后，或作为低强度旅行的选择。',
      tags: ['城市', '湖泊', '慢节奏'],
      regions: ['Zurich', 'Lucerne', 'Lake Geneva'],
      entryHubs: ['Zurich', 'Geneva'],
      seasonality: {
        bestMonths: [4, 5, 6, 9, 10],
        avoidMonths: [11, 12, 1, 2, 3],
        typicalDurationDays: 4,
      },
      constraints: {
        hardConstraints: {},
        softConstraints: {
          bufferTimeMin: 30,
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
          { poiId: 'lake_zurich', weight: 0.8, name: 'Lake Zurich' },
          { poiId: 'lake_lucerne', weight: 0.9, name: 'Lake Lucerne' },
          { poiId: 'lake_geneva', weight: 1.0, name: 'Lake Geneva' },
        ],
        types: ['CITY', 'LAKE', 'CULTURAL_SITE'],
      },
      itinerarySkeleton: {
        dayThemes: ['城市游览', '湖区漫步', '文化体验'],
        dailyPace: 'RELAX',
        restDaysRequired: [],
        objectiveWeights: {
          preferComfort: 0.4,
          preferCulture: 0.3,
        },
      },
      metadata: {
        routeType: 'URBAN_SCENIC',
        philosophy: '这是为恢复而存在的路线，不是挑战。',
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
    WHERE id = ${rdCh04.id}
  `, ch04Corridor);

  console.log(`✅ RD-CH-04 创建成功 (ID: ${rdCh04.id})\n`);

  // ========== 总结 ==========
  console.log('================================================================================');
  console.log('🇨🇭 瑞士 RouteDirection Pack 创建完成！');
  console.log('================================================================================');
  console.log(`✅ RD-CH-01: Alpine Panorama Traverse (ID: ${rdCh01.id})`);
  console.log(`✅ RD-CH-02: Glacier Express Corridor (ID: ${rdCh02.id})`);
  console.log(`✅ RD-CH-03: High Alpine Pass Challenge (ID: ${rdCh03.id})`);
  console.log(`✅ RD-CH-04: Swiss Cities & Lakes Recovery (ID: ${rdCh04.id})`);
  console.log('================================================================================');
  console.log('\n📊 系统价值：');
  console.log('  • 同一国家 4 种旅行人格');
  console.log('  • 高 DEM ≠ 高风险 的真实对比样本');
  console.log('  • Abu / Dr.Dre / Neptune 的"教科书级分工场景"');
  console.log('  • 一个可以被反复复用的"安全国家模板"');
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

