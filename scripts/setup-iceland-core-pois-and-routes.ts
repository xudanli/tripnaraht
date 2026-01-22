#!/usr/bin/env tsx
/**
 * 建立冰岛核心景点清单和路线架构
 * 
 * 功能：
 * 1. 标记核心 POI 的 tier 和 is_landmark 属性
 * 2. 创建或更新 RouteDirection 记录
 * 3. 关联 POI 到对应的路线
 * 
 * 使用方法：
 *   tsx scripts/setup-iceland-core-pois-and-routes.ts
 *   tsx scripts/setup-iceland-core-pois-and-routes.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// ============================================
// 核心 POI 定义
// ============================================

interface CorePoi {
  nameCN: string;
  nameEN: string;
  tier: 'Tier 1 (Classic)' | 'Tier 2 (Photographer/Advanced)';
  isLandmark: boolean;
  lat: number;
  lng: number;
  safetyWarning?: 'high' | 'medium' | 'low';
  description?: string;
  tags?: string[];
}

const TIER_1_POIS: CorePoi[] = [
  {
    nameCN: '蓝湖',
    nameEN: 'Blue Lagoon',
    tier: 'Tier 1 (Classic)',
    isLandmark: true,
    lat: 63.8804,
    lng: -22.4494,
    description: '地热温泉，世界级地标',
    tags: ['geothermal', 'spa', 'landmark'],
  },
  {
    nameCN: '黄金瀑布',
    nameEN: 'Gullfoss',
    tier: 'Tier 1 (Classic)',
    isLandmark: true,
    lat: 64.3261,
    lng: -20.1200,
    description: '黄金圈核心，气势磅礴',
    tags: ['waterfall', 'golden-circle'],
  },
  {
    nameCN: '杰古沙龙冰河湖',
    nameEN: 'Jökulsárlón',
    tier: 'Tier 1 (Classic)',
    isLandmark: true,
    lat: 64.0485,
    lng: -16.1794,
    description: '巨大的漂浮冰山，电影取景地',
    tags: ['glacier', 'lagoon', 'photography'],
  },
  {
    nameCN: '黑沙滩',
    nameEN: 'Reynisfjara',
    tier: 'Tier 1 (Classic)',
    isLandmark: true,
    lat: 63.4048,
    lng: -19.0453,
    safetyWarning: 'high',
    description: '玄武岩柱和海浪，需标记 safety_warning: high',
    tags: ['beach', 'basalt', 'dangerous'],
  },
  {
    nameCN: '辛格维利尔国家公园',
    nameEN: 'Þingvellir National Park',
    tier: 'Tier 1 (Classic)',
    isLandmark: true,
    lat: 64.2556,
    lng: -21.1297,
    description: '欧美板块裂缝，世界遗产',
    tags: ['national-park', 'geology', 'unesco'],
  },
];

const TIER_2_POIS: CorePoi[] = [
  {
    nameCN: '钻石沙滩',
    nameEN: 'Diamond Beach',
    tier: 'Tier 2 (Photographer/Advanced)',
    isLandmark: false,
    lat: 64.0485,
    lng: -16.1794,
    description: '就在冰河湖对面，黑沙上的碎冰',
    tags: ['beach', 'photography', 'ice'],
  },
  {
    nameCN: '斯科加瀑布',
    nameEN: 'Skógafoss',
    tier: 'Tier 2 (Photographer/Advanced)',
    isLandmark: false,
    lat: 63.5314,
    lng: -19.5114,
    description: '南岸两大瀑布之一',
    tags: ['waterfall', 'south-coast'],
  },
  {
    nameCN: '塞里雅兰瀑布',
    nameEN: 'Seljalandsfoss',
    tier: 'Tier 2 (Photographer/Advanced)',
    isLandmark: false,
    lat: 63.6156,
    lng: -19.9897,
    description: '南岸两大瀑布之一，可以走到水帘后面',
    tags: ['waterfall', 'south-coast', 'photography'],
  },
  {
    nameCN: '教会山',
    nameEN: 'Kirkjufell',
    tier: 'Tier 2 (Photographer/Advanced)',
    isLandmark: false,
    lat: 64.9417,
    lng: -23.3069,
    description: '《权力的游戏》取景地，斯奈山半岛标志',
    tags: ['mountain', 'photography', 'snaefellsnes'],
  },
  {
    nameCN: '斯蒂德吉尔峡谷',
    nameEN: 'Stuðlagil Canyon',
    tier: 'Tier 2 (Photographer/Advanced)',
    isLandmark: false,
    lat: 65.1644,
    lng: -15.3011,
    description: '网红玄武岩峡谷，近几年非常火，适合增加到"小众/深度"推荐中',
    tags: ['canyon', 'basalt', 'hidden-gem'],
  },
];

// ============================================
// 路线定义
// ============================================

interface RouteDefinition {
  name: string;
  nameCN: string;
  nameEN: string;
  description: string;
  tags: string[];
  regions: string[];
  entryHubs: string[];
  seasonality?: {
    bestMonths?: number[];
    avoidMonths?: number[];
  };
  constraints?: {
    difficulty?: 'easy' | 'medium' | 'hard';
    season?: 'all_year' | 'summer_only' | 'winter_careful';
    duration?: string;
    vehicle?: string;
  };
  riskProfile?: {
    roadClosure?: boolean;
    weatherWindow?: boolean;
    weatherWindowMonths?: number[];
  };
  signaturePoiNames?: string[]; // POI 名称列表，用于关联
}

const ROUTES: RouteDefinition[] = [
  {
    name: 'golden_circle',
    nameCN: '黄金圈',
    nameEN: 'Golden Circle',
    description: '300公里闭环，当天往返雷克雅未克',
    tags: ['classic', 'day-trip', 'easy'],
    regions: ['IS_GOLDEN_CIRCLE'],
    entryHubs: ['IS_REYKJAVIK'],
    seasonality: {
      bestMonths: [5, 6, 7, 8, 9],
    },
    constraints: {
      difficulty: 'easy',
      season: 'all_year',
      duration: '1_day',
    },
    signaturePoiNames: ['Þingvellir National Park', 'Gullfoss', 'Geysir'],
  },
  {
    name: 'ring_road',
    nameCN: '1号公路环岛',
    nameEN: 'Ring Road',
    description: '环绕冰岛一周的主干道，约 1332 公里',
    tags: ['classic', 'road-trip', 'scenic'],
    regions: ['IS_SOUTH_COAST', 'IS_VIK', 'IS_HOFN', 'IS_EGILSSTADIR', 'IS_AKUREYRI'],
    entryHubs: ['IS_REYKJAVIK', 'IS_KEFLAVIK_AIRPORT'],
    seasonality: {
      bestMonths: [5, 6, 7, 8, 9],
    },
    constraints: {
      difficulty: 'medium',
      season: 'all_year',
      duration: '7_to_10_days',
    },
    riskProfile: {
      roadClosure: true,
      weatherWindow: true,
      weatherWindowMonths: [12, 1, 2],
    },
    signaturePoiNames: ['Gullfoss', 'Jökulsárlón', 'Reynisfjara', 'Skógafoss', 'Seljalandsfoss'],
  },
  {
    name: 'diamond_circle',
    nameCN: '钻石圈',
    nameEN: 'Diamond Circle',
    description: '北部的"黄金圈"，针对去北部深度游的用户',
    tags: ['north', 'advanced', 'scenic'],
    regions: ['IS_AKUREYRI', 'IS_HUSAVIK'],
    entryHubs: ['IS_AKUREYRI'],
    seasonality: {
      bestMonths: [6, 7, 8],
    },
    constraints: {
      difficulty: 'medium',
      season: 'summer_only',
      duration: '2_to_3_days',
    },
    signaturePoiNames: ['Goðafoss', 'Lake Mývatn', 'Dettifoss', 'Ásbyrgi', 'Húsavík'],
  },
  {
    name: 'arctic_coast_way',
    nameCN: '北极海岸之路',
    nameEN: 'Arctic Coast Way',
    description: '2019年新开通的官方路线，主打"远离人群"和"北极圈"。沿着北部海岸线行驶，全长 900 公里，经过 21 个渔村',
    tags: ['off-the-beaten-path', 'arctic', 'remote'],
    regions: ['IS_AKUREYRI', 'IS_HUSAVIK'],
    entryHubs: ['IS_AKUREYRI'],
    seasonality: {
      bestMonths: [6, 7, 8],
    },
    constraints: {
      difficulty: 'hard',
      season: 'summer_only',
      duration: '5_to_7_days',
      vehicle: '4x4_recommended',
    },
    riskProfile: {
      roadClosure: true,
      weatherWindow: true,
    },
    signaturePoiNames: [],
  },
  {
    name: 'westfjords_way',
    nameCN: '西峡湾之路',
    nameEN: 'Westfjords Way',
    description: '终极探险路线',
    tags: ['adventure', 'remote', 'extreme'],
    regions: [],
    entryHubs: ['IS_REYKJAVIK'],
    seasonality: {
      bestMonths: [6, 7, 8],
      avoidMonths: [12, 1, 2, 3, 4, 5, 9, 10, 11],
    },
    constraints: {
      difficulty: 'hard',
      season: 'summer_only',
      duration: '3_to_5_days',
      vehicle: '4x4_recommended',
    },
    riskProfile: {
      roadClosure: true,
      weatherWindow: true,
    },
    signaturePoiNames: ['Dynjandi', 'Rauðasandur', 'Látrabjarg'],
  },
];

// ============================================
// 辅助函数
// ============================================

/**
 * 查找或创建冰岛城市
 */
