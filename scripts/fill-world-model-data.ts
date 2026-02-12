/**
 * 世界模型数据填充脚本
 * 
 * 功能：
 * 1. 从 DEM 表填充 Place.metadata.elevationMeters
 * 2. 根据地点类别和位置推断 terrain 类型
 * 3. 按国家/地区填充 seasonality
 * 4. 为缺失 physicalMetadata 的地点生成数据
 * 
 * 使用方法：
 *   npx ts-node scripts/fill-world-model-data.ts
 *   npx ts-node scripts/fill-world-model-data.ts --dry-run  # 仅检查，不更新
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';

const prisma = new PrismaClient();

// 季节性配置（按国家）
const SEASONALITY_CONFIG: Record<string, {
  highSeason: number[];      // 最佳月份
  shoulderSeason: number[];  // 过渡月份
  lowSeason: number[];       // 淡季月份
  hazardMonths?: number[];   // 高风险月份
  notes?: string;
}> = {
  IS: {  // 冰岛
    highSeason: [6, 7, 8],
    shoulderSeason: [5, 9],
    lowSeason: [1, 2, 3, 4, 10, 11, 12],
    hazardMonths: [11, 12, 1, 2, 3],
    notes: 'F-roads typically closed Oct-Jun',
  },
  NO: {  // 挪威
    highSeason: [6, 7, 8],
    shoulderSeason: [5, 9],
    lowSeason: [1, 2, 3, 4, 10, 11, 12],
    hazardMonths: [12, 1, 2],
    notes: 'Northern lights season Sep-Mar',
  },
  SJ: {  // 斯瓦尔巴
    highSeason: [6, 7, 8],
    shoulderSeason: [3, 4, 5, 9],
    lowSeason: [1, 2, 10, 11, 12],
    hazardMonths: [11, 12, 1, 2],
    notes: 'Polar night Nov-Feb, midnight sun Apr-Aug',
  },
  CN: {  // 中国
    highSeason: [4, 5, 9, 10],
    shoulderSeason: [3, 6, 11],
    lowSeason: [1, 2, 7, 8, 12],
    notes: 'Varies greatly by region',
  },
  GL: {  // 格陵兰
    highSeason: [6, 7, 8],
    shoulderSeason: [5, 9],
    lowSeason: [1, 2, 3, 4, 10, 11, 12],
    hazardMonths: [11, 12, 1, 2, 3],
  },
  NP: {  // 尼泊尔
    highSeason: [10, 11, 3, 4],
    shoulderSeason: [2, 5, 9, 12],
    lowSeason: [6, 7, 8, 1],
    hazardMonths: [6, 7, 8],  // 雨季
    notes: 'Monsoon season Jun-Aug',
  },
  CH: {  // 瑞士
    highSeason: [6, 7, 8, 12, 1, 2],
    shoulderSeason: [5, 9, 3],
    lowSeason: [4, 10, 11],
    notes: 'Winter sports Dec-Mar',
  },
};

// 地形类型推断规则
function inferTerrainType(
  category: PlaceCategory,
  elevation: number | null,
  metadata: any
): string {
  // 从 metadata 中提取线索
  const nameCN = metadata?.nameCN || '';
  const nameEN = metadata?.nameEN || '';
  const description = metadata?.description || '';
  const combined = `${nameCN} ${nameEN} ${description}`.toLowerCase();
  
  // 关键词匹配
  if (combined.includes('glacier') || combined.includes('冰川')) return 'GLACIER';
  if (combined.includes('volcano') || combined.includes('火山')) return 'VOLCANIC';
  if (combined.includes('beach') || combined.includes('海滩')) return 'COASTAL';
  if (combined.includes('waterfall') || combined.includes('瀑布')) return 'WATERFALL';
  if (combined.includes('mountain') || combined.includes('山') || combined.includes('登山')) return 'MOUNTAIN';
  if (combined.includes('forest') || combined.includes('森林')) return 'FOREST';
  if (combined.includes('desert') || combined.includes('沙漠')) return 'DESERT';
  if (combined.includes('lake') || combined.includes('湖')) return 'LAKESIDE';
  if (combined.includes('river') || combined.includes('河')) return 'RIVERSIDE';
  if (combined.includes('trail') || combined.includes('步道') || combined.includes('徒步')) return 'TRAIL';
  
  // 基于海拔推断
  if (elevation !== null) {
    if (elevation > 4000) return 'HIGH_ALTITUDE';
    if (elevation > 2000) return 'MOUNTAIN';
    if (elevation > 500) return 'HILLY';
  }
  
  // 基于类别推断
  switch (category) {
    case PlaceCategory.ATTRACTION:
      return 'MIXED';
    case PlaceCategory.HOTEL:
    case PlaceCategory.RESTAURANT:
    case PlaceCategory.SHOPPING:
      return 'URBAN';
    case PlaceCategory.TRANSIT_HUB:
      return 'URBAN';
    default:
      return 'FLAT';
  }
}

// 生成默认的 physicalMetadata
function generatePhysicalMetadata(category: PlaceCategory, metadata: any) {
  const defaults: Record<PlaceCategory, any> = {
    ATTRACTION: {
      base_fatigue_score: 5,
      terrain_type: 'FLAT',
      seated_ratio: 0.2,
      intensity_factor: 1.0,
      has_elevator: false,
      wheelchair_accessible: false,
      estimated_duration_min: 60,
    },
    RESTAURANT: {
      base_fatigue_score: 2,
      terrain_type: 'FLAT',
      seated_ratio: 0.9,
      intensity_factor: 0.3,
      has_elevator: false,
      wheelchair_accessible: true,
      estimated_duration_min: 60,
    },
    HOTEL: {
      base_fatigue_score: 1,
      terrain_type: 'FLAT',
      seated_ratio: 0.8,
      intensity_factor: 0.2,
      has_elevator: true,
      wheelchair_accessible: true,
      estimated_duration_min: 30,
    },
    SHOPPING: {
      base_fatigue_score: 4,
      terrain_type: 'FLAT',
      seated_ratio: 0.1,
      intensity_factor: 0.8,
      has_elevator: true,
      wheelchair_accessible: true,
      estimated_duration_min: 90,
    },
    TRANSIT_HUB: {
      base_fatigue_score: 3,
      terrain_type: 'FLAT',
      seated_ratio: 0.3,
      intensity_factor: 0.5,
      has_elevator: true,
      wheelchair_accessible: true,
      estimated_duration_min: 30,
    },
    HOSPITAL: {
      base_fatigue_score: 2,
      terrain_type: 'FLAT',
      seated_ratio: 0.5,
      intensity_factor: 0.3,
      has_elevator: true,
      wheelchair_accessible: true,
      estimated_duration_min: 60,
    },
  };
  
  return defaults[category] || defaults.ATTRACTION;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         世界模型数据填充脚本                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (isDryRun) {
    console.log('🔍 运行模式: 仅检查 (--dry-run)\n');
  } else {
    console.log('⚠️  运行模式: 实际更新数据\n');
  }

  // ========== 1. 填充缺失的 physicalMetadata ==========
  console.log('📋 步骤 1: 填充缺失的 physicalMetadata');
  
  const placesWithoutPhysical = await prisma.$queryRaw<any[]>`
    SELECT id, category, "nameCN", metadata 
    FROM "Place" 
    WHERE "physicalMetadata" IS NULL
  `;
  
  console.log(`   发现 ${placesWithoutPhysical.length} 个地点缺少 physicalMetadata`);
  
  if (!isDryRun && placesWithoutPhysical.length > 0) {
    for (const place of placesWithoutPhysical) {
      const physicalMetadata = generatePhysicalMetadata(place.category, place.metadata);
      await prisma.place.update({
        where: { id: place.id },
        data: { physicalMetadata },
      });
    }
    console.log(`   ✅ 已更新 ${placesWithoutPhysical.length} 个地点\n`);
  } else {
    console.log('   ⏭️  跳过更新\n');
  }

  // ========== 2. 从 DEM 填充高程数据 ==========
  console.log('📋 步骤 2: 从 DEM 表填充高程数据');
  
  // 统计当前缺少高程数据的地点
  const placesNeedElevation = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Place" 
    WHERE location IS NOT NULL 
    AND (metadata->>'elevationMeters' IS NULL OR metadata->>'elevationMeters' = 'null')
  `;
  
  console.log(`   发现 ${placesNeedElevation[0].count} 个地点缺少高程数据`);
  
  if (!isDryRun) {
    // 从栅格 DEM 填充高程 (使用 ST_Value 从栅格数据中提取高程)
    // 注意：geo_dem_* 表存储的是栅格数据 (rast 列)，需要使用 ST_Value 函数
    try {
      // 首先尝试从冰岛 DEM 获取
      const elevationResultIS = await prisma.$executeRaw`
        UPDATE "Place" p
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{elevationMeters}',
          to_jsonb(
            (SELECT ST_Value(d.rast, p.location::geometry)
             FROM geo_dem_iceland_20m d 
             WHERE ST_Intersects(d.rast, p.location::geometry)
             LIMIT 1)
          )
        )
        WHERE location IS NOT NULL 
        AND (metadata->>'elevationMeters' IS NULL OR metadata->>'elevationMeters' = 'null')
        AND EXISTS (
          SELECT 1 FROM geo_dem_iceland_20m d 
          WHERE ST_Intersects(d.rast, p.location::geometry)
        )
      `;
      console.log(`   已从冰岛 DEM 更新 ${elevationResultIS} 个地点`);
      
      // 然后从全球 DEM 获取
      const elevationResultGlobal = await prisma.$executeRaw`
        UPDATE "Place" p
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{elevationMeters}',
          to_jsonb(
            (SELECT ST_Value(d.rast, p.location::geometry)
             FROM geo_dem_global d 
             WHERE ST_Intersects(d.rast, p.location::geometry)
             LIMIT 1)
          )
        )
        WHERE location IS NOT NULL 
        AND (metadata->>'elevationMeters' IS NULL OR metadata->>'elevationMeters' = 'null')
        AND EXISTS (
          SELECT 1 FROM geo_dem_global d 
          WHERE ST_Intersects(d.rast, p.location::geometry)
        )
      `;
      console.log(`   已从全球 DEM 更新 ${elevationResultGlobal} 个地点\n`);
    } catch (demError: any) {
      console.log(`   ⚠️  DEM 高程提取失败: ${demError.message}`);
      console.log('   跳过高程填充（可能需要更完整的 DEM 数据）\n');
    }
  } else {
    console.log('   ⏭️  跳过更新\n');
  }

  // ========== 3. 填充地形类型 ==========
  console.log('📋 步骤 3: 填充地形类型 (terrain)');
  
  const placesNeedTerrain = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Place" 
    WHERE metadata->>'terrain' IS NULL
  `;
  
  console.log(`   发现 ${placesNeedTerrain[0].count} 个地点缺少地形类型`);
  
  if (!isDryRun) {
    // 获取需要更新的地点（使用原生 SQL 避免类型问题）
    const places = await prisma.$queryRaw<any[]>`
      SELECT id, category, "nameCN", "nameEN", description, metadata
      FROM "Place"
      WHERE metadata->>'terrain' IS NULL
      LIMIT 1000
    `;
    
    let updated = 0;
    for (const place of places) {
      const elevation = (place.metadata as any)?.elevationMeters || null;
      const terrain = inferTerrainType(place.category, elevation, {
        nameCN: place.nameCN,
        nameEN: place.nameEN,
        description: place.description,
      });
      
      await prisma.place.update({
        where: { id: place.id },
        data: {
          metadata: {
            ...(place.metadata as object || {}),
            terrain,
          },
        },
      });
      updated++;
    }
    console.log(`   ✅ 已更新 ${updated} 个地点的地形类型\n`);
  } else {
    console.log('   ⏭️  跳过更新\n');
  }

  // ========== 4. 填充季节性数据 ==========
  console.log('📋 步骤 4: 填充季节性数据 (seasonality)');
  
  const placesNeedSeasonality = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "Place" 
    WHERE metadata->>'seasonality' IS NULL
  `;
  
  console.log(`   发现 ${placesNeedSeasonality[0].count} 个地点缺少季节性数据`);
  
  if (!isDryRun) {
    // 按城市关联国家，填充季节性
    for (const [countryCode, config] of Object.entries(SEASONALITY_CONFIG)) {
      const result = await prisma.$executeRaw`
        UPDATE "Place" p
        SET metadata = jsonb_set(
          COALESCE(p.metadata, '{}'::jsonb),
          '{seasonality}',
          ${JSON.stringify(config)}::jsonb
        )
        FROM "City" c
        WHERE p."cityId" = c.id
        AND c."countryCode" = ${countryCode}
        AND (p.metadata->>'seasonality' IS NULL)
      `;
      if (result > 0) {
        console.log(`   已为 ${countryCode} 的 ${result} 个地点填充季节性`);
      }
    }
    console.log('   ✅ 季节性数据填充完成\n');
  } else {
    console.log('   ⏭️  跳过更新\n');
  }

  // ========== 5. 生成数据质量报告 ==========
  console.log('📊 数据质量报告:\n');
  
  const stats = await prisma.$queryRaw<any[]>`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN "physicalMetadata" IS NOT NULL THEN 1 END) as has_physical,
      COUNT(CASE WHEN metadata->>'elevationMeters' IS NOT NULL AND metadata->>'elevationMeters' != 'null' THEN 1 END) as has_elevation,
      COUNT(CASE WHEN metadata->>'terrain' IS NOT NULL THEN 1 END) as has_terrain,
      COUNT(CASE WHEN metadata->>'seasonality' IS NOT NULL THEN 1 END) as has_seasonality,
      COUNT(CASE WHEN location IS NOT NULL THEN 1 END) as has_location
    FROM "Place"
  `;
  
  const s = stats[0];
  console.log(`   总地点数:          ${s.total}`);
  console.log(`   有 physicalMetadata: ${s.has_physical} (${(Number(s.has_physical) / Number(s.total) * 100).toFixed(1)}%)`);
  console.log(`   有 elevationMeters:  ${s.has_elevation} (${(Number(s.has_elevation) / Number(s.total) * 100).toFixed(1)}%)`);
  console.log(`   有 terrain:          ${s.has_terrain} (${(Number(s.has_terrain) / Number(s.total) * 100).toFixed(1)}%)`);
  console.log(`   有 seasonality:      ${s.has_seasonality} (${(Number(s.has_seasonality) / Number(s.total) * 100).toFixed(1)}%)`);
  console.log(`   有 location:         ${s.has_location} (${(Number(s.has_location) / Number(s.total) * 100).toFixed(1)}%)`);
  
  console.log('\n✅ 脚本执行完成\n');
}

main()
  .catch((e) => {
    console.error('❌ 脚本执行失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export {};
