#!/usr/bin/env ts-node
/**
 * 为 POI 数据添加 OSM opening_hours（快招1）
 * 
 * 功能：
 * 1. 查找 metadata.rawTags 或 metadata 中包含 opening_hours 的 POI
 * 2. 使用 OsmOpeningHoursParser 解析 OSM 格式的 opening_hours
 * 3. 更新 metadata.openingHours 字段
 * 
 * 使用方法:
 *   npm run enrich:osm-opening-hours
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { OsmOpeningHoursParser } from '../src/common/utils/osm-opening-hours-parser.util';

const prisma = new PrismaClient();

/**
 * 从 rawTags 或 metadata 中提取 opening_hours
 */
function extractOpeningHours(metadata: any): string | null {
  if (!metadata) return null;

  // 优先从 rawTags.opening_hours 获取（OSM 标准字段）
  if (metadata.rawTags?.opening_hours) {
    return metadata.rawTags.opening_hours;
  }

  // 从 metadata.opening_hours 获取
  if (metadata.opening_hours) {
    return metadata.opening_hours;
  }

  // 从 metadata.openingHours.osmFormat 获取（如果已经存在）
  if (metadata.openingHours?.osmFormat) {
    return metadata.openingHours.osmFormat;
  }

  return null;
}

/**
 * 批量处理 POI，解析并更新 openingHours
 */
async function enrichOsmOpeningHours() {
  console.log('📊 开始为 POI 添加 OSM opening_hours...\n');

  try {
    // 1. 查询所有可能有 opening_hours 的 POI
    const pois = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      metadata: any;
    }>>`
      SELECT 
        id,
        "nameCN",
        metadata
      FROM "Place"
      WHERE metadata IS NOT NULL
        AND (
          metadata->'rawTags'->>'opening_hours' IS NOT NULL
          OR metadata->>'opening_hours' IS NOT NULL
          OR metadata->'openingHours'->>'osmFormat' IS NOT NULL
        )
      ORDER BY id
    `;

    console.log(`找到 ${pois.length} 个可能有 opening_hours 的 POI\n`);

    if (pois.length === 0) {
      console.log('❌ 没有找到包含 opening_hours 的 POI');
      return;
    }

    // 2. 统计需要更新的数据
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 3. 批量处理（每批 100 个）
    const batchSize = 100;
    for (let i = 0; i < pois.length; i += batchSize) {
      const batch = pois.slice(i, i + batchSize);
      console.log(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(pois.length / batchSize)} (${batch.length} 个 POI)...`);

      for (const poi of batch) {
        try {
          const metadata = poi.metadata || {};
          const osmHours = extractOpeningHours(metadata);

          if (!osmHours) {
            skippedCount++;
            continue;
          }

          // 解析 OSM opening_hours
          const parsed = OsmOpeningHoursParser.parse(osmHours);

          if (!parsed) {
            // 无法解析，跳过
            skippedCount++;
            continue;
          }

          // 检查是否需要更新（避免不必要的更新）
          const currentOpeningHours = metadata.openingHours || {};
          const needsUpdate = JSON.stringify(parsed) !== JSON.stringify(currentOpeningHours);

          if (needsUpdate) {
            // 合并到现有的 openingHours（保留其他字段）
            const updatedOpeningHours = {
              ...currentOpeningHours,
              ...parsed,
            };

            // 更新数据库
            const updatedMetadata = {
              ...metadata,
              openingHours: updatedOpeningHours,
            };

            await prisma.place.update({
              where: { id: poi.id },
              data: {
                metadata: updatedMetadata as Prisma.InputJsonValue,
                updatedAt: new Date(),
              },
            });
            updatedCount++;
          } else {
            skippedCount++;
          }
        } catch (error: any) {
          console.error(`❌ 更新 POI ${poi.id} (${poi.nameCN}) 失败:`, error.message);
          errorCount++;
        }
      }

      // 显示进度
      if ((i + batchSize) % 500 === 0 || i + batchSize >= pois.length) {
        console.log(`  进度: ${Math.min(i + batchSize, pois.length)}/${pois.length}`);
        console.log(`  已更新: ${updatedCount}, 跳过: ${skippedCount}, 错误: ${errorCount}\n`);
      }
    }

    // 4. 显示统计结果
    console.log('='.repeat(60));
    console.log('✅ 处理完成！\n');
    console.log('📊 统计结果:');
    console.log(`  总 POI 数: ${pois.length}`);
    console.log(`  已更新: ${updatedCount}`);
    console.log(`  跳过（无需更新或无法解析）: ${skippedCount}`);
    console.log(`  错误: ${errorCount}`);
    console.log('='.repeat(60));

    // 5. 验证更新结果
    console.log('\n🔍 验证更新结果...');
    const sampleUpdated = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      hasOpeningHours: boolean;
      osmFormat: string | null;
    }>>`
      SELECT 
        id,
        "nameCN",
        (metadata->'openingHours' IS NOT NULL) as "hasOpeningHours",
        metadata->'openingHours'->>'osmFormat' as "osmFormat"
      FROM "Place"
      WHERE metadata->'openingHours' IS NOT NULL
      LIMIT 10
    `;

    console.log('\n样本数据验证:');
    sampleUpdated.forEach(poi => {
      console.log(`  ${poi.nameCN}:`);
      console.log(`    OpeningHours: ${poi.hasOpeningHours ? '✅' : '❌'}`);
      console.log(`    OSM Format: ${poi.osmFormat || 'N/A'}`);
    });

  } catch (error: any) {
    console.error('❌ 处理失败:', error);
    throw error;
  }
}

// 运行脚本
enrichOsmOpeningHours()
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

