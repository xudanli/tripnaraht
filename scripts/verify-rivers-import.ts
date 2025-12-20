#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  console.log('📊 验证河网数据导入...\n');
  
  // 检查记录数
  const rivers = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM geo_rivers_line
  `;
  const water = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM geo_water_poly
  `;
  const country = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM geo_country
  `;
  
  console.log('✅ 数据统计:');
  console.log(`  线状水系 (geo_rivers_line): ${Number(rivers[0]?.count || 0)} 条`);
  console.log(`  面状水系 (geo_water_poly): ${Number(water[0]?.count || 0)} 条`);
  console.log(`  国家边界 (geo_country): ${Number(country[0]?.count || 0)} 条\n`);
  
  // 检查空间索引
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes 
    WHERE tablename IN ('geo_rivers_line', 'geo_water_poly', 'geo_country')
    AND indexname LIKE '%_geom_idx'
  `;
  console.log(`✅ 空间索引: ${indexes.length} 个`);
  indexes.forEach(idx => console.log(`  - ${idx.indexname}`));
  
  // 测试查询（冰岛雷克雅未克附近）
  console.log('\n🧪 测试查询 (冰岛雷克雅未克 64.1283, -21.8278):');
  const test = await prisma.$queryRaw<Array<{ distance_m: number }>>`
    SELECT 
      ST_Distance(
        geom::geography,
        ST_SetSRID(ST_MakePoint(-21.8278, 64.1283), 4326)::geography
      ) as distance_m
    FROM geo_rivers_line
    WHERE geom IS NOT NULL
    ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(-21.8278, 64.1283), 4326)::geography
    LIMIT 1
  `;
  if (test[0]?.distance_m) {
    console.log(`  最近河线距离: ${Math.round(test[0].distance_m)}m`);
  } else {
    console.log('  未找到附近河线');
  }
  
  // 测试面状水域
  const testWater = await prisma.$queryRaw<Array<{ distance_m: number }>>`
    SELECT 
      ST_Distance(
        geom::geography,
        ST_SetSRID(ST_MakePoint(-21.8278, 64.1283), 4326)::geography
      ) as distance_m
    FROM geo_water_poly
    WHERE geom IS NOT NULL
    ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(-21.8278, 64.1283), 4326)::geography
    LIMIT 1
  `;
  if (testWater[0]?.distance_m) {
    console.log(`  最近水域距离: ${Math.round(testWater[0].distance_m)}m`);
  } else {
    console.log('  未找到附近水域');
  }
  
  console.log('\n✅ 验证完成！');
}

verify()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

