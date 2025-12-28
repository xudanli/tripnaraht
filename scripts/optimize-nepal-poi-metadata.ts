#!/usr/bin/env ts-node
/**
 * 优化尼泊尔 POI 的 metadata 结构
 * 
 * 功能：
 * 1. 从 metadata.rawTags 提取设施信息到 metadata.facilities
 * 2. 提取的字段包括：internet_access, drinking_water, toilets 等
 * 3. 保留 rawTags 原始数据
 * 
 * 使用方法:
 *   npm run optimize:nepal-poi-metadata
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 从 rawTags 提取设施信息
 */
function extractFacilitiesFromRawTags(rawTags: any): {
  internet?: { available: boolean; type?: 'wlan' | 'wired' | 'none' };
  drinkingWater?: boolean;
  toilets?: boolean;
} | null {
  if (!rawTags || typeof rawTags !== 'object') {
    return null;
  }

  const facilities: {
    internet?: { available: boolean; type?: 'wlan' | 'wired' | 'none' };
    drinkingWater?: boolean;
    toilets?: boolean;
  } = {};

  // 提取 internet_access
  if (rawTags.internet_access) {
    const internetAccess = rawTags.internet_access.toLowerCase();
    if (internetAccess === 'wlan' || internetAccess === 'wifi' || internetAccess === 'yes') {
      facilities.internet = {
        available: true,
        type: internetAccess === 'wlan' || internetAccess === 'wifi' ? 'wlan' : 'wired',
      };
    } else if (internetAccess === 'no' || internetAccess === 'none') {
      facilities.internet = {
        available: false,
        type: 'none',
      };
    } else if (internetAccess === 'wired') {
      facilities.internet = {
        available: true,
        type: 'wired',
      };
    }
  }

  // 提取 drinking_water
  if (rawTags.drinking_water) {
    const drinkingWater = rawTags.drinking_water.toLowerCase();
    facilities.drinkingWater = drinkingWater === 'yes' || drinkingWater === 'true';
  }

  // 提取 toilets
  if (rawTags.toilets) {
    const toilets = rawTags.toilets.toLowerCase();
    facilities.toilets = toilets === 'yes' || toilets === 'true' || toilets === 'public';
  } else if (rawTags.amenity === 'toilets') {
    // 如果 amenity 是 toilets，说明有厕所
    facilities.toilets = true;
  }

  // 如果没有任何设施信息，返回 null
  if (Object.keys(facilities).length === 0) {
    return null;
  }

  return facilities;
}

/**
 * 优化单个 POI 的 metadata
 */
async function optimizePoiMetadata(poi: {
  id: number;
  nameCN: string;
  metadata: any;
}): Promise<{ updated: boolean; error?: string }> {
  try {
    const metadata = poi.metadata || {};
    const rawTags = metadata.rawTags || {};

    // 提取设施信息
    const extractedFacilities = extractFacilitiesFromRawTags(rawTags);

    if (!extractedFacilities) {
      // 没有需要提取的设施信息
      return { updated: false };
    }

    // 合并到现有的 facilities
    const existingFacilities = metadata.facilities || {};
    const updatedFacilities = {
      ...existingFacilities,
      ...extractedFacilities,
    };

    // 更新 metadata
    const updatedMetadata = {
      ...metadata,
      facilities: updatedFacilities,
      // 保留 rawTags
      rawTags: rawTags,
    };

    // 更新数据库
    await prisma.$executeRaw`
      UPDATE "Place"
      SET metadata = ${JSON.stringify(updatedMetadata)}::jsonb,
          "updatedAt" = NOW()
      WHERE id = ${poi.id}
    `;

    return { updated: true };
  } catch (error: any) {
    return { updated: false, error: error.message };
  }
}

/**
 * 主函数：优化所有尼泊尔 POI 的 metadata
 */
async function main() {
  console.log('🇳🇵 开始优化尼泊尔 POI metadata...\n');

  // 查找所有尼泊尔 POI
  const nepalPois = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    metadata: any;
  }>>`
    SELECT 
      id,
      "nameCN",
      metadata
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
    ORDER BY id
  `;

  console.log(`找到 ${nepalPois.length} 个尼泊尔 POI\n`);

  if (nepalPois.length === 0) {
    console.log('✅ 没有需要优化的尼泊尔 POI\n');
    return;
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // 批量处理
  const BATCH_SIZE = 100;
  for (let i = 0; i < nepalPois.length; i += BATCH_SIZE) {
    const batch = nepalPois.slice(i, i + BATCH_SIZE);

    for (const poi of batch) {
      const result = await optimizePoiMetadata(poi);

      if (result.updated) {
        updated++;
      } else if (result.error) {
        console.error(`  ❌ POI ${poi.id} (${poi.nameCN}) 失败: ${result.error}`);
        errors++;
      } else {
        skipped++;
      }
    }

    // 显示进度
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= nepalPois.length) {
      console.log(`  进度: ${Math.min(i + BATCH_SIZE, nepalPois.length)}/${nepalPois.length} (已更新: ${updated}, 跳过: ${skipped}, 错误: ${errors})`);
    }
  }

  console.log(`\n✅ 优化完成！`);
  console.log(`  - 已更新: ${updated} 个`);
  console.log(`  - 跳过: ${skipped} 个（无设施信息）`);
  console.log(`  - 错误: ${errors} 个`);
  console.log(`  - 总计: ${nepalPois.length} 个\n`);

  // 显示统计信息
  console.log('📊 设施信息统计:\n');

  const stats = await prisma.$queryRaw<Array<{
    facility_type: string;
    count: bigint;
  }>>`
    SELECT 
      'internet' as facility_type,
      COUNT(*) as count
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
      AND metadata->'facilities'->'internet'->>'available' = 'true'
    UNION ALL
    SELECT 
      'drinking_water' as facility_type,
      COUNT(*) as count
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
      AND metadata->'facilities'->>'drinkingWater' = 'true'
    UNION ALL
    SELECT 
      'toilets' as facility_type,
      COUNT(*) as count
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
      AND metadata->'facilities'->>'toilets' = 'true'
  `;

  stats.forEach(stat => {
    console.log(`  ${stat.facility_type}: ${Number(stat.count).toLocaleString()} 个`);
  });

  console.log('');
}

main()
  .catch((error) => {
    console.error('❌ 优化失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

