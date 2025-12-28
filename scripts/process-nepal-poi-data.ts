#!/usr/bin/env ts-node
/**
 * 处理尼泊尔 POI 数据
 * 
 * 功能：
 * 1. 根据已有数据反推 address（从 metadata.rawTags 提取）
 * 2. 处理 nameEN 为 null 的数据（从 metadata.rawTags 中的 name:en 获取，或使用 nameCN）
 * 
 * 使用方法:
 *   npm run process:nepal-poi -- --address      # 只处理 address
 *   npm run process:nepal-poi -- --nameEN       # 只处理 nameEN
 *   npm run process:nepal-poi -- --all          # 处理 address 和 nameEN
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 从 metadata.rawTags 提取 address
 */
function extractAddressFromMetadata(metadata: any): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const rawTags = metadata.rawTags || metadata;
  
  // 优先级：addr:full > address > addr:street + addr:city > addr:city
  if (rawTags['addr:full']) {
    return rawTags['addr:full'];
  }
  if (rawTags.address) {
    return rawTags.address;
  }
  
  // 组合街道和城市
  const street = rawTags['addr:street'];
  const city = rawTags['addr:city'];
  if (street && city) {
    return `${street}, ${city}`;
  }
  if (street) {
    return street;
  }
  if (city) {
    return city;
  }

  // 尝试其他可能的地址字段
  if (rawTags['addr:street:en']) {
    return rawTags['addr:street:en'];
  }
  if (rawTags['addr:city:en']) {
    return rawTags['addr:city:en'];
  }

  // 尝试组合更多地址字段
  const parts: string[] = [];
  if (rawTags['addr:housenumber']) parts.push(rawTags['addr:housenumber']);
  if (rawTags['addr:street']) parts.push(rawTags['addr:street']);
  if (rawTags['addr:city']) parts.push(rawTags['addr:city']);
  if (rawTags['addr:district']) parts.push(rawTags['addr:district']);
  if (rawTags['addr:state']) parts.push(rawTags['addr:state']);
  if (rawTags['addr:postcode']) parts.push(rawTags['addr:postcode']);
  
  if (parts.length > 0) {
    return parts.join(', ');
  }

  return null;
}

/**
 * 从 metadata.rawTags 提取 nameEN
 */
function extractNameENFromMetadata(metadata: any, nameCN: string): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const rawTags = metadata.rawTags || metadata;
  
  // 优先级：name:en > name（如果name看起来是英文且与nameCN不同）> nameCN（如果nameCN看起来是英文）
  if (rawTags['name:en']) {
    return rawTags['name:en'];
  }
  
  // 如果 name 字段存在且看起来是英文（包含英文字母），使用它
  if (rawTags.name) {
    const name = rawTags.name.trim();
    // 判断是否主要是英文：包含英文字母，且英文字母占比超过50%
    const englishChars = (name.match(/[a-zA-Z]/g) || []).length;
    const totalChars = name.replace(/\s/g, '').length;
    const englishRatio = totalChars > 0 ? englishChars / totalChars : 0;
    
    // 如果英文字符占比超过50%，且与nameCN不同，使用name
    if (englishRatio > 0.5 && name !== nameCN && name.length > 0) {
      return name;
    }
  }
  
  // 如果 nameCN 看起来是英文（主要是英文字母），也可以使用
  if (nameCN) {
    const nameCNTrimmed = nameCN.trim();
    const englishChars = (nameCNTrimmed.match(/[a-zA-Z]/g) || []).length;
    const totalChars = nameCNTrimmed.replace(/\s/g, '').length;
    const englishRatio = totalChars > 0 ? englishChars / totalChars : 0;
    
    // 如果英文字符占比超过70%，认为是英文名
    if (englishRatio > 0.7 && nameCNTrimmed.length > 0) {
      return nameCNTrimmed;
    }
  }

  return null;
}

/**
 * 处理 address 字段
 */
