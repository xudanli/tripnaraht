#!/usr/bin/env ts-node
/**
 * 测试尼泊尔 POI 查询功能
 * 
 * 验证地理查询、分类查询等功能
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 测试地理范围查询
 */
async function testGeographicQueries() {
  console.log('🗺️  测试地理范围查询...\n');

  // 1. 查询加德满都附近的茶屋（50km 范围内）
  const ktmLat = 27.700769;
  const ktmLng = 85.300140;
  const radiusMeters = 50000; // 50km

  const nearbyTeahouses = await prisma.$queryRaw<Array<{
    nameCN: string;
    nameEN: string | null;
    distance_m: number;
  }>>`
    SELECT 
      "nameCN",
      "nameEN",
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${ktmLng}, ${ktmLat}), 4326)::geography
      )) as distance_m
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_KTM'
      AND metadata->>'canonicalType' = 'TEAHOUSE_LODGE'
      AND ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(${ktmLng}, ${ktmLat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY distance_m
    LIMIT 10
  `;

  console.log(`📍 加德满都附近 50km 内的茶屋 (前10个):`);
  nearbyTeahouses.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.nameCN}${t.nameEN ? ` (${t.nameEN})` : ''} - ${(t.distance_m / 1000).toFixed(1)}km`);
  });
  console.log('');

  // 2. 查询 EBC 路线上的补给点（Lukla 到 Namche）
  const luklaLat = 27.6869;
  const luklaLng = 86.7298;
  const namcheLat = 27.80528;
  const namcheLng = 86.71058;

  const ebcSupplyPoints = await prisma.$queryRaw<Array<{
    nameCN: string;
    region: string;
    canonicalType: string | null;
    distance_to_lukla_km: number;
  }>>`
    SELECT 
      "nameCN",
      metadata->>'regionKey' as region,
      metadata->>'canonicalType' as "canonicalType",
      ROUND((ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${luklaLng}, ${luklaLat}), 4326)::geography
      ) / 1000.0)::numeric, 1)::float as distance_to_lukla_km
    FROM "Place"
    WHERE metadata->>'regionKey' IN ('NP_LUKLA', 'NP_NAMCHE')
      AND metadata->>'canonicalType' IN ('SUPPLY', 'SAFETY_MEDICAL', 'TEAHOUSE_LODGE')
    ORDER BY distance_to_lukla_km
    LIMIT 15
  `;

  console.log(`🏔️  EBC 路线上的补给点 (Lukla → Namche):`);
  ebcSupplyPoints.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.nameCN} (${p.region}) - ${p.canonicalType} - ${p.distance_to_lukla_km.toFixed(1)}km from Lukla`);
  });
  console.log('');
}

/**
 * 测试分类查询
 */
async function testCategoryQueries() {
  console.log('📂 测试分类查询...\n');

  // 1. 查询所有徒步相关的 POI
  const trekkingPois = await prisma.$queryRaw<Array<{
    count: bigint;
    canonicalType: string | null;
  }>>`
    SELECT 
      metadata->>'canonicalType' as "canonicalType",
      COUNT(*) as count
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
      AND metadata->>'canonicalType' IN ('TRAILHEAD', 'HUT', 'CAMPING', 'TEAHOUSE_LODGE')
    GROUP BY metadata->>'canonicalType'
    ORDER BY count DESC
  `;

  console.log(`🥾 徒步相关 POI:`);
  trekkingPois.forEach(p => {
    console.log(`  ${p.canonicalType}: ${p.count} 个`);
  });
  console.log('');

  // 2. 查询安全相关 POI 分布
  const safetyPois = await prisma.$queryRaw<Array<{
    region: string;
    count: bigint;
  }>>`
    SELECT 
      metadata->>'regionKey' as region,
      COUNT(*) as count
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
      AND metadata->>'canonicalType' = 'SAFETY_MEDICAL'
    GROUP BY metadata->>'regionKey'
    ORDER BY count DESC
  `;

  console.log(`🏥 安全/医疗 POI 分布:`);
  safetyPois.forEach(p => {
    console.log(`  ${p.region}: ${p.count} 个`);
  });
  console.log('');
}

/**
 * 测试数据质量
 */
