#!/usr/bin/env ts-node
/**
 * 根据 Place 表更新 address 地址字段（包含中英文名称）
 * 
 * 功能：
 * 1. 查找需要更新 address 的 Place
 * 2. 根据 nameCN、nameEN、cityId、location 等信息构建包含中英文名称的地址
 * 3. 支持按 cityId 过滤
 * 4. 批量处理，支持断点续传
 * 
 * 地址格式：
 * - 如果有城市信息："{nameCN} / {nameEN}, {cityNameCN} / {cityNameEN}"
 * - 如果只有地点名称："{nameCN} / {nameEN}"
 * - 如果有坐标：添加坐标信息
 * 
 * 使用方法:
 *   npm run update:place-address -- --all                    # 处理所有符合条件的 Place
 *   npm run update:place-address -- --limit 100              # 只处理前 100 个
 *   npm run update:place-address -- --cityId 123              # 只处理指定 cityId 的 Place
 *   npm run update:place-address -- --dry-run                # 预览模式，不实际更新
 *   npm run update:place-address -- --force                  # 强制更新已有 address 的 Place
 * 
 * 示例:
 *   npm run update:place-address -- --all
 *   npm run update:place-address -- --cityId 123 --limit 50
 *   npm run update:place-address -- --limit 50 --dry-run
 *   npm run update:place-address -- --force --cityId 123
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 构建包含中英文名称的地址
 */
function buildBilingualAddress(place: {
  nameCN: string;
  nameEN: string | null;
  cityNameCN: string | null;
  cityNameEN: string | null;
  cityName: string | null;
  lat: number | null;
  lng: number | null;
  metadata?: any;
}): string {
  const parts: string[] = [];

  // 1. 地点名称（中英文）
  if (place.nameCN && place.nameEN) {
    parts.push(`${place.nameCN} / ${place.nameEN}`);
  } else if (place.nameCN) {
    parts.push(place.nameCN);
  } else if (place.nameEN) {
    parts.push(place.nameEN);
  }

  // 2. 城市名称（中英文）
  if (place.cityNameCN || place.cityNameEN || place.cityName) {
    const cityParts: string[] = [];
    if (place.cityNameCN) cityParts.push(place.cityNameCN);
    if (place.cityNameEN && place.cityNameEN !== place.cityNameCN) {
      cityParts.push(place.cityNameEN);
    } else if (place.cityName && place.cityName !== place.cityNameCN) {
      cityParts.push(place.cityName);
    }
    
    if (cityParts.length > 0) {
      const cityStr = cityParts.length > 1 ? cityParts.join(' / ') : cityParts[0];
      parts.push(cityStr);
    }
  }

  // 3. 从 metadata 中提取更详细的地址信息
  if (place.metadata) {
    const metadata = place.metadata as any;
    const rawTags = metadata.rawTags || metadata;
    
    // 提取街道信息
    const street = rawTags['addr:street'] || rawTags['addr:street:en'];
    if (street && !parts.some(p => p.includes(street))) {
      parts.push(street);
    }
    
    // 提取区域信息
    const district = rawTags['addr:district'] || rawTags['addr:suburb'];
    if (district && !parts.some(p => p.includes(district))) {
      parts.push(district);
    }
  }

  // 4. 如果有坐标但没有详细地址，添加坐标信息
  if (parts.length <= 1 && place.lat && place.lng) {
    parts.push(`(${place.lat.toFixed(4)}, ${place.lng.toFixed(4)})`);
  }

  return parts.join(', ');
}

/**
 * 更新 Place 的 address 字段
 */
