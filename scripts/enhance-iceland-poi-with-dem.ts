#!/usr/bin/env ts-node
/**
 * 使用DEM数据增强冰岛POI的体力元数据脚本
 * 
 * 功能：
 * 1. 查询冰岛的所有景点POI（ATTRACTION类别）
 * 2. 从DEM数据库查询每个POI的海拔
 * 3. 更新metadata.elevationMeters
 * 4. 重新生成physicalMetadata（会根据海拔调整intensity_factor）
 * 
 * 使用方法：
 *   ts-node scripts/enhance-iceland-poi-with-dem.ts
 *   ts-node scripts/enhance-iceland-poi-with-dem.ts --dry-run
 *   ts-node scripts/enhance-iceland-poi-with-dem.ts --limit 100
 */

import { PrismaClient, PlaceCategory, Prisma } from '@prisma/client';
import { PhysicalMetadataGenerator } from '../src/places/utils/physical-metadata-generator.util';
import { DEMElevationService } from '../src/trips/dem/services/dem-elevation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { HIGH_ELEVATION_THRESHOLD } from '../src/places/utils/physical-metadata-constants';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const demElevationService = new DEMElevationService(prismaService);

interface EnhancementStats {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  withElevation: number;
  highElevation: number; // 超过2000米的
}

/**
 * 查询冰岛的景点POI
 */
async function findIcelandAttractions(limit?: number): Promise<Array<{
  id: number;
  nameCN: string;
  nameEN: string | null;
  category: PlaceCategory;
  metadata: any;
  physicalMetadata: any;
  lat: number;
  lng: number;
}>> {
  const places = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    category: PlaceCategory;
    metadata: any;
    physicalMetadata: any;
    lat: number;
    lng: number;
  }>>`
    SELECT 
      id,
      "nameCN",
      "nameEN",
      category,
      metadata,
      "physicalMetadata",
      ST_Y(location::geometry) as lat,
      ST_X(location::geometry) as lng
    FROM "Place"
    WHERE 
      category = 'ATTRACTION'
      AND location IS NOT NULL
      AND (
        metadata->>'countryCode' = 'IS'
        OR EXISTS (
          SELECT 1 FROM "City" c
          WHERE c.id = "Place"."cityId"
          AND c."countryCode" = 'IS'
        )
      )
    ORDER BY id
    ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.sql``}
  `;

  return places;
}

/**
 * 从DEM数据查询海拔并更新POI
 */
async function enhancePoiWithDem(
  place: {
    id: number;
    nameCN: string;
    lat: number;
    lng: number;
    metadata: any;
    physicalMetadata: any;
    category: PlaceCategory;
  },
  dryRun: boolean = false
): Promise<{
  updated: boolean;
  elevation: number | null;
  wasHighElevation: boolean;
}> {
  try {
    // 1. 从DEM查询海拔
    const elevation = await demElevationService.getElevation(place.lat, place.lng, 'geo_dem_global');
    
    if (elevation === null) {
      return { updated: false, elevation: null, wasHighElevation: false };
    }

    // 2. 检查是否已有海拔数据且相同
    const existingElevation = (place.metadata as any)?.elevationMeters;
    if (existingElevation !== undefined && Math.abs(existingElevation - elevation) < 10) {
      // 海拔差异小于10米，认为相同，跳过
      return { updated: false, elevation, wasHighElevation: elevation > HIGH_ELEVATION_THRESHOLD };
    }

    // 3. 更新metadata
    const metadata = (place.metadata as any) || {};
    metadata.elevationMeters = elevation;

    // 4. 重新生成physicalMetadata（会根据海拔调整）
    const newPhysicalMetadata = PhysicalMetadataGenerator.generateByCategory(
      place.category,
      metadata
    );

    // 5. 检查是否需要更新（比较关键字段）
    const existing = (place.physicalMetadata as any) || {};
    const needsUpdate = 
      existing.elevationMeters !== elevation ||
      JSON.stringify(existing) !== JSON.stringify(newPhysicalMetadata);

    if (!needsUpdate && existing.elevationMeters === elevation) {
      return { updated: false, elevation, wasHighElevation: elevation > HIGH_ELEVATION_THRESHOLD };
    }

    if (!dryRun) {
      // 6. 更新数据库
      await prisma.place.update({
        where: { id: place.id },
        data: {
          metadata: metadata as any,
          physicalMetadata: newPhysicalMetadata as any,
          updatedAt: new Date(),
        },
      });
    }

    return {
      updated: true,
      elevation,
      wasHighElevation: elevation > HIGH_ELEVATION_THRESHOLD,
    };
  } catch (error: any) {
    throw new Error(`处理 POI ${place.id} (${place.nameCN}) 失败: ${error.message}`);
  }
}

