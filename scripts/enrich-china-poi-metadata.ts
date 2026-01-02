#!/usr/bin/env ts-node
/**
 * 为中国的 POI 数据添加 metadata 和 physicalMetadata
 * 
 * 功能：
 * 1. 查询所有中国的 POI（通过 countryCode = 'CN' 或坐标范围：18-54°N, 73-135°E）
 * 2. 为每个 POI 生成/更新 metadata（如果还没有 countryCode，则添加）
 * 3. 为每个 POI 生成/更新 physicalMetadata（使用 PhysicalMetadataGenerator）
 */

import { PrismaClient, PlaceCategory, Prisma } from '@prisma/client';
import { PhysicalMetadataGenerator } from '../src/places/utils/physical-metadata-generator.util';
import { PlaceMetadata } from '../src/places/interfaces/place-metadata.interface';

const prisma = new PrismaClient();

/**
 * 查询中国的 POI（通过 countryCode 或坐标范围）
 */
async function getChinaPois() {
  const pois = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    category: string;
    metadata: any;
    physicalMetadata: any;
    lat: number;
    lng: number;
  }>>`
    SELECT 
      id,
      "nameCN",
      "nameEN",
      category::text as category,
      metadata,
      "physicalMetadata",
      ST_Y(location::geometry) as lat,
      ST_X(location::geometry) as lng
    FROM "Place"
    WHERE 
      location IS NOT NULL
      AND (
        -- 通过 countryCode 识别
        metadata->>'countryCode' = 'CN'
        -- 或者通过坐标范围识别（中国大致范围：18-54°N, 73-135°E）
        OR (ST_Y(location::geometry) BETWEEN 18 AND 54
            AND ST_X(location::geometry) BETWEEN 73 AND 135
            AND (metadata->>'countryCode' IS NULL OR metadata->>'countryCode' NOT IN ('NP', 'NZ', 'IS'))
            AND (metadata->>'regionKey' IS NULL OR metadata->>'regionKey' NOT LIKE 'NP_%')
            AND (metadata->>'regionKey' IS NULL OR metadata->>'regionKey' NOT LIKE 'NZ_%'))
        -- 或者通过 City 关联识别
        OR EXISTS (
          SELECT 1 FROM "City" c 
          WHERE c.id = "Place"."cityId" 
          AND c."countryCode" = 'CN'
        )
      )
    ORDER BY id
  `;

  return pois;
}

/**
 * 生成/更新 metadata
 * 如果已有 metadata，则合并；如果没有，则创建新的
 */
function enrichMetadata(
  existingMetadata: any,
  category: PlaceCategory
): PlaceMetadata {
  // 从现有 metadata 开始，如果没有则创建空对象
  const metadata: any = existingMetadata || {};

  // 确保 countryCode 设置为 'CN'
  if (!metadata.countryCode) {
    metadata.countryCode = 'CN';
  }

  // 如果没有 timezone，设置为中国时区（UTC+8，但中国跨越多个时区，默认使用北京时间）
  if (!metadata.timezone) {
    metadata.timezone = 'Asia/Shanghai';
  }

  // 返回符合 PlaceMetadata 接口的结构
  return metadata as PlaceMetadata;
}

/**
 * 生成 physicalMetadata
 */
function generatePhysicalMetadata(
  category: PlaceCategory,
  metadata: any
): any {
  try {
    return PhysicalMetadataGenerator.generateByCategory(category, metadata);
  } catch (error) {
    console.error('生成 physicalMetadata 失败:', error);
    // 如果生成失败，返回基于类别的默认值
    return PhysicalMetadataGenerator.generateByCategory(category);
  }
}

/**
 * 批量更新 POI 的 metadata 和 physicalMetadata
 */
