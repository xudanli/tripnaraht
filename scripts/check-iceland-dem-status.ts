#!/usr/bin/env npx ts-node
/**
 * 检查冰岛 DEM 表和 DEMElevationService 状态
 *
 * 使用方式：
 *   npx ts-node scripts/check-iceland-dem-status.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('冰岛 DEM 状态检查');
  console.log('='.repeat(60));

  try {
    // 1. 检查 geo_dem_iceland_20m 表
    const icelandCount = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'geo_dem_iceland_20m'`,
    );
    const hasTable = Number(icelandCount[0]?.count || 0) > 0;

    if (!hasTable) {
      console.log('\n❌ 表 geo_dem_iceland_20m 不存在');
      console.log('   请运行: npx tsx scripts/import-iceland-dem-20m.ts');
      console.log('   前置: 需要 GeoTIFF 文件 docs/iceland/geography/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif');
    } else {
      const rows = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) as count FROM geo_dem_iceland_20m`,
      );
      const cnt = Number(rows[0]?.count || 0);
      console.log(`\n✅ 表 geo_dem_iceland_20m 存在，瓦片数: ${cnt}`);
    }

    // 2. 检查其他 DEM 表
    const otherTables = ['geo_dem_cities_merged', 'geo_dem_global', 'geo_dem_xizang'];
    for (const t of otherTables) {
      try {
        const r = await prisma.$queryRawUnsafe<[{ count: bigint }]>(`SELECT COUNT(*) as count FROM ${t}`);
        console.log(`   ${t}: ${Number(r[0]?.count || 0)} 条`);
      } catch {
        console.log(`   ${t}: 表不存在或无法查询`);
      }
    }

    // 3. 测试雷克雅未克坐标查询（若冰岛表存在）
    if (hasTable) {
      try {
        const result = await prisma.$queryRawUnsafe<Array<{ elevation: number | null }>>(
          `SELECT ST_Value(rast, ST_Transform(ST_SetSRID(ST_MakePoint(-21.9426, 64.1466), 4326), 5327))::INTEGER as elevation
           FROM geo_dem_iceland_20m
           WHERE ST_Intersects(rast, ST_Transform(ST_SetSRID(ST_MakePoint(-21.9426, 64.1466), 4326), 5327))
           LIMIT 1`,
        );
        const elev = result[0]?.elevation;
        if (elev != null) {
          console.log(`\n✅ 雷克雅未克 (64.15, -21.94) 海拔: ${Math.round(elev)}m`);
        } else {
          console.log('\n⚠️ 雷克雅未克坐标无海拔数据（可能为 NoData 或表为空）');
        }
      } catch (e: any) {
        console.log(`\n⚠️ 海拔查询失败: ${e?.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
  } catch (e: any) {
    console.error('检查失败:', e?.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