/**
 * 批量增强POI
 */
async function batchEnhancePois(
  places: Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    category: PlaceCategory;
    metadata: any;
    physicalMetadata: any;
    lat: number;
    lng: number;
  }>,
  dryRun: boolean = false
): Promise<EnhancementStats> {
  const stats: EnhancementStats = {
    total: places.length,
    updated: 0,
    skipped: 0,
    errors: 0,
    withElevation: 0,
    highElevation: 0,
  };

  console.log(`\n📊 开始处理 ${places.length} 个冰岛景点POI...\n`);

  // 分批处理（每批50个）
  const batchSize = 50;
  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(places.length / batchSize);

    console.log(`处理批次 ${batchNumber}/${totalBatches} (${batch.length} 个 POI)...`);

    for (const place of batch) {
      try {
        const result = await enhancePoiWithDem(place, dryRun);

        if (result.elevation !== null) {
          stats.withElevation++;
          if (result.wasHighElevation) {
            stats.highElevation++;
          }
        }

        if (result.updated) {
          stats.updated++;
        } else {
          stats.skipped++;
        }

        if ((stats.updated + stats.skipped) % 10 === 0) {
          process.stdout.write(`\r  已处理: ${stats.updated} 更新, ${stats.skipped} 跳过, ${stats.errors} 错误`);
        }
      } catch (error: any) {
        stats.errors++;
        console.error(`\n❌ 处理 POI ${place.id} (${place.nameCN}) 失败: ${error.message}`);
      }
    }
  }

  console.log('\n');
  return stats;
}

/**
 * 显示统计信息
 */
function displayStats(stats: EnhancementStats, dryRun: boolean) {
  console.log('\n📊 处理结果统计:');
  console.log(`  - 总计: ${stats.total} 个景点POI`);
  console.log(`  - ${dryRun ? '将更新' : '已更新'}: ${stats.updated} 个`);
  console.log(`  - 跳过: ${stats.skipped} 个（已有海拔数据或无需更新）`);
  console.log(`  - 错误: ${stats.errors} 个`);
  console.log(`  - 成功获取海拔: ${stats.withElevation} 个`);
  console.log(`  - 高海拔（>${HIGH_ELEVATION_THRESHOLD}m）: ${stats.highElevation} 个`);
  
  if (stats.highElevation > 0) {
    console.log(`\n  ⚠️  注意：${stats.highElevation} 个POI位于高海拔地区，已自动增加强度因子`);
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

  try {
    console.log('🔍 查询冰岛景点POI...');
    const places = await findIcelandAttractions(limit);
    
    if (places.length === 0) {
      console.log('❌ 未找到冰岛景点POI');
      return;
    }

    console.log(`✅ 找到 ${places.length} 个冰岛景点POI`);

    if (dryRun) {
      console.log('\n⚠️  干运行模式（不会实际更新数据库）');
    }

    // 批量增强
    const stats = await batchEnhancePois(places, dryRun);

    // 显示统计
    displayStats(stats, dryRun);

    if (dryRun) {
      console.log('\n💡 提示: 使用不带 --dry-run 参数的命令来实际更新数据库');
    } else {
      console.log('\n✅ 批量增强完成！');
      console.log('\n📝 说明:');
      console.log('  - 已从DEM数据库查询每个POI的海拔');
      console.log('  - 已更新metadata.elevationMeters');
      console.log('  - 已重新生成physicalMetadata（高海拔POI的intensity_factor已增加）');
    }

  } catch (error: any) {
    console.error(`❌ 执行失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await prismaService.$disconnect();
  }
}

// 运行脚本
if (require.main === module) {
  main();
}

