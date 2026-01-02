#!/usr/bin/env ts-node
/**
 * 为徒步类 POI 关联 Trail 数据（快招3）
 * 
 * 功能：
 * 1. 查找徒步类 POI（通过 accessType、subCategory 等）
 * 2. 通过名称匹配或坐标匹配找到相关的 Trail
 * 3. 更新 POI 的 metadata.trailId
 * 
 * 使用方法:
 *   npm run link:poi-to-trail
 *   npm run link:poi-to-trail -- --country=NP
 *   npm run link:poi-to-trail -- --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface LinkOptions {
  countryCode?: string;
  dryRun?: boolean;
  distanceThreshold?: number; // 距离阈值（米），默认 500
}

/**
 * 模糊匹配 POI 名称和 Trail 名称
 */
function nameSimilarity(name1: string, name2: string): number {
  const s1 = name1.toLowerCase().trim();
  const s2 = name2.toLowerCase().trim();
  
  // 完全匹配
  if (s1 === s2) return 1.0;
  
  // 包含关系
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // 简单的词匹配
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w));
  if (commonWords.length > 0) {
    return commonWords.length / Math.max(words1.length, words2.length);
  }
  
  return 0;
}

/**
 * 为 POI 查找匹配的 Trail
 */
async function findMatchingTrail(
  poi: { id: number; nameCN: string; nameEN: string | null; lat: number; lng: number; metadata: any },
  options: LinkOptions
): Promise<number | null> {
  // 方法1：通过坐标匹配（如果 POI 和 Trail 的起点/终点接近）
  const trails = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    startPlaceId: number | null;
    endPlaceId: number | null;
    distance_m: number;
  }>>`
    SELECT 
      t.id,
      t."nameCN",
      t."nameEN",
      t."startPlaceId",
      t."endPlaceId",
      ST_Distance(
        ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography,
        COALESCE(
          (SELECT location FROM "Place" WHERE id = t."startPlaceId"),
          (SELECT location FROM "Place" WHERE id = t."endPlaceId")
        )::geography
      ) as distance_m
    FROM "Trail" t
    WHERE (
      t."startPlaceId" IS NOT NULL
      OR t."endPlaceId" IS NOT NULL
    )
    ORDER BY distance_m ASC
    LIMIT 10
  `;

  // 找到距离最近的 Trail
  if (trails.length > 0 && trails[0].distance_m <= (options.distanceThreshold || 500)) {
    return trails[0].id;
  }

  // 方法2：通过名称匹配
  const allTrails = await prisma.trail.findMany({
    select: {
      id: true,
      nameCN: true,
      nameEN: true,
    },
    take: 1000, // 限制数量，避免性能问题
  });

  let bestMatch: { id: number; score: number } | null = null;
  const threshold = 0.6; // 相似度阈值

  for (const trail of allTrails) {
    const score1 = nameSimilarity(poi.nameCN, trail.nameCN);
    const score2 = poi.nameEN && trail.nameEN 
      ? nameSimilarity(poi.nameEN, trail.nameEN)
      : 0;
    
    const maxScore = Math.max(score1, score2);
    
    if (maxScore >= threshold && (!bestMatch || maxScore > bestMatch.score)) {
      bestMatch = { id: trail.id, score: maxScore };
    }
  }

  return bestMatch ? bestMatch.id : null;
}

/**
 * 批量关联 POI 到 Trail
 */
async function linkPoiToTrail(options: LinkOptions = {}) {
  console.log('🔗 开始为徒步类 POI 关联 Trail 数据...\n');
  if (options.dryRun) {
    console.log('⚠️  干运行模式（不会实际更新数据库）\n');
  }

  try {
    // 1. 查询徒步类 POI
    let query = `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        metadata,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM "Place"
      WHERE location IS NOT NULL
        AND category = 'ATTRACTION'
        AND (
          metadata->>'accessType' IN ('HIKING', 'TREKKING')
          OR metadata->>'subCategory' LIKE '%trail%'
          OR metadata->>'subCategory' LIKE '%hike%'
          OR metadata->>'subCategory' LIKE '%trek%'
        )
    `;

    if (options.countryCode) {
      query += ` AND metadata->>'countryCode' = '${options.countryCode}'`;
    }

    query += ` ORDER BY id LIMIT 500`; // 限制数量，避免处理时间过长

    const pois = await prisma.$queryRawUnsafe<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      metadata: any;
      lat: number;
      lng: number;
    }>>(query);

    console.log(`找到 ${pois.length} 个徒步类 POI\n`);

    if (pois.length === 0) {
      console.log('❌ 没有找到符合条件的 POI');
      return;
    }

    // 2. 为每个 POI 查找匹配的 Trail
    let linkedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const poi of pois) {
      try {
        const metadata = poi.metadata || {};

        // 如果已经有 trailId，跳过
        if (metadata.trailId) {
          skippedCount++;
          continue;
        }

        // 查找匹配的 Trail
        const trailId = await findMatchingTrail(poi, options);

        if (!trailId) {
          skippedCount++;
          continue;
        }

        // 更新 metadata
        if (!options.dryRun) {
          const updatedMetadata = {
            ...metadata,
            trailId: trailId,
          };

          await prisma.place.update({
            where: { id: poi.id },
            data: {
              metadata: updatedMetadata as any,
              updatedAt: new Date(),
            },
          });
        }

        linkedCount++;
        console.log(`  ✅ ${poi.nameCN} → Trail #${trailId}`);
      } catch (error: any) {
        console.error(`  ❌ ${poi.nameCN}: ${error.message}`);
        errorCount++;
      }
    }

    // 3. 显示统计结果
    console.log('\n' + '='.repeat(60));
    console.log('✅ 处理完成！\n');
    console.log('📊 统计结果:');
    console.log(`  总 POI 数: ${pois.length}`);
    console.log(`  已关联: ${linkedCount}`);
    console.log(`  跳过（已有 trailId 或未找到匹配）: ${skippedCount}`);
    console.log(`  错误: ${errorCount}`);
    if (options.dryRun) {
      console.log(`\n⚠️  这是干运行，数据库未实际更新`);
    }
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ 处理失败:', error);
    throw error;
  }
}

// 解析命令行参数
const args = process.argv.slice(2);
const options: LinkOptions = {
  dryRun: args.includes('--dry-run'),
  distanceThreshold: 500,
};

const countryIndex = args.findIndex(arg => arg.startsWith('--country='));
if (countryIndex >= 0) {
  options.countryCode = args[countryIndex].split('=')[1];
}

// 运行脚本
linkPoiToTrail(options)
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

