#!/usr/bin/env tsx
/**
 * 分析冰岛 POI 数据覆盖率
 * 统计当前数据库中的冰岛 POI 数量，并识别数据缺口
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface POIStats {
  totalCount: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  withOpeningHours: number;
  withLocation: number;
  withGooglePlaceId: number;
}

interface ServiceFacility {
  type: 'GAS_STATION' | 'RESCUE_STATION' | 'CAMPING' | 'MOUNTAIN_HUT';
  name: string;
  location?: { lat: number; lng: number };
  fRoadNearby?: string[];
}

async function analyzeIcelandPOIs(): Promise<void> {
  console.log('🔍 开始分析冰岛 POI 覆盖率...\n');

  // 1. 统计通过 City 关联的冰岛 POI
  const poiViaCity = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT p.id) as count
    FROM "Place" p
    INNER JOIN "City" c ON p."cityId" = c.id
    WHERE c."countryCode" = 'IS'
  `;

  // 2. 统计通过 metadata 的冰岛 POI
  const poiViaMetadata = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM "Place"
    WHERE metadata->>'country' = 'IS'
       OR metadata->>'countryCode' = 'IS'
  `;

  // 3. 统计包含冰岛关键词的 POI
  const poiViaName = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM "Place"
    WHERE "nameEN" ILIKE '%iceland%'
       OR "nameCN" LIKE '%冰岛%'
  `;

  // 4. 去重后的总数
  const totalPOIs = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT p.id) as count
    FROM "Place" p
    LEFT JOIN "City" c ON p."cityId" = c.id
    WHERE c."countryCode" = 'IS'
       OR p.metadata->>'country' = 'IS'
       OR p.metadata->>'countryCode' = 'IS'
       OR p."nameEN" ILIKE '%iceland%'
       OR p."nameCN" LIKE '%冰岛%'
  `;

  // 5. 按分类统计
  const byCategory = await prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
    SELECT
      p.category,
      COUNT(*) as count
    FROM "Place" p
    LEFT JOIN "City" c ON p."cityId" = c.id
    WHERE c."countryCode" = 'IS'
       OR p.metadata->>'country' = 'IS'
       OR p.metadata->>'countryCode' = 'IS'
    GROUP BY p.category
    ORDER BY count DESC
  `;

  // 6. 统计带开放时间的 POI
  const withOpeningHours = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT p.id) as count
    FROM "Place" p
    LEFT JOIN "City" c ON p."cityId" = c.id
    WHERE (c."countryCode" = 'IS' OR p.metadata->>'countryCode' = 'IS')
      AND p.metadata->>'openingHours' IS NOT NULL
  `;

  // 7. 统计有地理位置的 POI
  const withLocation = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT p.id) as count
    FROM "Place" p
    LEFT JOIN "City" c ON p."cityId" = c.id
    WHERE (c."countryCode" = 'IS' OR p.metadata->>'countryCode' = 'IS')
      AND p.location IS NOT NULL
  `;

  // 8. 统计有 Google Place ID 的 POI
  const withGooglePlaceId = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT p.id) as count
    FROM "Place" p
    LEFT JOIN "City" c ON p."cityId" = c.id
    WHERE (c."countryCode" = 'IS' OR p.metadata->>'countryCode' = 'IS')
      AND p."googlePlaceId" IS NOT NULL
  `;

  // 输出统计结果
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 冰岛 POI 数据统计');
  console.log('═══════════════════════════════════════════════════════\n');

  const total = Number(totalPOIs[0]?.count || 0);
  console.log(`总计: ${total} 个 POI\n`);

  console.log('数据来源分布:');
  console.log(`  - 通过 City 关联: ${Number(poiViaCity[0]?.count || 0)}`);
  console.log(`  - 通过 metadata: ${Number(poiViaMetadata[0]?.count || 0)}`);
  console.log(`  - 通过名称关键词: ${Number(poiViaName[0]?.count || 0)}\n`);

  console.log('数据质量:');
  console.log(`  - 有地理位置: ${Number(withLocation[0]?.count || 0)} (${((Number(withLocation[0]?.count || 0) / total) * 100).toFixed(1)}%)`);
  console.log(`  - 有开放时间: ${Number(withOpeningHours[0]?.count || 0)} (${((Number(withOpeningHours[0]?.count || 0) / total) * 100).toFixed(1)}%)`);
  console.log(`  - 有 Google Place ID: ${Number(withGooglePlaceId[0]?.count || 0)} (${((Number(withGooglePlaceId[0]?.count || 0) / total) * 100).toFixed(1)}%)\n`);

  console.log('按分类统计:');
  byCategory.forEach((cat) => {
    const count = Number(cat.count);
    const percentage = ((count / total) * 100).toFixed(1);
    console.log(`  - ${cat.category}: ${count} (${percentage}%)`);
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🚨 数据缺口分析');
  console.log('═══════════════════════════════════════════════════════\n');

  // 分析数据缺口
  const gaps: string[] = [];

  if (total < 100) {
    gaps.push(`❌ P0 - POI 总数不足 100 个（当前 ${total} 个），需要至少 100+ 核心 POI`);
  } else if (total < 200) {
    gaps.push(`⚠️ P1 - POI 总数偏少（当前 ${total} 个），建议补充到 200+ 个`);
  }

  const locationCoverage = Number(withLocation[0]?.count || 0) / total;
  if (locationCoverage < 0.9) {
    gaps.push(`❌ P0 - 地理位置覆盖率不足 90%（当前 ${(locationCoverage * 100).toFixed(1)}%）`);
  }

  const openingHoursCoverage = Number(withOpeningHours[0]?.count || 0) / total;
  if (openingHoursCoverage < 0.5) {
    gaps.push(`⚠️ P1 - 开放时间覆盖率不足 50%（当前 ${(openingHoursCoverage * 100).toFixed(1)}%）`);
  }

  // 检查关键分类
  const categoryMap = new Map(byCategory.map((c) => [c.category, Number(c.count)]));
  const requiredCategories = {
    ATTRACTION: { min: 30, priority: 'P0' },
    RESTAURANT: { min: 20, priority: 'P1' },
    ACCOMMODATION: { min: 20, priority: 'P1' },
    PARKING: { min: 10, priority: 'P1' },
    GAS_STATION: { min: 10, priority: 'P0' },
  };

  Object.entries(requiredCategories).forEach(([category, { min, priority }]) => {
    const count = categoryMap.get(category) || 0;
    if (count < min) {
      gaps.push(`${priority === 'P0' ? '❌' : '⚠️'} ${priority} - ${category} 数量不足（当前 ${count} 个，需要 ${min}+ 个）`);
    }
  });

  if (gaps.length === 0) {
    console.log('✅ 数据质量良好，无明显缺口\n');
  } else {
    gaps.forEach((gap) => console.log(gap));
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('🎯 建议补充的 POI 类型');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('P0 必须补充:');
  console.log('  1. F-road 沿线加油站 (至少 10 个)');
  console.log('  2. F-road 沿线救援站 / 紧急联系点 (至少 5 个)');
  console.log('  3. 高地小屋 (Mountain Huts) (至少 10 个)');
  console.log('  4. 核心景点 (Landmannalaugar, Þórsmörk, Askja 等)\n');

  console.log('P1 重要补充:');
  console.log('  1. 露营地 (至少 20 个)');
  console.log('  2. 河流穿越点 (标注难度和水深)');
  console.log('  3. 观景点 / 拍照点');
  console.log('  4. 超市 / 补给点\n');

  console.log('P2 优化补充:');
  console.log('  1. 徒步步道起点 / 终点');
  console.log('  2. 温泉 / 地热区');
  console.log('  3. 博物馆 / 文化中心');
  console.log('  4. 游客中心\n');

  console.log('═══════════════════════════════════════════════════════');
  console.log('📋 下一步行动');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('1. 创建 POI 补充清单 Excel / Notion 表格');
  console.log('2. 从以下来源收集数据:');
  console.log('   - Google Maps Places API (搜索 Iceland + 分类)');
  console.log('   - OpenStreetMap (冰岛区域导出)');
  console.log('   - road.is 官方数据');
  console.log('   - 手动整理核心 F-road 服务设施');
  console.log('3. 批量导入数据库（使用 Prisma 脚本）');
  console.log('4. 验证数据质量（地理位置、开放时间等）\n');
}

async function main() {
  try {
    await analyzeIcelandPOIs();
  } catch (error) {
    console.error('❌ 分析失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