async function getOrCreateIcelandCity(): Promise<number> {
  let city = await prisma.city.findFirst({
    where: { countryCode: 'IS' },
  });

  if (!city) {
    city = await prisma.city.create({
      data: {
        name: 'Iceland',
        countryCode: 'IS',
        nameCN: '冰岛',
        nameEN: 'Iceland',
      },
    });
  }

  return city.id;
}

/**
 * 检查名称是否匹配（更精确的匹配）
 */
function isNameMatch(placeName: string | null, targetName: string): boolean {
  if (!placeName) return false;
  const normalizedPlace = placeName.toLowerCase().trim();
  const normalizedTarget = targetName.toLowerCase().trim();
  
  // 精确匹配
  if (normalizedPlace === normalizedTarget) return true;
  
  // 包含匹配（但排除太短的单词，避免误匹配）
  if (normalizedTarget.length >= 5 && normalizedPlace.includes(normalizedTarget)) return true;
  if (normalizedPlace.length >= 5 && normalizedTarget.includes(normalizedPlace)) return true;
  
  return false;
}

/**
 * 查找或创建 POI
 */
async function findOrCreatePoi(poi: CorePoi, cityId: number, dryRun: boolean): Promise<number | null> {
  // 先尝试精确匹配中文名或英文名
  let place = await prisma.place.findFirst({
    where: {
      OR: [
        { nameCN: poi.nameCN },
        { nameEN: poi.nameEN },
      ],
      category: 'ATTRACTION',
    },
  });

  // 如果精确匹配没找到，尝试包含匹配（但更严格）
  if (!place) {
    const places = await prisma.place.findMany({
      where: {
        OR: [
          { nameCN: { contains: poi.nameCN } },
          { nameEN: { contains: poi.nameEN } },
        ],
        category: 'ATTRACTION',
      },
    });

    // 找到最匹配的（优先中文名匹配，然后是英文名匹配）
    place = places.find(p => 
      isNameMatch(p.nameCN, poi.nameCN) || isNameMatch(p.nameEN, poi.nameEN)
    ) || places[0]; // 如果都不匹配，取第一个（但这种情况应该很少）
  }

  // 如果没找到，尝试通过坐标查找（1000米范围内，扩大范围）
  if (!place) {
    const result = await prisma.$queryRaw<any[]>`
      SELECT id, "nameCN", "nameEN", ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
      ) as distance
      FROM "Place"
      WHERE category = 'ATTRACTION'
        AND location IS NOT NULL
        AND ST_Distance(
          location::geography,
          ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
        ) < 1000
      ORDER BY distance
      LIMIT 1
    `;

    if (result && result.length > 0) {
      const distance = parseFloat(result[0].distance);
      // 如果距离很近（500米内）且名称相关，才使用
      if (distance < 500) {
        const candidatePlace = await prisma.place.findUnique({
          where: { id: result[0].id },
        });
        
        // 验证名称是否相关（避免误匹配）
        if (candidatePlace && (
          isNameMatch(candidatePlace.nameCN, poi.nameCN) ||
          isNameMatch(candidatePlace.nameEN, poi.nameEN) ||
          (poi.nameCN.includes('蓝湖') && candidatePlace.nameCN?.includes('蓝湖')) ||
          (poi.nameEN.includes('Diamond') && candidatePlace.nameEN?.includes('Diamond'))
        )) {
          place = candidatePlace;
          console.log(`    ℹ️  通过坐标匹配找到: ${result[0].nameCN} (距离: ${distance.toFixed(0)}m)`);
        }
      }
    }
  }

  if (place) {
    // 更新 metadata
    const metadata = (place.metadata as any) || {};
    metadata.tier = poi.tier;
    metadata.is_landmark = poi.isLandmark;
    if (poi.safetyWarning) {
      metadata.safety_warning = poi.safetyWarning;
    }
    if (poi.tags) {
      metadata.tags = [...(metadata.tags || []), ...poi.tags];
    }

    if (!dryRun) {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          metadata: metadata as any,
          cityId: place.cityId || cityId, // 如果原来没有cityId，则设置
          updatedAt: new Date(),
        },
      });
    }

    console.log(`  ✓ ${dryRun ? '[DRY RUN] ' : ''}更新 POI: ${poi.nameCN} (ID: ${place.id}, cityId: ${place.cityId || cityId})`);
    return place.id;
  } else {
    // 创建新 POI
    if (!dryRun) {
      const newPlace = await prisma.place.create({
        data: {
          uuid: randomUUID(),
          nameCN: poi.nameCN,
          nameEN: poi.nameEN,
          category: 'ATTRACTION',
          description: poi.description,
          cityId: cityId,
          metadata: {
            tier: poi.tier,
            is_landmark: poi.isLandmark,
            safety_warning: poi.safetyWarning,
            tags: poi.tags || [],
          } as any,
          updatedAt: new Date(),
        } as any,
      });

      // 更新地理位置
      await prisma.$executeRaw`
        UPDATE "Place"
        SET location = ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
        WHERE id = ${newPlace.id}
      `;

      console.log(`  ✓ ${dryRun ? '[DRY RUN] ' : ''}创建 POI: ${poi.nameCN} (ID: ${newPlace.id}, cityId: ${cityId})`);
      return newPlace.id;
    } else {
      console.log(`  ✓ [DRY RUN] 将创建 POI: ${poi.nameCN}`);
      return null;
    }
  }
}

