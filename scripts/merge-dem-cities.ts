#!/usr/bin/env ts-node

/**
 * 合并所有城市 DEM 表为一个统一表
 * 
 * 使用方法：
 *   npm run merge:dem:cities
 *   npm run merge:dem:cities -- --table geo_dem_cities_merged
 *   npm run merge:dem:cities -- --drop-existing
 * 
 * 功能：
 * 1. 查找所有 geo_dem_city_% 表
 * 2. 创建一个新的合并表
 * 3. 将所有城市表的数据合并到新表中
 * 4. 创建必要的索引和约束
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 合并所有城市 DEM 表
 */
async function mergeCityDEMTables(
  targetTable: string = 'geo_dem_cities_merged',
  dropExisting: boolean = false
): Promise<void> {
  console.log('\n🔄 开始合并城市 DEM 表\n');
  console.log(`📋 目标表: ${targetTable}\n`);

  try {
    // 1. 查找所有城市 DEM 表
    console.log('🔍 查找所有城市 DEM 表...');
    const cityTables = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'geo_dem_city_%'
        AND table_name != '${targetTable}'
      ORDER BY table_name;
    `) as Array<{ table_name: string }>;

    if (cityTables.length === 0) {
      console.log('⚠️  未找到任何城市 DEM 表\n');
      return;
    }

    console.log(`✅ 找到 ${cityTables.length} 个城市 DEM 表:\n`);
    cityTables.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table.table_name}`);
    });
    console.log('');

    // 2. 检查目标表是否存在
    const targetTableExists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '${targetTable}'
      );
    `) as Array<{ exists: boolean }>;

    if (targetTableExists[0]?.exists) {
      if (dropExisting) {
        console.log(`🗑️  删除现有表 ${targetTable}...`);
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${targetTable} CASCADE;`);
        console.log('✅ 表已删除\n');
      } else {
        console.log(`⚠️  表 ${targetTable} 已存在，跳过合并。使用 --drop-existing 重新合并。\n`);
        return;
      }
    }

    // 3. 获取第一个表的元数据作为模板
    console.log('📊 获取表结构信息...');
    const firstTable = cityTables[0].table_name;
    const tableInfo = await prisma.$queryRawUnsafe(`
      SELECT 
        column_name,
        data_type,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = '${firstTable}'
      ORDER BY ordinal_position;
    `) as Array<{ column_name: string; data_type: string; udt_name: string }>;

    console.log(`✅ 表结构: ${tableInfo.map(c => c.column_name).join(', ')}\n`);

    // 4. 创建合并表（使用第一个表的结构）
    console.log(`📝 创建合并表 ${targetTable}...`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE ${targetTable} AS 
      SELECT * FROM ${firstTable} LIMIT 0;
    `);
    console.log('✅ 合并表已创建\n');

    // 5. 合并所有城市表的数据
    console.log('🔄 开始合并数据...\n');
    let mergedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < cityTables.length; i++) {
      const tableName = cityTables[i].table_name;
      console.log(`[${i + 1}/${cityTables.length}] 📥 合并 ${tableName}...`);

      try {
        // 获取该表的记录数
        const countResult = await prisma.$queryRawUnsafe(`
          SELECT COUNT(*) as count FROM ${tableName};
        `) as Array<{ count: bigint }>;
        const count = Number(countResult[0]?.count || 0);

        if (count === 0) {
          console.log(`   ⏭️  表为空，跳过`);
          continue;
        }

        // 插入数据到合并表
        await prisma.$executeRawUnsafe(`
          INSERT INTO ${targetTable}
          SELECT * FROM ${tableName};
        `);

        mergedCount++;
        console.log(`   ✅ 已合并 ${count} 条记录`);
      } catch (error) {
        errorCount++;
        console.error(`   ❌ 合并失败:`, error instanceof Error ? error.message : error);
      }
    }

    console.log('\n');

    // 6. 创建索引和约束
    console.log('🔧 创建索引和约束...');
    // 检查是否有 rast 列
    const hasRastColumn = tableInfo.some(c => c.column_name === 'rast');
    const hasFilenameColumn = tableInfo.some(c => c.column_name === 'filename');
    
    try {
      // 创建 GIST 空间索引（如果表有 rast 列）
      if (hasRastColumn) {
        console.log('   📍 创建 GIST 空间索引...');
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS ${targetTable}_rast_gist_idx 
          ON ${targetTable} USING GIST (ST_ConvexHull(rast));
        `);
        console.log('   ✅ GIST 索引已创建');

        // 应用栅格约束（如果可能）
        try {
          console.log('   🔒 应用栅格约束...');
          await prisma.$executeRawUnsafe(`
            SELECT AddRasterConstraints('${targetTable}'::name, 'rast'::name);
          `);
          console.log('   ✅ 栅格约束已应用');
        } catch (error) {
          console.warn('   ⚠️  应用栅格约束失败（可能已存在）:', error instanceof Error ? error.message : error);
        }
      }

      // 如果有 filename 列，创建索引
      if (hasFilenameColumn) {
        console.log('   📄 创建 filename 索引...');
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS ${targetTable}_filename_idx 
          ON ${targetTable}(filename);
        `);
        console.log('   ✅ filename 索引已创建');
      }
    } catch (error) {
      console.warn('   ⚠️  创建索引时出错:', error instanceof Error ? error.message : error);
    }

    console.log('');

    // 7. 验证合并结果
    console.log('🔍 验证合并结果...');
    const finalCountResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM ${targetTable};
    `) as Array<{ count: bigint }>;
    const finalCount = Number(finalCountResult[0]?.count || 0);

    // 获取覆盖范围
    if (hasRastColumn) {
      try {
        const boundsResult = await prisma.$queryRawUnsafe(`
          SELECT 
            ST_YMin(ST_Envelope(ST_Union(rast))) as min_lat,
            ST_YMax(ST_Envelope(ST_Union(rast))) as max_lat,
            ST_XMin(ST_Envelope(ST_Union(rast))) as min_lng,
            ST_XMax(ST_Envelope(ST_Union(rast))) as max_lng
          FROM ${targetTable};
        `) as Array<{
          min_lat: number;
          max_lat: number;
          min_lng: number;
          max_lng: number;
        }>;

        if (boundsResult.length > 0 && boundsResult[0].min_lat) {
          const bounds = boundsResult[0];
          console.log(`✅ 合并完成！`);
          console.log(`   📊 总记录数: ${finalCount.toLocaleString()}`);
          console.log(`   📍 覆盖范围:`);
          console.log(`      纬度: ${bounds.min_lat.toFixed(4)}° ~ ${bounds.max_lat.toFixed(4)}°`);
          console.log(`      经度: ${bounds.min_lng.toFixed(4)}° ~ ${bounds.max_lng.toFixed(4)}°`);
        }
      } catch (error) {
        console.log(`✅ 合并完成！`);
        console.log(`   📊 总记录数: ${finalCount.toLocaleString()}`);
        console.warn(`   ⚠️  无法获取覆盖范围:`, error instanceof Error ? error.message : error);
      }
    } else {
      console.log(`✅ 合并完成！`);
      console.log(`   📊 总记录数: ${finalCount.toLocaleString()}`);
    }

    console.log('\n📊 合并统计:');
    console.log(`   ✅ 成功合并: ${mergedCount} 个表`);
    console.log(`   ❌ 失败: ${errorCount} 个表`);
    console.log(`   📝 总计: ${cityTables.length} 个表\n`);

    console.log('💡 提示:');
    console.log(`   - 合并表名: ${targetTable}`);
    console.log(`   - 查询示例: SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(116.4074, 39.9042), 4326))::INTEGER FROM ${targetTable} WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(116.4074, 39.9042), 4326)) LIMIT 1;`);
    console.log(`   - 注意: 合并后可以更新 DEMElevationService 直接查询合并表以提高性能\n`);

  } catch (error) {
    console.error('\n❌ 合并失败:', error instanceof Error ? error.message : error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let targetTable = 'geo_dem_cities_merged';
  let dropExisting = false;

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--table' && args[i + 1]) {
      targetTable = args[i + 1];
      i++;
    } else if (args[i] === '--drop-existing') {
      dropExisting = true;
    }
  }

  try {
    await mergeCityDEMTables(targetTable, dropExisting);
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

