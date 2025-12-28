#!/usr/bin/env ts-node
/**
 * 检查 Place 表字段完整性
 * 检查 cityId、address、embedding 等字段的数据情况
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPlaceFields() {
  console.log('🔍 检查 Place 表字段完整性...\n');

  try {
    // 1. 总体统计
    const total = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place"
    `;
    console.log(`📊 总 POI 数量: ${total[0].count}\n`);

    // 2. 检查 cityId
    console.log('📍 cityId 字段统计:');
    const cityIdStats = await prisma.$queryRaw<Array<{
      has_cityId: boolean;
      count: bigint;
    }>>`
      SELECT 
        ("cityId" IS NOT NULL) as has_cityId,
        COUNT(*)::bigint as count
      FROM "Place"
      GROUP BY ("cityId" IS NOT NULL)
      ORDER BY has_cityId DESC
    `;

    cityIdStats.forEach(stat => {
      const percentage = (Number(stat.count) / Number(total[0].count) * 100).toFixed(1);
      console.log(`  ${stat.has_cityId ? '✅ 有 cityId' : '❌ 无 cityId'}: ${stat.count} 个 (${percentage}%)`);
    });

    // 检查有 cityId 的 POI 示例
    const withCityId = await prisma.$queryRaw<Array<{
      nameCN: string;
      cityId: number;
      cityName: string | null;
    }>>`
      SELECT 
        p."nameCN",
        p."cityId",
        c.name as "cityName"
      FROM "Place" p
      LEFT JOIN "City" c ON p."cityId" = c.id
      WHERE p."cityId" IS NOT NULL
      LIMIT 5
    `;

    if (withCityId.length > 0) {
      console.log('\n  有 cityId 的示例:');
      withCityId.forEach(p => {
        console.log(`    ${p.nameCN} → cityId: ${p.cityId} (${p.cityName || 'N/A'})`);
      });
    }

    // 3. 检查 address
    console.log('\n🏠 address 字段统计:');
    const addressStats = await prisma.$queryRaw<Array<{
      has_address: boolean;
      count: bigint;
    }>>`
      SELECT 
        CASE WHEN address IS NOT NULL AND address != '' THEN true ELSE false END as has_address,
        COUNT(*) as count
      FROM "Place"
      GROUP BY has_address
      ORDER BY has_address DESC
    `;

    addressStats.forEach(stat => {
      const percentage = (Number(stat.count) / Number(total[0].count) * 100).toFixed(1);
      console.log(`  ${stat.has_address ? '✅ 有 address' : '❌ 无 address'}: ${stat.count} 个 (${percentage}%)`);
    });

    // 检查有 address 的 POI 示例
    const withAddress = await prisma.$queryRaw<Array<{
      nameCN: string;
      address: string;
    }>>`
      SELECT 
        "nameCN",
        address
      FROM "Place"
      WHERE address IS NOT NULL AND address != ''
      LIMIT 5
    `;

    if (withAddress.length > 0) {
      console.log('\n  有 address 的示例:');
      withAddress.forEach(p => {
        console.log(`    ${p.nameCN}: ${p.address}`);
      });
    }

    // 4. 检查 embedding
    console.log('\n🔢 embedding 字段统计:');
    const embeddingStats = await prisma.$queryRaw<Array<{
      has_embedding: boolean;
      count: bigint;
    }>>`
      SELECT 
        CASE WHEN embedding IS NOT NULL THEN true ELSE false END as has_embedding,
        COUNT(*) as count
      FROM "Place"
      GROUP BY has_embedding
      ORDER BY has_embedding DESC
    `;

    embeddingStats.forEach(stat => {
      const percentage = (Number(stat.count) / Number(total[0].count) * 100).toFixed(1);
      console.log(`  ${stat.has_embedding ? '✅ 有 embedding' : '❌ 无 embedding'}: ${stat.count} 个 (${percentage}%)`);
    });

    // 5. 按数据来源分析字段完整性
    console.log('\n📊 按数据来源分析字段完整性:');
    const bySource = await prisma.$queryRaw<Array<{
      source: string;
      total: bigint;
      with_cityId: bigint;
      with_address: bigint;
      with_embedding: bigint;
    }>>`
      SELECT 
        CASE 
          WHEN metadata->>'regionKey' LIKE 'NP_%' THEN 'Nepal (Overpass)'
          WHEN metadata->>'externalSource' IS NOT NULL THEN metadata->>'externalSource'
          WHEN metadata->>'source' IS NOT NULL THEN metadata->>'source'
          ELSE 'Unknown'
        END as source,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE "cityId" IS NOT NULL) as with_cityId,
        COUNT(*) FILTER (WHERE address IS NOT NULL AND address != '') as with_address,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding
      FROM "Place"
      GROUP BY source
      ORDER BY total DESC
    `;

    bySource.forEach(s => {
      const cityIdPct = (Number(s.with_cityId) / Number(s.total) * 100).toFixed(1);
      const addressPct = (Number(s.with_address) / Number(s.total) * 100).toFixed(1);
      const embeddingPct = (Number(s.with_embedding) / Number(s.total) * 100).toFixed(1);
      
      console.log(`\n  ${s.source} (${s.total} 个):`);
      console.log(`    cityId: ${s.with_cityId} (${cityIdPct}%)`);
      console.log(`    address: ${s.with_address} (${addressPct}%)`);
      console.log(`    embedding: ${s.with_embedding} (${embeddingPct}%)`);
    });

    // 6. 检查尼泊尔 POI 的字段情况
    console.log('\n🇳🇵 尼泊尔 POI 字段完整性:');
    const nepalFields = await prisma.$queryRaw<Array<{
      total: bigint;
      with_cityId: bigint;
      with_address: bigint;
      with_embedding: bigint;
      with_location: bigint;
    }>>`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE "cityId" IS NOT NULL)::bigint as with_cityId,
        COUNT(*) FILTER (WHERE address IS NOT NULL AND address != '')::bigint as with_address,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL)::bigint as with_embedding,
        COUNT(*) FILTER (WHERE location IS NOT NULL)::bigint as with_location
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
    `;

    const n = nepalFields[0];
    console.log(`  总 POI: ${n.total}`);
    console.log(`  ✅ 有 location: ${n.with_location} (${(Number(n.with_location) / Number(n.total) * 100).toFixed(1)}%)`);
    console.log(`  ❌ 有 cityId: ${n.with_cityId} (${(Number(n.with_cityId) / Number(n.total) * 100).toFixed(1)}%)`);
    console.log(`  ❌ 有 address: ${n.with_address} (${(Number(n.with_address) / Number(n.total) * 100).toFixed(1)}%)`);
    console.log(`  ❌ 有 embedding: ${n.with_embedding} (${(Number(n.with_embedding) / Number(n.total) * 100).toFixed(1)}%)`);

    // 7. 检查是否有可用的地址信息在 metadata 中
    console.log('\n🔍 检查 metadata 中是否有地址信息:');
    const metadataAddress = await prisma.$queryRaw<Array<{
      count: bigint;
    }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE (
        metadata->'rawTags'->>'addr:full' IS NOT NULL
        OR metadata->'rawTags'->>'address' IS NOT NULL
        OR metadata->'rawTags'->>'addr:street' IS NOT NULL
      )
      AND (address IS NULL OR address = '')
    `;
    console.log(`  在 metadata.rawTags 中有地址但 address 字段为空: ${metadataAddress[0].count} 个`);

    // 8. 检查是否有可用的城市信息
    console.log('\n🔍 检查是否有可用的城市信息:');
    const cityInfo = await prisma.$queryRaw<Array<{
      has_city_in_metadata: bigint;
      has_city_in_name: bigint;
    }>>`
      SELECT 
        COUNT(*) FILTER (
          WHERE metadata->'rawTags'->>'addr:city' IS NOT NULL
          OR metadata->'rawTags'->>'city' IS NOT NULL
        ) as has_city_in_metadata,
        COUNT(*) FILTER (
          WHERE "nameCN" LIKE '%市%'
          OR "nameCN" LIKE '%城%'
          OR "nameEN" LIKE '%City%'
        ) as has_city_in_name
      FROM "Place"
      WHERE "cityId" IS NULL
    `;
    console.log(`  metadata 中有城市信息: ${cityInfo[0].has_city_in_metadata} 个`);
    console.log(`  名称中包含城市关键词: ${cityInfo[0].has_city_in_name} 个`);

    console.log('\n✅ 检查完成！\n');

  } catch (error: any) {
    console.error('❌ 检查失败:', error.message);
    throw error;
  }
}

checkPlaceFields()
  .catch((error) => {
    console.error('❌ 检查失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