/**
 * 查找 POI 的 ID（通过名称）
 */
async function findPoiIdsByNames(names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    const place = await prisma.place.findFirst({
      where: {
        OR: [
          { nameCN: { contains: name } },
          { nameEN: { contains: name } },
        ],
        category: 'ATTRACTION',
      },
    });
    if (place) {
      ids.push(place.id);
    }
  }
  return ids;
}

/**
 * 创建或更新 RouteDirection
 */
async function createOrUpdateRoute(
  route: RouteDefinition,
  poiIds: number[],
  dryRun: boolean,
): Promise<void> {
  // 查找是否已存在
  const existing = await prisma.routeDirection.findFirst({
    where: {
      countryCode: 'IS',
      name: route.name,
    },
  });

  const signaturePois = {
    types: route.tags,
    examples: poiIds.length > 0 ? poiIds.map(id => ({ placeId: id })) : [],
  };

  const routeData = {
    countryCode: 'IS',
    name: route.name,
    nameCN: route.nameCN,
    nameEN: route.nameEN,
    description: route.description,
    tags: route.tags,
    regions: route.regions,
    entryHubs: route.entryHubs,
    seasonality: route.seasonality,
    constraints: route.constraints,
    riskProfile: route.riskProfile,
    signaturePois: signaturePois,
    isActive: true,
    status: 'active' as const,
    updatedAt: new Date(),
  };

  if (existing) {
    if (!dryRun) {
      await prisma.routeDirection.update({
        where: { id: existing.id },
        data: routeData as any,
      });
    }
    console.log(`  ✓ ${dryRun ? '[DRY RUN] ' : ''}更新路线: ${route.nameCN} (ID: ${existing.id})`);
  } else {
    if (!dryRun) {
      await prisma.routeDirection.create({
        data: {
          ...routeData,
          uuid: randomUUID(),
          createdAt: new Date(),
        } as any,
      });
    }
    console.log(`  ✓ ${dryRun ? '[DRY RUN] ' : ''}创建路线: ${route.nameCN}`);
  }
}

