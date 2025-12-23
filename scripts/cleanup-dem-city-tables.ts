#!/usr/bin/env ts-node

/**
 * 清理单独的城市 DEM 表
 * 
 * 在合并所有城市 DEM 表到 geo_dem_cities_merged 后，删除原来的单独表以节省空间
 * 
 * 使用方法：
 *   npm run cleanup:dem:cities
 *   npm run cleanup:dem:cities -- --dry-run  # 仅预览，不实际删除
 *   npm run cleanup:dem:cities -- --keep-merged  # 确保不删除合并表（默认已启用）
 * 
 * 功能：
 * 1. 查找所有 geo_dem_city_% 表（排除合并表）
 * 2. 显示将要删除的表列表
 * 3. 删除这些表（如果不在 dry-run 模式）
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 清理单独的城市 DEM 表
 */
async function cleanupCityDEMTables(
  dryRun: boolean = false,
  keepMerged: boolean = true
): Promise<void> {
  console.log('\n🧹 开始清理城市 DEM 表\n');
  
  if (dryRun) {
    console.log('🔍 预览模式（不会实际删除表）\n');
  }

  try {
    // 1. 查找所有城市 DEM 表（排除合并表）
    const cityTables = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'geo_dem_city_%'
        ${keepMerged ? "AND table_name != 'geo_dem_cities_merged'" : ''}
      ORDER BY table_name;
    `) as Array<{ table_name: string }>;

    if (cityTables.length === 0) {
      console.log('✅ 没有找到需要清理的城市 DEM 表\n');
      return;
    }

    console.log(`📋 找到 ${cityTables.length} 个城市 DEM 表:\n`);
    
    // 显示前 20 个表作为示例
    const displayCount = Math.min(20, cityTables.length);
    for (let i = 0; i < displayCount; i++) {
      console.log(`   ${i + 1}. ${cityTables[i].table_name}`);
    }
    if (cityTables.length > displayCount) {
      console.log(`   ... 还有 ${cityTables.length - displayCount} 个表`);
    }
    console.log('');

    // 2. 检查合并表是否存在
    if (keepMerged) {
      const mergedTableExists = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'geo_dem_cities_merged'
        );
      `) as Array<{ exists: boolean }>;

      if (!mergedTableExists[0]?.exists) {
        console.log('⚠️  警告: 合并表 geo_dem_cities_merged 不存在！');
        console.log('   建议先运行合并脚本: npm run merge:dem:cities\n');
        
        if (!dryRun) {
          console.log('❌ 为安全起见，取消删除操作\n');
          return;
        }
      } else {
        // 获取合并表的记录数
        const mergedCountResult = await prisma.$queryRawUnsafe(`
          SELECT COUNT(*) as count FROM geo_dem_cities_merged;
        `) as Array<{ count: bigint }>;
        const mergedCount = Number(mergedCountResult[0]?.count || 0);
        console.log(`✅ 合并表 geo_dem_cities_merged 存在，包含 ${mergedCount.toLocaleString()} 条记录\n`);
      }
    }

    // 3. 计算总记录数（用于验证）
    let totalRecords = 0;
    console.log('📊 统计各表的记录数...\n');
    for (let i = 0; i < Math.min(10, cityTables.length); i++) {
      try {
        const countResult = await prisma.$queryRawUnsafe(`
          SELECT COUNT(*) as count FROM ${cityTables[i].table_name};
        `) as Array<{ count: bigint }>;
        const count = Number(countResult[0]?.count || 0);
        totalRecords += count;
      } catch (error) {
        // 忽略错误
      }
    }
    console.log(`   （前 10 个表共 ${totalRecords.toLocaleString()} 条记录）\n`);

    // 4. 确认删除
    if (dryRun) {
      console.log('🔍 预览模式：以下表将被删除（但不会实际执行）:\n');
      cityTables.forEach((table, index) => {
        console.log(`   ${index + 1}. ${table.table_name}`);
      });
      console.log(`\n✅ 预览完成：共 ${cityTables.length} 个表将被删除\n`);
      return;
    }

    // 5. 执行删除
    console.log('🗑️  开始删除表...\n');
    let deletedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < cityTables.length; i++) {
      const tableName = cityTables[i].table_name;
      const progress = `[${i + 1}/${cityTables.length}]`;
      
      try {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
        deletedCount++;
        if ((i + 1) % 50 === 0 || i === cityTables.length - 1) {
          console.log(`${progress} ✅ 已删除 ${tableName}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`${progress} ❌ 删除 ${tableName} 失败:`, error instanceof Error ? error.message : error);
      }
    }

    console.log('\n');
    console.log('📊 清理统计:');
    console.log(`   ✅ 成功删除: ${deletedCount} 个表`);
    console.log(`   ❌ 失败: ${errorCount} 个表`);
    console.log(`   📝 总计: ${cityTables.length} 个表\n`);

    if (deletedCount > 0) {
      console.log('✅ 清理完成！\n');
      console.log('💡 提示:');
      console.log('   - 所有城市 DEM 数据已合并到 geo_dem_cities_merged 表');
      console.log('   - DEMElevationService 已更新为使用合并表');
      console.log('   - 可以节省数据库存储空间\n');
    }

  } catch (error) {
    console.error('\n❌ 清理失败:', error instanceof Error ? error.message : error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let keepMerged = true;

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--no-keep-merged') {
      keepMerged = false;
    }
  }

  try {
    await cleanupCityDEMTables(dryRun, keepMerged);
  } catch (error) {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

