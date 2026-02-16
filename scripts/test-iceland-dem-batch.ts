#!/usr/bin/env tsx
/**
 * 直接测试冰岛 geo_dem_iceland_20m 批量查询
 * 验证 batchQueryFromTable 的坐标系转换是否正确
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ICELAND_POINTS = [
  { name: '雷克雅未克', lat: 64.1466, lng: -21.9426 },
  { name: 'Hólmavík', lat: 65.7078, lng: -21.6705 },
  { name: 'Ísafjörður', lat: 66.0752, lng: -23.1260 },
  { name: 'Dynjandi', lat: 65.7238, lng: -23.1940 },
  { name: 'Látrabjarg', lat: 65.5042, lng: -24.5296 },
];

async function checkTableExists(table: string): Promise<boolean> {
  const result: any = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = '${table}'
    ) as exists;
  `);
  return result?.[0]?.exists === true;
}

async function getTileCount(table: string): Promise<number> {
  const result: any = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as count FROM ${table}`
  );
  return result?.[0]?.count ?? 0;
}

async function batchQueryIceland20m(points: Array<{ lat: number; lng: number }>): Promise<Array<number | null>> {
  const lngs = points.map(p => p.lng);
  const lats = points.map(p => p.lat);
  const lngsArr = `ARRAY[${lngs.join(',')}]`;
  const latsArr = `ARRAY[${lats.join(',')}]`;
  const geomExpr = 'ST_Transform(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 5327)';

  const query = `
    WITH points AS (
      SELECT row_number() OVER () as idx, ${geomExpr} as geom
      FROM unnest(${lngsArr}::float[], ${latsArr}::float[]) AS t(lng, lat)
    )
    SELECT p.idx, ST_Value(r.rast, p.geom)::INTEGER as elevation
    FROM points p
    CROSS JOIN LATERAL (
      SELECT rast FROM geo_dem_iceland_20m
      WHERE ST_Intersects(rast, p.geom)
      LIMIT 1
    ) r
    ORDER BY p.idx;
  `;

  const result: any = await prisma.$queryRawUnsafe(query);
  const elevationMap = new Map<number, number | null>();
  for (const row of result) {
    const k = typeof row.idx === 'bigint' ? Number(row.idx) : row.idx;
    elevationMap.set(k, row.elevation !== null ? Math.round(Number(row.elevation)) : null);
  }
  return points.map((_, idx) => elevationMap.get(idx + 1) ?? null);
}

async function main() {
  console.log('=== 冰岛 geo_dem_iceland_20m 批量查询测试 ===\n');

  const exists = await checkTableExists('geo_dem_iceland_20m');
  console.log(`1. 表存在: ${exists ? '✅ 是' : '❌ 否'}`);

  if (!exists) {
    console.log('\n表不存在，请按 scripts/ICELAND_DEM_IMPORT_README.md 导入。');
    return;
  }

  const tileCount = await getTileCount('geo_dem_iceland_20m');
  console.log(`2. 瓦片数: ${tileCount}`);

  console.log('\n3. 批量查询（使用正确的 ST_Transform 4326→5327）:');
  try {
    const elevations = await batchQueryIceland20m(ICELAND_POINTS.map(p => ({ lat: p.lat, lng: p.lng })));
    ICELAND_POINTS.forEach((p, i) => {
      const e = elevations[i];
      const ok = e !== null && e > 0;
      console.log(`   ${ok ? '✅' : '❌'} ${p.name}: ${e ?? 'null'} m`);
    });
    const allOk = elevations.every(e => e !== null && e > 0);
    console.log(allOk ? '\n✅ 批量查询成功' : '\n⚠️ 部分点无海拔（表内无覆盖或坐标有误）');
  } catch (err: any) {
    console.error('❌ 查询失败:', err.message);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