async function testDataQuality() {
  console.log('✅ 测试数据质量...\n');

  // 1. 检查重复数据
  const duplicates = await prisma.$queryRaw<Array<{
    osmId: string;
    count: bigint;
  }>>`
    SELECT 
      metadata->>'osmId' as "osmId",
      COUNT(*) as count
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
    GROUP BY metadata->>'osmId'
    HAVING COUNT(*) > 1
    LIMIT 10
  `;

  if (duplicates.length === 0) {
    console.log('  ✅ 无重复 OSM ID');
  } else {
    console.log(`  ⚠️  发现 ${duplicates.length} 个重复的 OSM ID`);
    duplicates.forEach(d => {
      console.log(`    OSM ID ${d.osmId}: ${d.count} 条记录`);
    });
  }
  console.log('');

  // 2. 检查空名称
  const unnamed = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
      AND ("nameCN" IS NULL OR "nameCN" = '' OR "nameCN" = 'Unnamed place')
  `;

  console.log(`  ${unnamed[0].count > 0 ? '⚠️' : '✅'} 未命名 POI: ${unnamed[0].count} 个`);
  console.log('');

  // 3. 检查坐标有效性
  const invalidCoords = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
      AND (
        location IS NULL
        OR ST_X(location::geometry) < -180
        OR ST_X(location::geometry) > 180
        OR ST_Y(location::geometry) < -90
        OR ST_Y(location::geometry) > 90
      )
  `;

  console.log(`  ${invalidCoords[0].count > 0 ? '⚠️' : '✅'} 无效坐标: ${invalidCoords[0].count} 个`);
  console.log('');
}

/**
 * 测试实际使用场景
 */
async function testUseCases() {
  console.log('🎯 测试实际使用场景...\n');

  // 场景1: 查找 EBC 路线上的住宿点
  const ebcAccommodations = await prisma.$queryRaw<Array<{
    nameCN: string;
    region: string;
    canonicalType: string | null;
  }>>`
    SELECT 
      "nameCN",
      metadata->>'regionKey' as region,
      metadata->>'canonicalType' as "canonicalType"
    FROM "Place"
    WHERE metadata->>'regionKey' IN ('NP_LUKLA', 'NP_NAMCHE')
      AND metadata->>'canonicalType' IN ('TEAHOUSE_LODGE', 'HUT', 'CAMPING')
    ORDER BY metadata->>'regionKey', "nameCN"
    LIMIT 20
  `;

  console.log(`🏕️  场景1: EBC 路线上的住宿点:`);
  ebcAccommodations.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.nameCN} (${a.region}) - ${a.canonicalType}`);
  });
  console.log('');

  // 场景2: 查找博卡拉附近的观景点
  const pokharaViewpoints = await prisma.$queryRaw<Array<{
    nameCN: string;
    nameEN: string | null;
  }>>`
    SELECT 
      "nameCN",
      "nameEN"
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_PKR'
      AND metadata->>'canonicalType' = 'VIEWPOINT'
    ORDER BY "nameCN"
    LIMIT 15
  `;

  console.log(`🏔️  场景2: 博卡拉附近的观景点:`);
  pokharaViewpoints.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.nameCN}${v.nameEN ? ` (${v.nameEN})` : ''}`);
  });
  console.log('');

  // 场景3: 查找加德满都的交通枢纽
  const ktmTransit = await prisma.$queryRaw<Array<{
    nameCN: string;
    canonicalType: string | null;
  }>>`
    SELECT 
      "nameCN",
      metadata->>'canonicalType' as "canonicalType"
    FROM "Place"
    WHERE metadata->>'regionKey' = 'NP_KTM'
      AND metadata->>'canonicalType' IN ('AIRPORT', 'TRANSIT')
    ORDER BY metadata->>'canonicalType', "nameCN"
    LIMIT 10
  `;

  console.log(`✈️  场景3: 加德满都的交通枢纽:`);
  ktmTransit.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.nameCN} - ${t.canonicalType}`);
  });
  console.log('');
}

async function main() {
  try {
    await testGeographicQueries();
    await testCategoryQueries();
    await testDataQuality();
    await testUseCases();
    
    console.log('✅ 所有测试完成！');
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