async function updatePlaceAddress() {
  console.log('🏠 开始更新 Place 表的 address 字段（包含中英文名称）...\n');

  // 解析命令行参数
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : 10000;
  const cityIdIndex = args.indexOf('--cityId');
  const cityId = cityIdIndex !== -1 ? parseInt(args[cityIdIndex + 1]) : null;
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const allFlag = args.includes('--all');

  if (dryRun) {
    console.log('⚠️  预览模式：不会实际更新数据库\n');
  }

  if (force) {
    console.log('⚠️  强制模式：将更新已有 address 的 Place\n');
  }

  if (cityId) {
    console.log(`📍 只处理 cityId = ${cityId} 的 Place\n`);
  }

  // 构建查询条件
  let whereCondition = Prisma.sql``;
  
  if (!force) {
    // 只处理 address 为空或需要更新的
    whereCondition = Prisma.sql`WHERE (p.address IS NULL OR p.address = '' OR p.address NOT LIKE '%/%')`;
  } else {
    // 强制模式：处理所有 Place
    whereCondition = Prisma.sql`WHERE 1=1`;
  }

  if (cityId) {
    whereCondition = Prisma.sql`${whereCondition} AND p."cityId" = ${cityId}`;
  }

  // 查询需要更新的 Place
  const placesToUpdate = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    cityId: number | null;
    lat: number | null;
    lng: number | null;
    metadata: any;
    cityName: string | null;
    cityNameCN: string | null;
    cityNameEN: string | null;
    currentAddress: string | null;
  }>>`
    SELECT 
      p.id,
      p."nameCN",
      p."nameEN",
      p."cityId",
      ST_Y(p.location::geometry) as lat,
      ST_X(p.location::geometry) as lng,
      p.metadata,
      p.address as "currentAddress",
      c.name as "cityName",
      c."nameCN" as "cityNameCN",
      c."nameEN" as "cityNameEN"
    FROM "Place" p
    LEFT JOIN "City" c ON p."cityId" = c.id
    ${whereCondition}
    ORDER BY p.id
    LIMIT ${allFlag ? 100000 : limit}
  `;

  console.log(`找到 ${placesToUpdate.length} 个需要更新 address 的 Place\n`);

  if (placesToUpdate.length === 0) {
    console.log('✅ 没有需要处理的 Place\n');
    return { updated: 0, errors: 0, skipped: 0 };
  }

  // 批量处理
  const BATCH_SIZE = 100;
  let updated = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < placesToUpdate.length; i += BATCH_SIZE) {
    const batch = placesToUpdate.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(placesToUpdate.length / BATCH_SIZE);

    console.log(`处理批次 ${batchNumber}/${totalBatches} (${batch.length} 个地点)...`);

    for (const place of batch) {
      try {
        // 构建包含中英文名称的地址
        const newAddress = buildBilingualAddress(place);

        if (!newAddress || newAddress.trim() === '') {
          console.log(`  ⏭️  Place ${place.id}: 无法构建地址，跳过`);
          skipped++;
          continue;
        }

        // 如果新地址和当前地址相同，跳过
        if (!force && place.currentAddress && place.currentAddress.trim() === newAddress.trim()) {
          console.log(`  ⏭️  Place ${place.id}: 地址未变化，跳过`);
          skipped++;
          continue;
        }

        if (dryRun) {
          console.log(`  📝 Place ${place.id}: "${place.currentAddress || '(空)'}" -> "${newAddress}" (预览)`);
          updated++;
        } else {
          // 更新数据库
          await prisma.$executeRaw`
            UPDATE "Place"
            SET address = ${newAddress},
                "updatedAt" = NOW()
            WHERE id = ${place.id}
          `;
          console.log(`  ✅ Place ${place.id}: "${place.nameCN}" -> "${newAddress}"`);
          updated++;
        }

        if ((updated + errors + skipped) % 100 === 0) {
          console.log(`  进度: ${updated + errors + skipped}/${placesToUpdate.length} (已更新: ${updated}, 跳过: ${skipped})`);
        }
      } catch (error: any) {
        errors++;
        console.error(`  ❌ Place ${place.id} (${place.nameCN}) - 失败: ${error.message}`);
      }
    }

    // 批次间稍作延迟
    if (i + BATCH_SIZE < placesToUpdate.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log('\n✅ 更新完成！');
  console.log(`  - 成功: ${updated}`);
  console.log(`  - 跳过: ${skipped}`);
  console.log(`  - 失败: ${errors}`);
  console.log(`  - 总计: ${placesToUpdate.length}\n`);

  return { updated, errors, skipped };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('使用方法:');
    console.log('  npm run update:place-address -- --all              # 处理所有符合条件的 Place');
    console.log('  npm run update:place-address -- --limit 100          # 只处理前 100 个');
    console.log('  npm run update:place-address -- --cityId 123         # 只处理指定 cityId 的 Place');
    console.log('  npm run update:place-address -- --dry-run             # 预览模式，不实际更新');
    console.log('  npm run update:place-address -- --force              # 强制更新已有 address 的 Place');
    console.log('\n示例:');
    console.log('  npm run update:place-address -- --all');
    console.log('  npm run update:place-address -- --cityId 123 --limit 50');
    console.log('  npm run update:place-address -- --limit 50 --dry-run');
    console.log('  npm run update:place-address -- --force --cityId 123');
    process.exit(0);
  }

  console.log('🚀 开始更新 Place 表的 address 字段...\n');
  console.log('='.repeat(60) + '\n');

  try {
    await updatePlaceAddress();
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
