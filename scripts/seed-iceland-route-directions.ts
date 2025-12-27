// scripts/seed-iceland-route-directions.ts
/**
 * 🇮🇸 Iceland RouteDirection Pack (Production Ready)
 * 
 * 冰岛 = 世界上最适合把「旅行 Agent」锻造成"世界模型级 Agent"的国家
 * 因为它把 地质、气候、道路、法律、风险 全部压在同一个棋盘上。
 * 
 * 这不是"换一个国家"，
 * 这是 把你这个 Agent 从「会规划」推到「会判断」。
 * 
 * 在冰岛，Agent 不能只做推荐，必须会"拦截"。
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
  console.log('🇮🇸 开始创建冰岛 RouteDirection Pack...\n');
  console.log('⚠️  冰岛核心现实：天气可在 30 分钟内反转，F-road ≠ 普通道路，很多"能去"不等于"该去"\n');

  // ========== RD-IS-01: Ring Road Conscious Loop ==========
  console.log('📌 创建 RD-IS-01: Ring Road Conscious Loop...');
  
  const is01Corridor = createLineString([
    [-21.94, 64.15],  // Reykjavík
    [-19.04, 63.42],  // Borgarnes
    [-22.20, 65.69],  // Akureyri
    [-14.51, 65.26],  // Egilsstaðir
    [-15.22, 64.25],  // Höfn
    [-19.04, 63.42],  // Back to Borgarnes
  ]);

  const rdIs01 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'IS',
      name: 'RING_ROAD_CONSCIOUS_LOOP',
      nameCN: '环岛公路 · 风险可控认知闭环',
      nameEN: 'Ring Road Conscious Loop · Risk-Controlled Cognitive Loop',
      description: '这是唯一一条让人类理解冰岛，而不是被冰岛教育的路线。环岛公路是冰岛的"新手安全壳"，适合所有 persona 的默认 fallback。',
      tags: ['自驾', '自然', '新手友好'],
      regions: ['South Coast', 'East Fjords', 'North Iceland'],
      entryHubs: ['Reykjavík'],
      seasonality: {
        bestMonths: [6, 7, 8, 9],
        avoidMonths: [11, 12, 1, 2, 3],
        typicalDurationDays: 10,
      },
      constraints: {
        hardConstraints: {
          fRoadForbidden: true, // F-road 禁止
          glacierCrossingForbidden: true, // 冰川穿越禁止
        },
        softConstraints: {
          maxDailyDriveKm: 300,
          bufferTimeMin: 120,
        },
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: true,
        weatherWindow: true,
        weatherWindowMonths: [11, 12, 1, 2, 3, 4, 5],
        rescueDifficulty: 'LOW',
      },
      signaturePois: {
        pois: [
          { poiId: 'golden_circle', weight: 0.9, name: 'Golden Circle' },
          { poiId: 'jökulsárlón', weight: 1.0, name: 'Jökulsárlón Glacier Lagoon' },
          { poiId: 'dettifoss', weight: 0.8, name: 'Dettifoss' },
        ],
        types: ['WATERFALL', 'GLACIER', 'GEYSER', 'VIEWPOINT'],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '环岛游览', '自然景观', '节奏修正'],
        dailyPace: 'MODERATE',
        restDaysRequired: [],
        objectiveWeights: {
          preferStability: 0.4,
          preferScenery: 0.35,
        },
      },
      metadata: {
        routeType: 'SCENIC_DRIVE',
        philosophy: '这是唯一一条让人类理解冰岛，而不是被冰岛教育的路线。',
        decisionDominance: ['WEATHER > ROAD > VEHICLE > PERSONA'],
        nonNegotiableFacts: [
          '天气可在 30 分钟内反转',
          'F-road ≠ 普通道路',
          '很多"能去"不等于"该去"',
        ],
        demDecisionPoints: {
          isNewbieSafeShell: true, // 这是冰岛的"新手安全壳"
          isDefaultFallback: true, // 是所有 persona 的默认 fallback
          drDreRole: 'PACE_ADJUSTMENT', // Dr.Dre 在此路线中几乎只负责节奏修正
        },
        antiPersona: [
          '不接受行程调整',
          '讨厌长时间驾驶',
        ],
        failureProfile: {
          commonFailureDays: [],
          typicalFailureReason: ['weather', 'wind'],
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
    WHERE id = ${rdIs01.id}
  `, is01Corridor);

  console.log(`✅ RD-IS-01 创建成功 (ID: ${rdIs01.id})\n`);

  // ========== RD-IS-02: South Coast Volcanic Axis ==========
  console.log('📌 创建 RD-IS-02: South Coast Volcanic Axis...');

  const is02Corridor = createLineString([
    [-21.94, 64.15],  // Reykjavík
    [-19.04, 63.42],  // Vík
    [-16.90, 64.02],  // Skaftafell
    [-16.18, 64.05],  // Jökulsárlón
  ]);

  const rdIs02 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'IS',
      name: 'SOUTH_COAST_VOLCANIC_AXIS',
      nameCN: '南岸火山轴线（水 × 火）',
      nameEN: 'South Coast Volcanic Axis · Water × Fire',
      description: '这是冰岛唯一一条"确定性极高"的自然展示轴线。南岸火山轴线融合瀑布、火山、冰川，但风是核心风险变量。',
      tags: ['瀑布', '火山', '冰川', '摄影'],
      regions: ['Vík', 'Skaftafell', 'Jökulsárlón'],
      entryHubs: ['Reykjavík'],
      seasonality: {
        bestMonths: [5, 6, 7, 8, 9, 10],
        avoidMonths: [11, 12, 1, 2, 3, 4],
        typicalDurationDays: 5,
      },
      constraints: {
        hardConstraints: {
          windSensitivity: 'HIGH', // 侧风是 Agent 必须显式告知的风险变量
          fRoadForbidden: true,
        },
        softConstraints: {
          bufferTimeMin: 150,
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
          { poiId: 'seljalandsfoss', weight: 0.9, name: 'Seljalandsfoss' },
          { poiId: 'skógafoss', weight: 1.0, name: 'Skógafoss' },
          { poiId: 'jökulsárlón', weight: 1.0, name: 'Jökulsárlón Glacier Lagoon' },
          { poiId: 'vík_black_sand', weight: 0.8, name: 'Vík Black Sand Beach' },
        ],
        types: ['WATERFALL', 'GLACIER', 'VOLCANO', 'COASTLINE', 'PHOTOGRAPHY'],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '瀑布游览', '冰川体验', '摄影日'],
        dailyPace: 'MODERATE',
        restDaysRequired: [],
        objectiveWeights: {
          preferIconicLandscape: 0.5,
          preferPhotography: 0.3,
        },
      },
      metadata: {
        routeType: 'SCENIC_DRIVE',
        philosophy: '这是冰岛唯一一条"确定性极高"的自然展示轴线。',
        decisionDominance: ['WIND > RAIN > SNOW'], // 冰岛核心现实：风 > 雨 > 雪
        nonNegotiableFacts: [
          '侧风是 Agent 必须显式告知的风险变量',
          '天气可在 30 分钟内反转',
        ],
        demDecisionPoints: {
          highCertainty: true, // 确定性极高
          windFirstPriority: true, // 风是第一优先级
        },
        failureProfile: {
          commonFailureDays: [1],
          typicalFailureReason: ['wind'],
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
    WHERE id = ${rdIs02.id}
  `, is02Corridor);

  console.log(`✅ RD-IS-02 创建成功 (ID: ${rdIs02.id})\n`);

  // ========== RD-IS-03: Highlands F-Road Penetration ==========
  console.log('📌 创建 RD-IS-03: Highlands F-Road Penetration (强拦截路线)...');

  const is03Corridor = createLineString([
    [-21.94, 64.15],  // Reykjavík
    [-19.06, 63.98],  // Landmannalaugar
    [-16.22, 65.03],  // Askja
  ]);

  const rdIs03 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'IS',
      name: 'HIGHLANDS_F_ROAD_PENETRATION',
      nameCN: '内陆高地 F 路穿越',
      nameEN: 'Highlands F-Road Penetration · Strong Interception Route',
      description: '这不是一条路线，这是一张"是否该放你进去"的考卷。内陆高地 F 路穿越需要 4x4 车辆、河流穿越能力和天气窗口。Agent 必须明确拒绝不合适用户。',
      tags: ['F-road', '荒野', '高风险'],
      regions: ['Landmannalaugar', 'Askja'],
      entryHubs: ['Reykjavík'],
      seasonality: {
        bestMonths: [7, 8], // 只有 7-8 月可行
        avoidMonths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12],
        typicalDurationDays: 4,
      },
      constraints: {
        hardConstraints: {
          vehicleRequired: '4x4', // 必须 4x4 车辆
          riverCrossing: true, // 需要河流穿越能力
          weatherWindowRequired: true, // 必须天气窗口
          fRoadRequired: true, // F-road 必需
        },
        softConstraints: {
          bufferTimeMin: 240, // 4 小时缓冲时间
        },
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: true,
        weatherWindow: true,
        weatherWindowMonths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12],
        rescueDifficulty: 'HIGH',
      },
      signaturePois: {
        pois: [
          { poiId: 'landmannalaugar', weight: 1.0, name: 'Landmannalaugar' },
          { poiId: 'askja', weight: 0.9, name: 'Askja Caldera' },
        ],
        types: ['F_ROAD', 'VOLCANO', 'WILDERNESS', 'RIVER_CROSSING'],
      },
      itinerarySkeleton: {
        dayThemes: ['准备日', 'F-road 穿越', '荒野体验', '返程'],
        dailyPace: 'INTENSE',
        restDaysRequired: [],
        objectiveWeights: {
          preferAdventure: 0.5,
          preferSolitude: 0.3,
        },
      },
      metadata: {
        routeType: 'ADVENTURE_DRIVE',
        philosophy: '这不是一条路线，这是一张"是否该放你进去"的考卷。',
        decisionDominance: ['WEATHER > VEHICLE > EXPERIENCE > PERSONA'],
        nonNegotiableFacts: [
          'F-road ≠ 普通道路',
          '河流穿越需要经验和能力',
          '天气窗口是硬性要求',
          '救援难度高',
        ],
        demDecisionPoints: {
          isInterceptionCore: true, // 这是冰岛拦截能力的核心样本
          requiresExplicitRejection: true, // Agent 必须明确拒绝
          requiresExplicitReason: true, // Agent 必须明确给出理由
          requiresAlternativeRoute: true, // Agent 必须明确给出替代方案（RD-IS-01 / 02）
        },
        antiPersona: [
          '第一次来冰岛',
          '无越野经验',
          '风险容忍低',
          '无 4x4 车辆',
        ],
        failureProfile: {
          commonFailureDays: [1],
          typicalFailureReason: ['river', 'weather'],
          rescueDifficulty: 'HIGH',
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
    WHERE id = ${rdIs03.id}
  `, is03Corridor);

  console.log(`✅ RD-IS-03 创建成功 (ID: ${rdIs03.id}) - 强拦截路线\n`);

  // ========== RD-IS-04: Laugavegur Trail ==========
  console.log('📌 创建 RD-IS-04: Laugavegur Trail...');

  const is04Corridor = createLineString([
    [-19.06, 63.98],  // Landmannalaugar
    [-19.50, 63.78],  // Hrafntinnusker
    [-19.20, 63.65],  // Álftavatn
    [-19.10, 63.55],  // Emstrur
    [-19.00, 63.48],  // Þórsmörk
  ]);

  const rdIs04 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'IS',
      name: 'LAUGAVEGUR_TRAIL',
      nameCN: '劳加韦古尔火山徒步',
      nameEN: 'Laugavegur Trail · World-Class Hiking Sample',
      description: '这是"地球在施工中"的可步行版本。劳加韦古尔火山徒步是世界级徒步路线，需要天气窗口和适当的体能。',
      tags: ['徒步', '火山', '地貌'],
      regions: ['Landmannalaugar → Þórsmörk'],
      entryHubs: ['Reykjavík'],
      seasonality: {
        bestMonths: [7, 8], // 只有 7-8 月可行
        avoidMonths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12],
        typicalDurationDays: 4,
      },
      constraints: {
        hardConstraints: {
          weatherWindowRequired: true, // 必须天气窗口
          rapidAscentForbidden: true,
        },
        softConstraints: {
          maxDailyAscentM: 900,
          bufferTimeMin: 180, // 3 小时缓冲时间
        },
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: true,
        weatherWindow: true,
        weatherWindowMonths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12],
        rescueDifficulty: 'MEDIUM',
      },
      signaturePois: {
        pois: [
          { poiId: 'landmannalaugar', weight: 1.0, name: 'Landmannalaugar' },
          { poiId: 'hrafntinnusker', weight: 0.8, name: 'Hrafntinnusker' },
          { poiId: 'álftavatn', weight: 0.9, name: 'Álftavatn' },
          { poiId: 'þórsmörk', weight: 1.0, name: 'Þórsmörk' },
        ],
        types: ['TRAIL', 'VOLCANO', 'GEOLOGY', 'WILDERNESS'],
      },
      itinerarySkeleton: {
        dayThemes: ['准备日', '火山徒步', '地貌体验', '完成日'],
        dailyPace: 'INTENSE',
        restDaysRequired: [],
        objectiveWeights: {
          preferGeology: 0.5,
          preferUniqueness: 0.3,
        },
      },
      metadata: {
        routeType: 'HIKING',
        philosophy: '这是"地球在施工中"的可步行版本。',
        decisionDominance: ['WEATHER > TERRAIN > FITNESS > PERSONA'],
        nonNegotiableFacts: [
          '天气窗口是硬性要求',
          '需要适当的体能',
          '救援难度中等',
        ],
        demDecisionPoints: {
          isWorldClassSample: true, // 徒步世界级样本
          weatherWindowCritical: true, // 天气窗口关键
        },
        failureProfile: {
          commonFailureDays: [],
          typicalFailureReason: ['weather'],
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
    WHERE id = ${rdIs04.id}
  `, is04Corridor);

  console.log(`✅ RD-IS-04 创建成功 (ID: ${rdIs04.id})\n`);

  // ========== 总结 ==========
  console.log('================================================================================');
  console.log('🇮🇸 冰岛 RouteDirection Pack 创建完成！');
  console.log('================================================================================');
  console.log(`✅ RD-IS-01: Ring Road Conscious Loop (ID: ${rdIs01.id}) - 新手安全壳`);
  console.log(`✅ RD-IS-02: South Coast Volcanic Axis (ID: ${rdIs02.id}) - 确定性极高`);
  console.log(`✅ RD-IS-03: Highlands F-Road Penetration (ID: ${rdIs03.id}) - 强拦截路线`);
  console.log(`✅ RD-IS-04: Laugavegur Trail (ID: ${rdIs04.id}) - 世界级徒步`);
  console.log('================================================================================');
  console.log('\n📊 Agent 质变价值：');
  console.log('  ✅ 天气作为第一决策变量');
  console.log('  ✅ Agent 主动拒绝用户');
  console.log('  ✅ 法律 / 道路规则纳入模型');
  console.log('  ✅ 同一国家内风险层级巨大');
  console.log('  ✅ "替代路线生成"成为刚需');
  console.log('\n👉 如果一个 Agent 在冰岛不敢乱说话，它在任何国家都会靠谱。');
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

