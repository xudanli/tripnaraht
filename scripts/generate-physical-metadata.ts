/**
 * 批量生成 Place 表的 physicalMetadata
 * 
 * 用途：为现有地点自动生成体力消耗元数据
 * 
 * 运行方式：
 * npm run generate:physical-metadata
 * 
 * 或者指定参数：
 * npm run generate:physical-metadata -- --dry-run  # 仅预览，不实际更新
 * npm run generate:physical-metadata -- --category ATTRACTION  # 仅处理景点
 */

import { PrismaClient, PlaceCategory, Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';
import { PhysicalMetadataGenerator } from '../src/places/utils/physical-metadata-generator.util';

dotenv.config();

const prisma = new PrismaClient();

interface ScriptOptions {
  dryRun?: boolean;
  category?: PlaceCategory;
  limit?: number;
}

async function main() {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    dryRun: args.includes('--dry-run'),
    limit: undefined,
  };

  // 解析 --category 参数
  const categoryIndex = args.indexOf('--category');
  if (categoryIndex !== -1 && args[categoryIndex + 1]) {
    options.category = args[categoryIndex + 1] as PlaceCategory;
  }

  // 解析 --limit 参数
  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    options.limit = parseInt(args[limitIndex + 1], 10);
  }

  console.log('🚀 开始生成 physicalMetadata...\n');
  console.log('选项:', {
    dryRun: options.dryRun,
    category: options.category || '全部',
    limit: options.limit || '无限制',
  });
  console.log('━'.repeat(60));

  // 查询需要更新的地点
  // 使用 raw SQL 查询，因为 Prisma 对 JSONB null 查询支持有限
  const categoryFilter = options.category
    ? Prisma.sql`AND category = ${options.category}::"PlaceCategory"`
    : Prisma.sql``;
  
  const limitClause = options.limit
    ? Prisma.sql`LIMIT ${options.limit}`
    : Prisma.sql``;

  const places = await prisma.$queryRaw<Array<{
    id: number;
    uuid: string;
    nameCN: string;
    nameEN: string | null;
    category: PlaceCategory;
    metadata: any;
    physicalMetadata: any;
  }>>`
    SELECT 
      id,
      uuid,
      "nameCN",
      "nameEN",
      category,
      metadata,
      "physicalMetadata"
    FROM "Place"
    WHERE "physicalMetadata" IS NULL
      ${categoryFilter}
    ORDER BY id ASC
    ${limitClause}
  `;

  console.log(`📊 找到 ${places.length} 个需要生成 physicalMetadata 的地点\n`);

  if (places.length === 0) {
    console.log('✅ 所有地点都已包含 physicalMetadata');
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  const stats: Record<PlaceCategory, number> = {
    ATTRACTION: 0,
    RESTAURANT: 0,
    SHOPPING: 0,
    HOTEL: 0,
    TRANSIT_HUB: 0,
  };

  for (const place of places) {
    try {
      // 生成 physicalMetadata
      const physicalMetadata = PhysicalMetadataGenerator.generateByCategory(
        place.category,
        place.metadata as any
      );

      if (options.dryRun) {
        console.log(`[预览] ${place.nameCN} (${place.category})`);
        console.log(`  physicalMetadata:`, JSON.stringify(physicalMetadata, null, 2));
      } else {
        // 更新数据库
        await prisma.place.update({
          where: { id: place.id },
          data: {
            physicalMetadata: physicalMetadata as any,
            updatedAt: new Date(),
          },
        });

        console.log(`✅ [${place.category}] ${place.nameCN}`);
        successCount++;
        stats[place.category]++;
      }
    } catch (error: any) {
      console.error(`❌ 处理失败 "${place.nameCN}": ${error.message}`);
      errorCount++;
    }
  }

  console.log('\n' + '━'.repeat(60));
  console.log('📊 统计结果:');
  console.log(`   总处理数: ${places.length}`);
  if (!options.dryRun) {
    console.log(`   成功: ${successCount}`);
    console.log(`   失败: ${errorCount}`);
    console.log('\n按类别统计:');
    Object.entries(stats).forEach(([category, count]) => {
      if (count > 0) {
        console.log(`   ${category}: ${count}`);
      }
    });
  } else {
    console.log('   [预览模式] 未实际更新数据库');
  }
}

main()
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