async function enrichChinaPois() {
  console.log('🇨🇳 开始为中国 POI 数据添加 metadata 和 physicalMetadata...\n');

  try {
    // 1. 查询所有中国的 POI
    console.log('📊 查询中国 POI 数据...');
    const pois = await getChinaPois();
    console.log(`找到 ${pois.length} 个中国 POI\n`);

    if (pois.length === 0) {
      console.log('❌ 没有找到中国 POI 数据');
      return;
    }

    // 2. 统计需要更新的数据
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 3. 批量处理（每批 100 个）
    const batchSize = 100;
    for (let i = 0; i < pois.length; i += batchSize) {
      const batch = pois.slice(i, i + batchSize);
      console.log(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(pois.length / batchSize)} (${batch.length} 个 POI)...`);

      for (const poi of batch) {
        try {
          const category = poi.category as PlaceCategory;

          // 生成/更新 metadata
          const enrichedMetadata = enrichMetadata(poi.metadata, category);

          // 生成 physicalMetadata
          const physicalMetadata = generatePhysicalMetadata(category, enrichedMetadata);

          // 检查是否需要更新（避免不必要的更新）
          const needsUpdate = 
            JSON.stringify(enrichedMetadata) !== JSON.stringify(poi.metadata) ||
            JSON.stringify(physicalMetadata) !== JSON.stringify(poi.physicalMetadata);

          if (needsUpdate) {
            // 更新数据库
            await prisma.place.update({
              where: { id: poi.id },
              data: {
                metadata: enrichedMetadata as Prisma.InputJsonValue,
                physicalMetadata: physicalMetadata as Prisma.InputJsonValue,
                updatedAt: new Date(),
              },
            });
            updatedCount++;
          } else {
            skippedCount++;
          }
        } catch (error: any) {
          console.error(`❌ 更新 POI ${poi.id} (${poi.nameCN}) 失败:`, error.message);
          errorCount++;
        }
      }

      // 显示进度
      if ((i + batchSize) % 500 === 0 || i + batchSize >= pois.length) {
        console.log(`  进度: ${Math.min(i + batchSize, pois.length)}/${pois.length}`);
        console.log(`  已更新: ${updatedCount}, 跳过: ${skippedCount}, 错误: ${errorCount}\n`);
      }
    }

    // 4. 显示统计结果
    console.log('='.repeat(60));
    console.log('✅ 处理完成！\n');
    console.log('📊 统计结果:');
    console.log(`  总 POI 数: ${pois.length}`);
    console.log(`  已更新: ${updatedCount}`);
    console.log(`  跳过（无需更新）: ${skippedCount}`);
    console.log(`  错误: ${errorCount}`);
    console.log('='.repeat(60));

    // 5. 验证更新结果
    console.log('\n🔍 验证更新结果...');
    const sampleUpdated = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      hasMetadata: boolean;
      hasPhysicalMetadata: boolean;
      countryCode: string | null;
    }>>`
      SELECT 
        id,
        "nameCN",
        (metadata IS NOT NULL) as "hasMetadata",
        ("physicalMetadata" IS NOT NULL) as "hasPhysicalMetadata",
        metadata->>'countryCode' as "countryCode"
      FROM "Place"
      WHERE 
        (
          metadata->>'countryCode' = 'CN'
          OR EXISTS (
            SELECT 1 FROM "City" c 
            WHERE c.id = "Place"."cityId" 
            AND c."countryCode" = 'CN'
          )
        )
      LIMIT 10
    `;

    console.log('\n样本数据验证:');
    sampleUpdated.forEach(poi => {
      console.log(`  ${poi.nameCN}:`);
      console.log(`    Metadata: ${poi.hasMetadata ? '✅' : '❌'}`);
      console.log(`    PhysicalMetadata: ${poi.hasPhysicalMetadata ? '✅' : '❌'}`);
      console.log(`    CountryCode: ${poi.countryCode || 'N/A'}`);
    });

  } catch (error: any) {
    console.error('❌ 处理失败:', error);
    throw error;
  }
}

// 运行脚本
enrichChinaPois()
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