// ============================================
// 主函数
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('冰岛核心景点和路线架构设置');
  console.log('='.repeat(60));
  console.log(`模式: ${dryRun ? '🔍 预览模式（不会实际修改）' : '✅ 执行模式'}`);
  console.log('');

  try {
    // 0. 获取或创建冰岛城市
    console.log('🏙️  查找或创建冰岛城市...');
    const cityId = await getOrCreateIcelandCity();
    console.log(`  ✓ 冰岛城市 ID: ${cityId}\n`);

    // 1. 处理 Tier 1 POIs
    console.log('📌 处理 Tier 1 核心景点...');
    const tier1PoiIds: number[] = [];
    for (const poi of TIER_1_POIS) {
      const id = await findOrCreatePoi(poi, cityId, dryRun);
      if (id) tier1PoiIds.push(id);
    }
    console.log(`  完成 ${TIER_1_POIS.length} 个 Tier 1 POI (找到/创建: ${tier1PoiIds.length})\n`);

    // 2. 处理 Tier 2 POIs
    console.log('📌 处理 Tier 2 景点...');
    const tier2PoiIds: number[] = [];
    for (const poi of TIER_2_POIS) {
      const id = await findOrCreatePoi(poi, cityId, dryRun);
      if (id) tier2PoiIds.push(id);
    }
    console.log(`  完成 ${TIER_2_POIS.length} 个 Tier 2 POI (找到/创建: ${tier2PoiIds.length})\n`);

    // 3. 创建或更新路线
    console.log('🛣️  创建或更新路线...');
    for (const route of ROUTES) {
      // 查找关联的 POI IDs
      const poiIds = route.signaturePoiNames
        ? await findPoiIdsByNames(route.signaturePoiNames)
        : [];

      await createOrUpdateRoute(route, poiIds, dryRun);
    }
    console.log(`  完成 ${ROUTES.length} 条路线\n`);

    console.log('='.repeat(60));
    console.log('✅ 完成！');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ 错误:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
