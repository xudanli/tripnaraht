#!/usr/bin/env ts-node
/**
 * 批量查询并导入冰岛 POI 的体力元数据脚本
 * 
 * 功能：
 * 1. 查询数据库中所有冰岛的 POI（通过 metadata->>'countryCode' = 'IS' 或 City.countryCode = 'IS'）
 * 2. 为每个 POI 生成或更新 physicalMetadata（使用 PhysicalMetadataGenerator）
 * 3. 批量更新数据库
 * 
 * 使用方法：
 *   ts-node scripts/batch-update-iceland-poi-physical-metadata.ts
 *   ts-node scripts/batch-update-iceland-poi-physical-metadata.ts --dry-run
 *   ts-node scripts/batch-update-iceland-poi-physical-metadata.ts --limit 100
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import { PhysicalMetadataGenerator } from '../src/places/utils/physical-metadata-generator.util';

const prisma = new PrismaClient();

interface UpdateStats {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  byCategory: Record<string, number>;
}

/**
 * 查询冰岛的所有 POI
 */
async function findIcelandPlaces(limit?: number): Promise<Array<{
  id: number;
  category: PlaceCategory;
  metadata: any;
  physicalMetadata: any;
  nameCN: string;
  nameEN: string | null;
}>> {
  const places = await prisma.place.findMany({
    where: {
      OR: [
        // 通过 metadata 中的 countryCode
        {
          metadata: {
            path: ['countryCode'],
            equals: 'IS',
          },
        },
        // 通过关联的 City
        {
          City: {
            countryCode: 'IS',
          },
        },
      ],
    },
    select: {
      id: true,
      category: true,
      metadata: true,
      physicalMetadata: true,
      nameCN: true,
      nameEN: true,
    },
    take: limit,
    orderBy: {
      id: 'asc',
    },
  });

  return places;
}

/**
 * 为单个 Place 生成或更新 physicalMetadata
 */
function generatePhysicalMetadata(
  place: {
    category: PlaceCategory;
    metadata: any;
    physicalMetadata: any;
  }
): any {
  const metadata = (place.metadata as any) || {};
  
  // 如果已经有 physicalMetadata 且包含关键字段，保留现有数据
  const existing = (place.physicalMetadata as any) || {};
  
  // 使用 PhysicalMetadataGenerator 生成新的 physicalMetadata
  const generated = PhysicalMetadataGenerator.generateByCategory(
    place.category,
    metadata
  );

  // 合并策略：保留现有的关键字段（如果存在），否则使用生成的
  const merged: any = {
    ...generated,
    // 如果现有数据有这些字段，保留它们
    ...(existing.base_fatigue_score !== undefined && { base_fatigue_score: existing.base_fatigue_score }),
    ...(existing.terrain_type !== undefined && { terrain_type: existing.terrain_type }),
    ...(existing.seated_ratio !== undefined && { seated_ratio: existing.seated_ratio }),
    ...(existing.intensity_factor !== undefined && { intensity_factor: existing.intensity_factor }),
    ...(existing.has_elevator !== undefined && { has_elevator: existing.has_elevator }),
    ...(existing.wheelchair_accessible !== undefined && { wheelchair_accessible: existing.wheelchair_accessible }),
    ...(existing.estimated_duration_min !== undefined && { estimated_duration_min: existing.estimated_duration_min }),
  };

  return merged;
}

/**
 * 批量更新 POI 的 physicalMetadata
 */
async function batchUpdatePhysicalMetadata(
  places: Array<{
    id: number;
    category: PlaceCategory;
    metadata: any;
    physicalMetadata: any;
    nameCN: string;
    nameEN: string | null;
  }>,
  dryRun: boolean = false
): Promise<UpdateStats> {
  const stats: UpdateStats = {
    total: places.length,
    updated: 0,
    skipped: 0,
    errors: 0,
    byCategory: {},
  };

  console.log(`\n📊 开始处理 ${places.length} 个冰岛 POI...\n`);

  // 分批处理（每批50个）
  const batchSize = 50;
  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(places.length / batchSize);

    console.log(`处理批次 ${batchNumber}/${totalBatches} (${batch.length} 个 POI)...`);

    for (const place of batch) {
      try {
        // 生成新的 physicalMetadata
        const newPhysicalMetadata = generatePhysicalMetadata(place);

        // 检查是否需要更新（比较关键字段）
        const existing = (place.physicalMetadata as any) || {};
        const needsUpdate = 
          !existing.base_fatigue_score ||
          !existing.terrain_type ||
          !existing.seated_ratio ||
          JSON.stringify(existing) !== JSON.stringify(newPhysicalMetadata);

        if (!needsUpdate && existing.base_fatigue_score) {
          stats.skipped++;
          continue;
        }

        if (!dryRun) {
          // 更新数据库
          await prisma.place.update({
            where: { id: place.id },
            data: {
              physicalMetadata: newPhysicalMetadata as any,
              updatedAt: new Date(),
            },
          });
        }

        stats.updated++;
        stats.byCategory[place.category] = (stats.byCategory[place.category] || 0) + 1;

        if ((stats.updated + stats.skipped) % 10 === 0) {
          process.stdout.write(`\r  已处理: ${stats.updated} 更新, ${stats.skipped} 跳过, ${stats.errors} 错误`);
        }
      } catch (error: any) {
        stats.errors++;
        console.error(`\n❌ 更新 POI ${place.id} (${place.nameCN}) 失败: ${error.message}`);
      }
    }
  }

  console.log('\n');
  return stats;
}

/**
 * 显示统计信息
 */
function displayStats(stats: UpdateStats, dryRun: boolean) {
  console.log('\n📊 处理结果统计:');
  console.log(`  - 总计: ${stats.total} 个 POI`);
  console.log(`  - ${dryRun ? '将更新' : '已更新'}: ${stats.updated} 个`);
  console.log(`  - 跳过: ${stats.skipped} 个（已有完整数据）`);
  console.log(`  - 错误: ${stats.errors} 个`);
  
  if (Object.keys(stats.byCategory).length > 0) {
    console.log('\n按类别统计:');
    for (const [category, count] of Object.entries(stats.byCategory)) {
      console.log(`  - ${category}: ${count} 个`);
    }
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
    console.log('🔍 查询冰岛 POI...');
    const places = await findIcelandPlaces(limit);
    
    if (places.length === 0) {
      console.log('❌ 未找到冰岛 POI');
      return;
    }

    console.log(`✅ 找到 ${places.length} 个冰岛 POI`);

    if (dryRun) {
      console.log('\n⚠️  干运行模式（不会实际更新数据库）');
    }

    // 批量更新
    const stats = await batchUpdatePhysicalMetadata(places, dryRun);

    // 显示统计
    displayStats(stats, dryRun);

    if (dryRun) {
      console.log('\n💡 提示: 使用不带 --dry-run 参数的命令来实际更新数据库');
    } else {
      console.log('\n✅ 批量更新完成！');
    }

  } catch (error: any) {
    console.error(`❌ 执行失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行脚本
if (require.main === module) {
  main();
}