async function processAddress() {
  console.log('🏠 开始处理尼泊尔 POI 的 address 字段...\n');

  // 查找尼泊尔 POI 中 address 为空但 metadata 中有地址信息的
  const nepalPoisWithoutAddress = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    address: string | null;
    metadata: any;
  }>>`
    SELECT 
      id,
      "nameCN",
      address,
      metadata
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
      AND (address IS NULL OR address = '')
      AND (
        metadata->'rawTags'->>'addr:full' IS NOT NULL
        OR metadata->'rawTags'->>'address' IS NOT NULL
        OR metadata->'rawTags'->>'addr:street' IS NOT NULL
        OR metadata->'rawTags'->>'addr:city' IS NOT NULL
        OR metadata->'rawTags'->>'addr:street:en' IS NOT NULL
        OR metadata->'rawTags'->>'addr:city:en' IS NOT NULL
      )
    ORDER BY id
  `;

  console.log(`找到 ${nepalPoisWithoutAddress.length} 个需要处理 address 的尼泊尔 POI\n`);

  if (nepalPoisWithoutAddress.length === 0) {
    console.log('✅ 没有需要处理 address 的尼泊尔 POI\n');
    return { updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;

  // 批量处理
  const BATCH_SIZE = 100;
  for (let i = 0; i < nepalPoisWithoutAddress.length; i += BATCH_SIZE) {
    const batch = nepalPoisWithoutAddress.slice(i, i + BATCH_SIZE);
    
    for (const poi of batch) {
      try {
        const extractedAddress = extractAddressFromMetadata(poi.metadata);
        
        if (extractedAddress) {
          await prisma.$executeRaw`
            UPDATE "Place"
            SET address = ${extractedAddress},
                "updatedAt" = NOW()
            WHERE id = ${poi.id}
          `;
          updated++;
        }
      } catch (error: any) {
        console.error(`  ❌ 更新 POI ${poi.id} (${poi.nameCN}) 失败: ${error.message}`);
        errors++;
      }
    }

    // 显示进度
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= nepalPoisWithoutAddress.length) {
      console.log(`  进度: ${Math.min(i + BATCH_SIZE, nepalPoisWithoutAddress.length)}/${nepalPoisWithoutAddress.length} (已更新: ${updated})`);
    }
  }

  console.log(`\n✅ address 处理完成: ${updated} 个已更新, ❌ 错误: ${errors} 个\n`);
  return { updated, errors };
}

/**
 * 处理 nameEN 字段
 */
async function processNameEN() {
  console.log('🌐 开始处理尼泊尔 POI 的 nameEN 字段...\n');

  // 查找尼泊尔 POI 中 nameEN 为 null 的
  const nepalPoisWithoutNameEN = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    metadata: any;
  }>>`
    SELECT 
      id,
      "nameCN",
      "nameEN",
      metadata
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
      AND ("nameEN" IS NULL OR "nameEN" = '')
    ORDER BY id
  `;

  console.log(`找到 ${nepalPoisWithoutNameEN.length} 个需要处理 nameEN 的尼泊尔 POI\n`);

  if (nepalPoisWithoutNameEN.length === 0) {
    console.log('✅ 没有需要处理 nameEN 的尼泊尔 POI\n');
    return { updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;
  let skipped = 0;

  // 批量处理
  const BATCH_SIZE = 100;
  for (let i = 0; i < nepalPoisWithoutNameEN.length; i += BATCH_SIZE) {
    const batch = nepalPoisWithoutNameEN.slice(i, i + BATCH_SIZE);
    
    for (const poi of batch) {
      try {
        const extractedNameEN = extractNameENFromMetadata(poi.metadata, poi.nameCN);
        
        if (extractedNameEN) {
          await prisma.$executeRaw`
            UPDATE "Place"
            SET "nameEN" = ${extractedNameEN},
                "updatedAt" = NOW()
            WHERE id = ${poi.id}
          `;
          updated++;
        } else {
          skipped++;
        }
      } catch (error: any) {
        console.error(`  ❌ 更新 POI ${poi.id} (${poi.nameCN}) 失败: ${error.message}`);
        errors++;
      }
    }

    // 显示进度
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= nepalPoisWithoutNameEN.length) {
      console.log(`  进度: ${Math.min(i + BATCH_SIZE, nepalPoisWithoutNameEN.length)}/${nepalPoisWithoutNameEN.length} (已更新: ${updated}, 跳过: ${skipped})`);
    }
  }

  console.log(`\n✅ nameEN 处理完成: ${updated} 个已更新, ⏭️  跳过: ${skipped} 个, ❌ 错误: ${errors} 个\n`);
  return { updated, errors, skipped };
}

