#!/usr/bin/env ts-node
/**
 * 测试尼泊尔 POI 导入数据
 * 
 * 验证导入的数据质量和完整性
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Stats {
  total: number;
  byRegion: Record<string, number>;
  byProfile: Record<string, number>;
  byCanonicalType: Record<string, number>;
  byCategory: Record<string, number>;
}

async function testNepalPoi() {
  console.log('🇳🇵 开始测试尼泊尔 POI 数据...\n');

  try {
    // 1. 总体统计
    const total = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
    `;
    
    console.log(`📊 总体统计:`);
    console.log(`  总 POI 数量: ${total[0].count}\n`);

    // 2. 按 Region 统计
    const byRegion = await prisma.$queryRaw<Array<{ region: string; count: bigint }>>`
      SELECT 
        metadata->>'regionKey' as region,
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
      GROUP BY metadata->>'regionKey'
      ORDER BY count DESC
    `;
    
    console.log(`📍 按 Region 统计:`);
    byRegion.forEach(r => {
      console.log(`  ${r.region}: ${r.count} 个 POI`);
    });
    console.log('');

    // 3. 按 Profile 统计
    const byProfile = await prisma.$queryRaw<Array<{ profile: string; count: bigint }>>`
      SELECT 
        metadata->>'profile' as profile,
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
      GROUP BY metadata->>'profile'
      ORDER BY count DESC
    `;
    
    console.log(`📋 按 Profile 统计:`);
    byProfile.forEach(p => {
      console.log(`  ${p.profile}: ${p.count} 个 POI`);
    });
    console.log('');

    // 4. 按 Canonical Type 统计
    const byCanonicalType = await prisma.$queryRaw<Array<{ canonicalType: string; count: bigint }>>`
      SELECT 
        metadata->>'canonicalType' as "canonicalType",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
        AND metadata->>'canonicalType' IS NOT NULL
      GROUP BY metadata->>'canonicalType'
      ORDER BY count DESC
    `;
    
    console.log(`🏷️  按 Canonical Type 统计:`);
    byCanonicalType.forEach(ct => {
      console.log(`  ${ct.canonicalType || 'NULL'}: ${ct.count} 个 POI`);
    });
    console.log('');

    // 5. 按 Category 统计
    const byCategory = await prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
      SELECT 
        category::text as category,
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
      GROUP BY category
      ORDER BY count DESC
    `;
    
    console.log(`📂 按 Category 统计:`);
    byCategory.forEach(c => {
      console.log(`  ${c.category}: ${c.count} 个 POI`);
    });
    console.log('');

    // 6. 检查关键类型的数据
    console.log(`🔍 关键类型数据检查:`);
    
    const trailheads = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
        AND metadata->>'canonicalType' = 'TRAILHEAD'
    `;
    console.log(`  TRAILHEAD (徒步入口): ${trailheads[0].count} 个`);

    const teahouses = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
        AND metadata->>'canonicalType' = 'TEAHOUSE_LODGE'
    `;
    console.log(`  TEAHOUSE_LODGE (茶屋/客栈): ${teahouses[0].count} 个`);

    const huts = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
        AND metadata->>'canonicalType' = 'HUT'
    `;
    console.log(`  HUT (山屋/庇护所): ${huts[0].count} 个`);

    const camping = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
        AND metadata->>'canonicalType' = 'CAMPING'
    `;
    console.log(`  CAMPING (露营地): ${camping[0].count} 个`);

    const supply = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
        AND metadata->>'canonicalType' = 'SUPPLY'
    `;
    console.log(`  SUPPLY (补给点): ${supply[0].count} 个`);

    const safety = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
        AND metadata->>'canonicalType' = 'SAFETY_MEDICAL'
    `;
    console.log(`  SAFETY_MEDICAL (安全/医疗): ${safety[0].count} 个`);
    console.log('');

    // 7. 检查数据完整性
    console.log(`✅ 数据完整性检查:`);
    
    const withLocation = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
        AND location IS NOT NULL
    `;
    console.log(`  有坐标数据: ${withLocation[0].count} / ${total[0].count}`);

    const withName = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
        AND "nameCN" IS NOT NULL
        AND "nameCN" != ''
    `;
    console.log(`  有名称数据: ${withName[0].count} / ${total[0].count}`);

    const withOsmId = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
        AND metadata->>'osmId' IS NOT NULL
    `;
    console.log(`  有 OSM ID: ${withOsmId[0].count} / ${total[0].count}`);
    console.log('');

    // 8. 示例数据展示
    console.log(`📝 示例数据 (加德满都前5个):`);
    const samples = await prisma.$queryRaw<Array<{
      nameCN: string;
      nameEN: string | null;
      category: string;
      canonicalType: string | null;
      region: string;
    }>>`
      SELECT 
        "nameCN",
        "nameEN",
        category::text as category,
        metadata->>'canonicalType' as "canonicalType",
        metadata->>'regionKey' as region
      FROM "Place"
      WHERE metadata->>'regionKey' = 'NP_KTM'
      LIMIT 5
    `;
    
    samples.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.nameCN}${s.nameEN ? ` (${s.nameEN})` : ''}`);
      console.log(`     Category: ${s.category}, Canonical: ${s.canonicalType || 'N/A'}, Region: ${s.region}`);
    });
    console.log('');

    // 9. 检查特定 region 的数据分布
    console.log(`🗺️  区域数据分布示例 (NP_KTM):`);
    const ktmDistribution = await prisma.$queryRaw<Array<{
      profile: string;
      canonicalType: string | null;
      count: bigint;
    }>>`
      SELECT 
        metadata->>'profile' as profile,
        metadata->>'canonicalType' as "canonicalType",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' = 'NP_KTM'
      GROUP BY metadata->>'profile', metadata->>'canonicalType'
      ORDER BY metadata->>'profile', count DESC
      LIMIT 10
    `;
    
    ktmDistribution.forEach(d => {
      console.log(`  ${d.profile} - ${d.canonicalType || 'N/A'}: ${d.count} 个`);
    });
    console.log('');

    console.log('✅ 测试完成！');
    
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  }
}

// 运行测试
testNepalPoi()
  .catch((error) => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

