#!/usr/bin/env ts-node

/**
 * 验证 DEM 表状态
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  try {
    // 检查单独的城市表
    const cityTables = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'geo_dem_city_%'
        AND table_name != 'geo_dem_cities_merged';
    `) as Array<{ count: bigint }>;
    
    const cityCount = Number(cityTables[0]?.count || 0);
    console.log(`\n📊 单独的城市 DEM 表数量: ${cityCount}\n`);

    // 检查合并表
    const mergedExists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'geo_dem_cities_merged'
      );
    `) as Array<{ exists: boolean }>;

    if (mergedExists[0]?.exists) {
      const mergedCount = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM geo_dem_cities_merged;
      `) as Array<{ count: bigint }>;
      console.log(`✅ 合并表 geo_dem_cities_merged 存在`);
      console.log(`   📊 记录数: ${Number(mergedCount[0]?.count || 0).toLocaleString()}\n`);
    } else {
      console.log(`❌ 合并表不存在\n`);
    }

    // 列出所有 DEM 相关表
    const allDemTables = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'geo_dem%'
      ORDER BY table_name;
    `) as Array<{ table_name: string }>;

    console.log(`📋 所有 DEM 相关表 (${allDemTables.length} 个):\n`);
    allDemTables.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table.table_name}`);
    });
    console.log('');

    if (cityCount === 0) {
      console.log('✅ 验证通过：所有单独的城市 DEM 表已成功删除！\n');
    } else {
      console.log(`⚠️  仍有 ${cityCount} 个单独的城市 DEM 表未删除\n`);
    }

  } catch (error) {
    console.error('❌ 验证失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verify();

