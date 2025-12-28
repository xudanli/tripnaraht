#!/usr/bin/env ts-node
/**
 * 填充 Place 表缺失的字段
 * 
 * 功能：
 * 1. 从 metadata.rawTags 提取 address 到 address 字段
 * 2. 根据坐标和名称匹配 cityId
 * 3. 生成 embedding（可选）
 * 
 * 使用方法:
 *   npm run fill:place-fields -- --address      # 只填充 address
 *   npm run fill:place-fields -- --cityId       # 只填充 cityId
 *   npm run fill:place-fields -- --all          # 填充 address 和 cityId
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 从 metadata.rawTags 提取 address
 */
async function fillAddressFromMetadata() {
  console.log('🏠 开始填充 address 字段...\n');

  // 查找 metadata 中有地址但 address 字段为空的 POI
  const poisWithAddressInMetadata = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    address_in_metadata: string;
  }>>`
    SELECT 
      id,
      "nameCN",
      COALESCE(
        metadata->'rawTags'->>'addr:full',
        metadata->'rawTags'->>'address',
        metadata->'rawTags'->>'addr:street',
        metadata->'rawTags'->>'addr:city'
      ) as address_in_metadata
    FROM "Place"
    WHERE (
      metadata->'rawTags'->>'addr:full' IS NOT NULL
      OR metadata->'rawTags'->>'address' IS NOT NULL
      OR metadata->'rawTags'->>'addr:street' IS NOT NULL
      OR metadata->'rawTags'->>'addr:city' IS NOT NULL
    )
    AND (address IS NULL OR address = '')
    LIMIT 5000
  `;

  console.log(`找到 ${poisWithAddressInMetadata.length} 个可以从 metadata 提取 address 的 POI\n`);

  if (poisWithAddressInMetadata.length === 0) {
    console.log('✅ 没有需要填充 address 的 POI\n');
    return { updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;

  // 单个更新（不在事务中，避免超时）
  for (let i = 0; i < poisWithAddressInMetadata.length; i++) {
    const poi = poisWithAddressInMetadata[i];
    
    try {
      await prisma.$executeRaw`
        UPDATE "Place"
        SET address = ${poi.address_in_metadata},
            "updatedAt" = NOW()
        WHERE id = ${poi.id}
      `;
      updated++;
      
      if ((i + 1) % 100 === 0 || i + 1 === poisWithAddressInMetadata.length) {
        console.log(`  进度: ${i + 1}/${poisWithAddressInMetadata.length}`);
      }
    } catch (error: any) {
      console.error(`  ❌ 更新 POI ${poi.id} 失败: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n✅ 更新完成: ${updated} 个, ❌ 错误: ${errors} 个\n`);
  return { updated, errors };
}

/**
 * 根据坐标和名称匹配 cityId
 */
async function fillCityIdFromLocation() {
  console.log('📍 开始填充 cityId 字段...\n');

  // 查找没有 cityId 但有坐标的 POI
  const poisWithoutCityId = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    lat: number;
    lng: number;
    regionKey: string | null;
  }>>`
    SELECT 
      id,
      "nameCN",
      ST_Y(location::geometry) as lat,
      ST_X(location::geometry) as lng,
      metadata->>'regionKey' as "regionKey"
    FROM "Place"
    WHERE "cityId" IS NULL
      AND location IS NOT NULL
    LIMIT 10000
  `;

  console.log(`找到 ${poisWithoutCityId.length} 个需要匹配 cityId 的 POI\n`);

  if (poisWithoutCityId.length === 0) {
    console.log('✅ 没有需要填充 cityId 的 POI\n');
    return { matched: 0, notMatched: 0, errors: 0 };
  }

  let matched = 0;
  let notMatched = 0;
  let errors = 0;

  // 批量处理（每批 50 条，因为需要查询 City 表）
  const BATCH_SIZE = 50;
  for (let i = 0; i < poisWithoutCityId.length; i += BATCH_SIZE) {
    const batch = poisWithoutCityId.slice(i, i + BATCH_SIZE);
    
    for (const poi of batch) {
      try {
        // 查找最近的 City（先尝试 100km，如果没找到再扩大到 200km）
        // 对于尼泊尔POI，优先匹配尼泊尔的城市
        const searchRadius = poi.regionKey?.startsWith('NP_') ? 200000 : 150000; // 200km for Nepal, 150km for others
        const maxDistance = poi.regionKey?.startsWith('NP_') ? 200 : 150; // 允许的最大距离
        
        const nearestCity = await prisma.$queryRaw<Array<{
          id: number;
          name: string;
          countryCode: string;
          distance_km: number;
        }>>`
          SELECT 
            id,
            name,
            "countryCode",
            ROUND((ST_Distance(
              location::geography,
              ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
            ) / 1000.0)::numeric, 1)::float as distance_km
          FROM "City"
          WHERE location IS NOT NULL
            AND ST_DWithin(
              location::geography,
              ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography,
              ${searchRadius}
            )
          ${poi.regionKey?.startsWith('NP_') 
            ? Prisma.sql`AND "countryCode" = 'NP'` 
            : Prisma.sql``
          }
          ORDER BY distance_km
          LIMIT 5
        `;

        if (nearestCity.length > 0) {
          // 选择最近的城市
          const selectedCity = nearestCity[0];
          
          // 检查距离是否在允许范围内
          if (selectedCity.distance_km <= maxDistance) {
            await prisma.$executeRaw`
              UPDATE "Place"
              SET "cityId" = ${selectedCity.id},
                  "updatedAt" = NOW()
              WHERE id = ${poi.id}
            `;
            matched++;
          } else {
            // 距离太远，不匹配
            notMatched++;
          }
        } else {
          notMatched++;
        }

        if ((matched + notMatched) % 100 === 0) {
          console.log(`  进度: ${matched + notMatched}/${poisWithoutCityId.length} (已匹配: ${matched}, 未匹配: ${notMatched})`);
        }
      } catch (error: any) {
        console.error(`❌ 处理 POI ${poi.id} 失败: ${error.message}`);
        errors++;
      }
    }
  }

  console.log(`\n✅ 匹配完成: ${matched} 个, ⚠️  未匹配: ${notMatched} 个, ❌ 错误: ${errors} 个\n`);
  return { matched, notMatched, errors };
}

/**
 * 检查尼泊尔城市数据
 */
async function checkNepalCities() {
  console.log('🇳🇵 检查尼泊尔城市数据...\n');

  const nepalCities = await prisma.$queryRaw<Array<{
    id: number;
    name: string;
    nameEN: string | null;
    lat: number;
    lng: number;
  }>>`
    SELECT 
      id,
      name,
      "nameEN",
      ST_Y(location::geometry) as lat,
      ST_X(location::geometry) as lng
    FROM "City"
    WHERE "countryCode" = 'NP'
      AND location IS NOT NULL
    ORDER BY name
  `;

  console.log(`找到 ${nepalCities.length} 个尼泊尔城市:\n`);
  nepalCities.forEach(city => {
    console.log(`  ${city.name}${city.nameEN ? ` (${city.nameEN})` : ''} - ID: ${city.id} - 坐标: ${city.lat?.toFixed(4)}, ${city.lng?.toFixed(4)}`);
  });
  console.log('');

  return nepalCities.length;
}

async function main() {
  const args = process.argv.slice(2);
  const fillAddress = args.includes('--address') || args.includes('--all');
  const fillCityId = args.includes('--cityId') || args.includes('--all');
  const checkCities = args.includes('--check-cities');

  if (!fillAddress && !fillCityId && !checkCities) {
    console.log('❌ 请指定要执行的操作:\n');
    console.log('使用方法:');
    console.log('  npm run fill:place-fields -- --address      # 只填充 address');
    console.log('  npm run fill:place-fields -- --cityId       # 只填充 cityId');
    console.log('  npm run fill:place-fields -- --all          # 填充 address 和 cityId');
    console.log('  npm run fill:place-fields -- --check-cities # 检查城市数据');
    console.log('\n示例:');
    console.log('  npm run fill:place-fields -- --all');
    process.exit(1);
  }

  console.log('🚀 开始填充 Place 表缺失字段...\n');
  console.log('='.repeat(60) + '\n');

  try {
    if (checkCities) {
      await checkNepalCities();
    }

    if (fillAddress) {
      await fillAddressFromMetadata();
    }

    if (fillCityId) {
      // 先检查尼泊尔城市
      const nepalCityCount = await checkNepalCities();
      if (nepalCityCount === 0) {
        console.log('⚠️  警告: 没有找到尼泊尔城市数据，cityId 匹配可能不准确\n');
      }
      
      await fillCityIdFromLocation();
    }

    console.log('✅ 所有操作完成！\n');
  } catch (error: any) {
    console.error('❌ 操作失败:', error.message);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('❌ 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


