#!/usr/bin/env ts-node
/**
 * 检查 POI 数据中的国家分布
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 国家代码到名称的映射
const countryNames: Record<string, string> = {
  'NP': '尼泊尔 (Nepal)',
  'IS': '冰岛 (Iceland)',
  'CN': '中国 (China)',
  'US': '美国 (United States)',
  'JP': '日本 (Japan)',
  'KR': '韩国 (South Korea)',
  'TH': '泰国 (Thailand)',
  'IN': '印度 (India)',
  'GB': '英国 (United Kingdom)',
  'FR': '法国 (France)',
  'DE': '德国 (Germany)',
  'IT': '意大利 (Italy)',
  'ES': '西班牙 (Spain)',
  'AU': '澳大利亚 (Australia)',
  'NZ': '新西兰 (New Zealand)',
  'NO': '挪威 (Norway)',
};

async function checkPoiCountries() {
  console.log('🌍 检查 POI 数据中的国家分布...\n');

  try {
    // 1. 通过 metadata 中的 countryCode 或 regionKey 推断国家
    console.log('📊 方法1: 通过 metadata 分析\n');

    // 查找所有有 regionKey 的 POI（尼泊尔）
    const nepalPois = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'regionKey' LIKE 'NP_%'
    `;
    console.log(`  🇳🇵 尼泊尔 (NP): ${nepalPois[0].count} 个 POI`);

    // 查找所有有 countryCode 的 POI
    const withCountryCode = await prisma.$queryRaw<Array<{
      countryCode: string;
      count: bigint;
    }>>`
      SELECT 
        metadata->>'countryCode' as "countryCode",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'countryCode' IS NOT NULL
        AND metadata->>'countryCode' != ''
      GROUP BY metadata->>'countryCode'
      ORDER BY count DESC
    `;

    if (withCountryCode.length > 0) {
      console.log('\n  通过 countryCode 字段:');
      withCountryCode.forEach(cc => {
        const name = countryNames[cc.countryCode] || cc.countryCode;
        console.log(`  ${name}: ${cc.count} 个 POI`);
      });
    }

    // 2. 通过 City 关联推断国家
    console.log('\n📊 方法2: 通过 City 关联分析\n');
    const byCityCountry = await prisma.$queryRaw<Array<{
      countryCode: string;
      count: bigint;
    }>>`
      SELECT 
        c."countryCode",
        COUNT(p.id) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" IS NOT NULL
      GROUP BY c."countryCode"
      ORDER BY count DESC
    `;

    if (byCityCountry.length > 0) {
      console.log('  通过 City 关联:');
      byCityCountry.forEach(cc => {
        const name = countryNames[cc.countryCode] || cc.countryCode;
        console.log(`  ${name}: ${cc.count} 个 POI`);
      });
    }

    // 3. 通过 metadata 中的其他字段推断
    console.log('\n📊 方法3: 通过其他 metadata 字段分析\n');
    
    // 查找有 ISO3166-1 标签的 POI
    const withIsoCode = await prisma.$queryRaw<Array<{
      isoCode: string;
      count: bigint;
    }>>`
      SELECT 
        metadata->'rawTags'->>'ISO3166-1' as "isoCode",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->'rawTags'->>'ISO3166-1' IS NOT NULL
      GROUP BY metadata->'rawTags'->>'ISO3166-1'
      ORDER BY count DESC
      LIMIT 10
    `;

    if (withIsoCode.length > 0) {
      console.log('  通过 ISO3166-1 标签:');
      withIsoCode.forEach(iso => {
        const name = countryNames[iso.isoCode] || iso.isoCode;
        console.log(`  ${name}: ${iso.count} 个 POI`);
      });
    }

    // 3.1 通过 metadata 中的 externalSource 查找（nature-poi 数据）
    const byExternalSource = await prisma.$queryRaw<Array<{
      source: string;
      countryCode: string | null;
      count: bigint;
    }>>`
      SELECT 
        metadata->>'externalSource' as source,
        metadata->>'countryCode' as "countryCode",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'externalSource' IS NOT NULL
      GROUP BY metadata->>'externalSource', metadata->>'countryCode'
      ORDER BY count DESC
    `;

    if (byExternalSource.length > 0) {
      console.log('\n  通过 externalSource:');
      byExternalSource.forEach(s => {
        const country = s.countryCode ? ` (${countryNames[s.countryCode] || s.countryCode})` : '';
        console.log(`  ${s.source}${country}: ${s.count} 个 POI`);
      });
    }

    // 3.2 查找所有包含 iceland 或 norway 关键词的数据
    console.log('\n  查找包含 iceland/norway 关键词:');
    const icelandKeywords = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE (
        metadata->>'externalSource' LIKE '%iceland%'
        OR metadata->>'externalSource' LIKE '%Iceland%'
        OR "nameEN" ILIKE '%iceland%'
        OR "nameCN" LIKE '%冰岛%'
        OR metadata::text ILIKE '%iceland%'
      )
    `;
    console.log(`    包含 iceland 关键词: ${icelandKeywords[0].count} 个 POI`);

    const norwayKeywords = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE (
        metadata->>'externalSource' LIKE '%norway%'
        OR metadata->>'externalSource' LIKE '%Norway%'
        OR "nameEN" ILIKE '%norway%'
        OR "nameCN" LIKE '%挪威%'
        OR metadata::text ILIKE '%norway%'
      )
    `;
    console.log(`    包含 norway 关键词: ${norwayKeywords[0].count} 个 POI`);

    // 3.2 通过坐标范围推断（冰岛和挪威的大致坐标范围）
    console.log('\n  通过坐标范围推断:');
    
    // 冰岛大致范围：63-67°N, 13-25°W
    const icelandByCoords = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE location IS NOT NULL
        AND ST_Y(location::geometry) BETWEEN 63 AND 67
        AND ST_X(location::geometry) BETWEEN -25 AND -13
        AND (metadata->>'regionKey' IS NULL OR metadata->>'regionKey' NOT LIKE 'NP_%')
        AND (metadata->>'countryCode' IS NULL OR metadata->>'countryCode' != 'CN')
    `;
    console.log(`    冰岛坐标范围 (63-67°N, 13-25°W): ${icelandByCoords[0].count} 个 POI`);

    // 挪威大致范围：58-71°N, 4-31°E
    const norwayByCoords = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE location IS NOT NULL
        AND ST_Y(location::geometry) BETWEEN 58 AND 71
        AND ST_X(location::geometry) BETWEEN 4 AND 31
        AND (metadata->>'regionKey' IS NULL OR metadata->>'regionKey' NOT LIKE 'NP_%')
        AND (metadata->>'countryCode' IS NULL OR metadata->>'countryCode' != 'CN')
    `;
    console.log(`    挪威坐标范围 (58-71°N, 4-31°E): ${norwayByCoords[0].count} 个 POI`);

    // 3.3 查找所有可能的 countryCode 字段位置
    console.log('\n  查找所有 countryCode 字段位置:');
    const allCountryCodes = await prisma.$queryRaw<Array<{
      location: string;
      countryCode: string;
      count: bigint;
    }>>`
      SELECT 
        'metadata' as location,
        metadata->>'countryCode' as "countryCode",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'countryCode' IS NOT NULL
        AND metadata->>'countryCode' != ''
      GROUP BY metadata->>'countryCode'
      ORDER BY count DESC
    `;

    if (allCountryCodes.length > 0) {
      allCountryCodes.forEach(cc => {
        const name = countryNames[cc.countryCode] || cc.countryCode;
        console.log(`    ${cc.location}.countryCode = ${cc.countryCode} (${name}): ${cc.count} 个 POI`);
      });
    }

    // 4. 查找冰岛和挪威的详细数据
    console.log('\n📊 方法4: 冰岛和挪威详细检查\n');
    
    // 检查冰岛数据（通过多种方式）
    const icelandChecks = await prisma.$queryRaw<Array<{
      method: string;
      count: bigint;
    }>>`
      SELECT 
        'metadata.countryCode = IS' as method,
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'countryCode' = 'IS'
      UNION ALL
      SELECT 
        'physicalMetadata.countryCode = IS' as method,
        COUNT(*) as count
      FROM "Place"
      WHERE "physicalMetadata"->>'countryCode' = 'IS'
      UNION ALL
      SELECT 
        'metadata.externalSource contains iceland' as method,
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'externalSource' LIKE '%iceland%'
      UNION ALL
      SELECT 
        '坐标在冰岛范围内' as method,
        COUNT(*) as count
      FROM "Place"
      WHERE location IS NOT NULL
        AND ST_Y(location::geometry) BETWEEN 63 AND 67
        AND ST_X(location::geometry) BETWEEN -25 AND -13
        AND (metadata->>'regionKey' IS NULL OR metadata->>'regionKey' NOT LIKE 'NP_%')
        AND (metadata->>'countryCode' IS NULL OR metadata->>'countryCode' != 'CN')
    `;

    console.log('  冰岛数据检查:');
    icelandChecks.forEach(check => {
      console.log(`    ${check.method}: ${check.count} 个 POI`);
    });

    // 检查挪威数据
    const norwayChecks = await prisma.$queryRaw<Array<{
      method: string;
      count: bigint;
    }>>`
      SELECT 
        'metadata.countryCode = NO' as method,
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'countryCode' = 'NO'
      UNION ALL
      SELECT 
        'physicalMetadata.countryCode = NO' as method,
        COUNT(*) as count
      FROM "Place"
      WHERE "physicalMetadata"->>'countryCode' = 'NO'
      UNION ALL
      SELECT 
        'metadata.externalSource contains norway' as method,
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'externalSource' LIKE '%norway%'
      UNION ALL
      SELECT 
        '坐标在挪威范围内' as method,
        COUNT(*) as count
      FROM "Place"
      WHERE location IS NOT NULL
        AND ST_Y(location::geometry) BETWEEN 58 AND 71
        AND ST_X(location::geometry) BETWEEN 4 AND 31
        AND (metadata->>'regionKey' IS NULL OR metadata->>'regionKey' NOT LIKE 'NP_%')
        AND (metadata->>'countryCode' IS NULL OR metadata->>'countryCode' != 'CN')
    `;

    console.log('\n  挪威数据检查:');
    norwayChecks.forEach(check => {
      console.log(`    ${check.method}: ${check.count} 个 POI`);
    });

    // 5. 总体统计
    console.log('\n📊 总体统计\n');
    const total = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place"
    `;
    console.log(`  总 POI 数量: ${total[0].count}`);

    const withLocation = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place" WHERE location IS NOT NULL
    `;
    console.log(`  有坐标的 POI: ${withLocation[0].count}`);

    const withMetadata = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place" WHERE metadata IS NOT NULL
    `;
    console.log(`  有 metadata 的 POI: ${withMetadata[0].count}`);

    // 6. 按数据来源分析
    console.log('\n📊 按数据来源分析\n');
    const bySource = await prisma.$queryRaw<Array<{
      source: string;
      count: bigint;
    }>>`
      SELECT 
        CASE 
          WHEN metadata->>'regionKey' LIKE 'NP_%' THEN 'Nepal (Overpass)'
          WHEN metadata->>'osmId' IS NOT NULL THEN 'OSM (Overpass)'
          WHEN metadata->>'source' IS NOT NULL THEN metadata->>'source'
          ELSE 'Unknown'
        END as source,
        COUNT(*) as count
      FROM "Place"
      GROUP BY source
      ORDER BY count DESC
    `;

    bySource.forEach(s => {
      console.log(`  ${s.source}: ${s.count} 个 POI`);
    });

    // 7. 详细国家列表
    console.log('\n📋 详细国家列表\n');
    console.log('='.repeat(60));
    
    // 汇总所有国家
    const allCountries = new Map<string, number>();
    
    // 添加尼泊尔
    allCountries.set('NP', Number(nepalPois[0].count));
    
    // 添加通过 countryCode 的
    withCountryCode.forEach(cc => {
      const existing = allCountries.get(cc.countryCode) || 0;
      allCountries.set(cc.countryCode, existing + Number(cc.count));
    });
    
    // 添加通过 City 关联的
    byCityCountry.forEach(cc => {
      const existing = allCountries.get(cc.countryCode) || 0;
      allCountries.set(cc.countryCode, existing + Number(cc.count));
    });
    
    // 添加通过 ISO3166-1 的
    withIsoCode.forEach(iso => {
      const existing = allCountries.get(iso.isoCode) || 0;
      allCountries.set(iso.isoCode, existing + Number(iso.count));
    });

    // 添加冰岛（如果通过坐标找到）
    if (Number(icelandByCoords[0].count) > 0) {
      const existing = allCountries.get('IS') || 0;
      allCountries.set('IS', existing + Number(icelandByCoords[0].count));
    }

    // 添加挪威（如果通过坐标找到）
    if (Number(norwayByCoords[0].count) > 0) {
      const existing = allCountries.get('NO') || 0;
      allCountries.set('NO', existing + Number(norwayByCoords[0].count));
    }

    // 添加通过 externalSource 找到的国家
    byExternalSource.forEach(s => {
      if (s.countryCode) {
        const existing = allCountries.get(s.countryCode) || 0;
        allCountries.set(s.countryCode, existing + Number(s.count));
      }
    });

    // 排序并显示
    const sortedCountries = Array.from(allCountries.entries())
      .sort((a, b) => b[1] - a[1]);

    console.log('\n国家代码 | 国家名称 | POI 数量');
    console.log('-'.repeat(60));
    sortedCountries.forEach(([code, count]) => {
      const name = countryNames[code] || code;
      console.log(`  ${code.padEnd(8)} | ${name.padEnd(30)} | ${count.toLocaleString()}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ 共找到 ${sortedCountries.length} 个国家/地区的 POI 数据\n`);

  } catch (error: any) {
    console.error('❌ 查询失败:', error.message);
    throw error;
  }
}

checkPoiCountries()
  .catch((error) => {
    console.error('❌ 检查失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