/**
 * 显示统计信息
 */
async function showStatistics() {
  console.log('📊 尼泊尔 POI 数据统计:\n');

  // 总体统计
  const total = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
  `;

  // address 统计
  const addressStats = await prisma.$queryRaw<Array<{
    has_address: bigint;
    no_address: bigint;
  }>>`
    SELECT 
      COUNT(*) FILTER (WHERE address IS NOT NULL AND address != '') as has_address,
      COUNT(*) FILTER (WHERE address IS NULL OR address = '') as no_address
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
  `;

  // nameEN 统计
  const nameENStats = await prisma.$queryRaw<Array<{
    has_nameEN: bigint;
    no_nameEN: bigint;
  }>>`
    SELECT 
      COUNT(*) FILTER (WHERE "nameEN" IS NOT NULL AND "nameEN" != '') as has_nameEN,
      COUNT(*) FILTER (WHERE "nameEN" IS NULL OR "nameEN" = '') as no_nameEN
    FROM "Place"
    WHERE metadata->>'regionKey' LIKE 'NP_%'
  `;

  const totalCount = Number(total[0].count);
  const hasAddress = Number(addressStats[0].has_address);
  const noAddress = Number(addressStats[0].no_address);
  const hasNameEN = Number(nameENStats[0].has_nameEN);
  const noNameEN = Number(nameENStats[0].no_nameEN);

  console.log(`总 POI 数量: ${totalCount.toLocaleString()}`);
  console.log(`\naddress 字段:`);
  console.log(`  ✅ 有 address: ${hasAddress.toLocaleString()} (${((hasAddress / totalCount) * 100).toFixed(1)}%)`);
  console.log(`  ❌ 无 address: ${noAddress.toLocaleString()} (${((noAddress / totalCount) * 100).toFixed(1)}%)`);
  console.log(`\nnameEN 字段:`);
  console.log(`  ✅ 有 nameEN: ${hasNameEN.toLocaleString()} (${((hasNameEN / totalCount) * 100).toFixed(1)}%)`);
  console.log(`  ❌ 无 nameEN: ${noNameEN.toLocaleString()} (${((noNameEN / totalCount) * 100).toFixed(1)}%)`);
  console.log('');
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const shouldProcessAddress = args.includes('--address') || args.includes('--all');
  const shouldProcessNameEN = args.includes('--nameEN') || args.includes('--all');
  const showStats = args.includes('--stats') || args.includes('--all');

  if (!shouldProcessAddress && !shouldProcessNameEN && !showStats) {
    console.log('❌ 请指定要执行的操作:\n');
    console.log('使用方法:');
    console.log('  npm run process:nepal-poi -- --address      # 只处理 address');
    console.log('  npm run process:nepal-poi -- --nameEN       # 只处理 nameEN');
    console.log('  npm run process:nepal-poi -- --stats         # 只显示统计信息');
    console.log('  npm run process:nepal-poi -- --all          # 处理 address 和 nameEN，并显示统计');
    console.log('\n示例:');
    console.log('  npm run process:nepal-poi -- --all');
    process.exit(1);
  }

  console.log('🇳🇵 开始处理尼泊尔 POI 数据...\n');
  console.log('='.repeat(60) + '\n');

  try {
    // 显示处理前的统计
    if (showStats) {
      console.log('📊 处理前统计:');
      await showStatistics();
      console.log('='.repeat(60) + '\n');
    }

    if (shouldProcessAddress) {
      await processAddress();
    }

    if (shouldProcessNameEN) {
      await processNameEN();
    }

    // 显示处理后的统计
    if (showStats) {
      console.log('='.repeat(60) + '\n');
      console.log('📊 处理后统计:');
      await showStatistics();
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

