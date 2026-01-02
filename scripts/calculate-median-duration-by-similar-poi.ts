#!/usr/bin/env ts-node
/**
 * 计算同类 POI 的统计中位数（快招2：填充 medianDurationBySimilarPoi）
 * 
 * 功能：
 * 1. 按 category + subCategory + countryCode 分组
 * 2. 计算每组 POI 的 estimated_duration_min 中位数
 * 3. 更新 metadata.medianDurationBySimilarPoi 字段
 * 
 * 使用方法:
 *   npm run calculate:median-duration
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 计算同类 POI 的中位数时长
 */
async function calculateMedianDuration() {
  console.log('📊 开始计算同类 POI 的统计中位数...\n');

  try {
    // 1. 查询所有有 physicalMetadata 的 POI
    const pois = await prisma.$queryRaw<Array<{
      id: number;
      category: string;
      metadata: any;
      physicalMetadata: any;
    }>>`
      SELECT 
        id,
        category::text as category,
        metadata,
        "physicalMetadata"
      FROM "Place"
      WHERE "physicalMetadata" IS NOT NULL
        AND "physicalMetadata"->>'estimated_duration_min' IS NOT NULL
        AND metadata IS NOT NULL
      ORDER BY id
    `;

    console.log(`找到 ${pois.length} 个有 estimated_duration_min 的 POI\n`);

    // 2. 按 category + subCategory + countryCode 分组
    const groups = new Map<string, Array<{ id: number; duration: number }>>();

    for (const poi of pois) {
      const category = poi.category;
      const metadata = poi.metadata || {};
      const physicalMetadata = poi.physicalMetadata || {};
      
      const subCategory = metadata.subCategory || 'default';
      const countryCode = metadata.countryCode || 'unknown';
      
      // 构建分组键
      const groupKey = `${category}|${subCategory}|${countryCode}`;
      
      const duration = physicalMetadata.estimated_duration_min;
      if (typeof duration === 'number' && duration > 0) {
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push({ id: poi.id, duration });
      }
    }

    console.log(`分成 ${groups.size} 个组\n`);

    // 3. 计算每组的中位数
    const medianMap = new Map<string, number>();

    for (const [groupKey, durations] of groups.entries()) {
      if (durations.length < 3) {
        // 如果组内 POI 数量少于 3，跳过（样本太小）
        continue;
      }

      const sorted = durations.map(d => d.duration).sort((a, b) => a - b);
      const median = calculateMedian(sorted);
      medianMap.set(groupKey, median);

      const [category, subCategory, countryCode] = groupKey.split('|');
      console.log(`  ${category}/${subCategory}/${countryCode}: 中位数 ${median} 分钟 (${durations.length} 个 POI)`);
    }

    console.log(`\n计算出 ${medianMap.size} 个组的中位数\n`);

    // 4. 更新每个 POI 的 metadata.medianDurationBySimilarPoi
    let updatedCount = 0;
    let skippedCount = 0;

    for (const poi of pois) {
      const category = poi.category;
      const metadata = poi.metadata || {};
      const subCategory = metadata.subCategory || 'default';
      const countryCode = metadata.countryCode || 'unknown';
      const groupKey = `${category}|${subCategory}|${countryCode}`;

      const median = medianMap.get(groupKey);
      if (!median) {
        skippedCount++;
        continue;
      }

      // 检查是否需要更新
      const currentMedian = metadata.medianDurationBySimilarPoi;
      if (currentMedian === median) {
        skippedCount++;
        continue;
      }

      // 更新 metadata
      const updatedMetadata = {
        ...metadata,
        medianDurationBySimilarPoi: median,
      };

      await prisma.place.update({
        where: { id: poi.id },
        data: {
          metadata: updatedMetadata as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });

      updatedCount++;
    }

    // 5. 显示统计结果
    console.log('='.repeat(60));
    console.log('✅ 处理完成！\n');
    console.log('📊 统计结果:');
    console.log(`  总 POI 数: ${pois.length}`);
    console.log(`  已更新: ${updatedCount}`);
    console.log(`  跳过（无需更新或样本不足）: ${skippedCount}`);
    console.log(`  有效分组数: ${medianMap.size}`);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ 处理失败:', error);
    throw error;
  }
}

/**
 * 计算数组的中位数
 */
function calculateMedian(sorted: number[]): number {
  const len = sorted.length;
  if (len === 0) return 0;
  
  if (len % 2 === 0) {
    // 偶数个元素，取中间两个的平均值
    return Math.round((sorted[len / 2 - 1] + sorted[len / 2]) / 2);
  } else {
    // 奇数个元素，取中间值
    return sorted[Math.floor(len / 2)];
  }
}

// 运行脚本
calculateMedianDuration()
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

