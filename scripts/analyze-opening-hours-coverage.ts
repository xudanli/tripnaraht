#!/usr/bin/env ts-node
/**
 * 分析 opening_hours 数据覆盖率
 * 
 * 分析为什么只有部分POI有结构化的营业时间
 */

import { PrismaClient } from '@prisma/client';
import { OsmOpeningHoursParser } from '../src/common/utils/osm-opening-hours-parser.util';

const prisma = new PrismaClient();

async function analyzeCoverage() {
  console.log('📊 分析 opening_hours 数据覆盖率...\n');

  try {
    // 1. 统计总体情况
    const totalStats = await prisma.$queryRaw<Array<{
      total: bigint;
      has_openinghours: bigint;
      has_rawtags_opening_hours: bigint;
      has_metadata_opening_hours: bigint;
      has_osmformat: bigint;
    }>>`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE metadata->'openingHours' IS NOT NULL) as has_openinghours,
        COUNT(*) FILTER (WHERE metadata->'rawTags'->>'opening_hours' IS NOT NULL) as has_rawtags_opening_hours,
        COUNT(*) FILTER (WHERE metadata->>'opening_hours' IS NOT NULL) as has_metadata_opening_hours,
        COUNT(*) FILTER (WHERE metadata->'openingHours'->>'osmFormat' IS NOT NULL) as has_osmformat
      FROM "Place"
      WHERE metadata IS NOT NULL
    `;

    const stats = totalStats[0];
    console.log('📈 总体统计:');
    console.log(`  总 POI 数: ${stats.total}`);
    console.log(`  有 openingHours: ${stats.has_openinghours}`);
    console.log(`  有 rawTags.opening_hours: ${stats.has_rawtags_opening_hours}`);
    console.log(`  有 metadata.opening_hours: ${stats.has_metadata_opening_hours}`);
    console.log(`  有 openingHours.osmFormat: ${stats.has_osmformat}`);
    console.log(`  覆盖率: ${((Number(stats.has_openinghours) / Number(stats.total)) * 100).toFixed(2)}%\n`);

    // 2. 查找有原始数据但未解析的POI
    const unparsed = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      raw_opening_hours: string | null;
      metadata_opening_hours: string | null;
    }>>`
      SELECT 
        id,
        "nameCN",
        metadata->'rawTags'->>'opening_hours' as raw_opening_hours,
        metadata->>'opening_hours' as metadata_opening_hours
      FROM "Place"
      WHERE metadata IS NOT NULL
        AND (
          metadata->'rawTags'->>'opening_hours' IS NOT NULL
          OR metadata->>'opening_hours' IS NOT NULL
        )
        AND metadata->'openingHours' IS NULL
      LIMIT 50
    `;

    console.log(`\n❌ 有原始数据但未解析的POI（前50个）: ${unparsed.length}`);
    
    let unparsableCount = 0;
    let parsableButNotStored = 0;

    for (const poi of unparsed) {
      const rawHours = poi.raw_opening_hours || poi.metadata_opening_hours;
      if (!rawHours) continue;

      const parsed = OsmOpeningHoursParser.parse(rawHours);
      if (!parsed) {
        unparsableCount++;
        if (unparsableCount <= 10) {
          console.log(`\n  ${poi.nameCN || 'Unnamed'} (ID: ${poi.id}):`);
          console.log(`    原始数据: "${rawHours}"`);
          console.log(`    状态: ❌ 无法解析`);
        }
      } else {
        parsableButNotStored++;
      }
    }

    console.log(`\n  无法解析: ${unparsableCount} 个`);
    console.log(`  可解析但未存储: ${parsableButNotStored} 个`);

    // 3. 分析无法解析的原因
    console.log('\n🔍 分析无法解析的格式...');
    
    const unparsableSamples = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      raw_opening_hours: string;
    }>>`
      SELECT 
        id,
        "nameCN",
        COALESCE(
          metadata->'rawTags'->>'opening_hours',
          metadata->>'opening_hours'
        ) as raw_opening_hours
      FROM "Place"
      WHERE metadata IS NOT NULL
        AND (
          metadata->'rawTags'->>'opening_hours' IS NOT NULL
          OR metadata->>'opening_hours' IS NOT NULL
        )
        AND metadata->'openingHours' IS NULL
      LIMIT 100
    `;

    const formatAnalysis: Record<string, number> = {};
    const unparsableFormats: string[] = [];

    for (const poi of unparsableSamples) {
      if (!poi.raw_opening_hours) continue;
      
      const parsed = OsmOpeningHoursParser.parse(poi.raw_opening_hours);
      if (!parsed) {
        const format = poi.raw_opening_hours.substring(0, 50); // 取前50个字符
        formatAnalysis[format] = (formatAnalysis[format] || 0) + 1;
        
        if (unparsableFormats.length < 20 && !unparsableFormats.includes(format)) {
          unparsableFormats.push(format);
        }
      }
    }

    console.log(`\n  无法解析的格式示例（前20个）:`);
    unparsableFormats.slice(0, 20).forEach((format, i) => {
      console.log(`  ${i + 1}. "${format}${format.length >= 50 ? '...' : ''}"`);
    });

    // 4. 统计已经解析过的POI（已经有 openingHours 但可能没有 osmFormat）
    const alreadyParsed = await prisma.$queryRaw<Array<{
      count: bigint;
    }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE metadata->'openingHours' IS NOT NULL
        AND metadata->'openingHours'->>'osmFormat' IS NULL
    `;

    console.log(`\n✅ 已有 openingHours 但没有 osmFormat: ${alreadyParsed[0].count} 个`);
    console.log(`  说明：这些POI可能是从其他数据源（如高德、Google）导入的，不是OSM格式`);

    // 5. 总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 总结:');
    console.log('='.repeat(60));
    console.log(`1. 总 POI 数: ${stats.total}`);
    console.log(`2. 有结构化 openingHours: ${stats.has_openinghours} (${((Number(stats.has_openinghours) / Number(stats.total)) * 100).toFixed(2)}%)`);
    const totalOsmData = Number(stats.has_rawtags_opening_hours) + Number(stats.has_metadata_opening_hours || 0);
    console.log(`3. 有 OSM 原始数据: ${totalOsmData}`);
    console.log(`4. 无法解析的格式: ~${unparsableCount} 个`);
    console.log('\n💡 原因分析:');
    console.log(`  - 只有 ${totalOsmData} 个POI有OSM格式的 opening_hours`);
    console.log(`  - 其中 ${unparsableCount} 个格式无法解析（格式不规范或包含特殊语法）`);
    console.log(`  - 其他POI可能来自非OSM数据源（如高德、Google Places），使用不同的格式`);

  } catch (error: any) {
    console.error('❌ 分析失败:', error);
    throw error;
  }
}

// 运行分析
analyzeCoverage()
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

