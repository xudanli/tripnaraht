#!/usr/bin/env ts-node
/**
 * 从 Readiness Pack 导入派生的 POI
 * 
 * 功能：
 * 1. 从 pack 规则和危险提示中提取的 POI 导入到 poi_canonical 表
 * 2. 支持从 JSON 文件导入
 * 
 * 使用方法：
 *   ts-node scripts/import-pack-derived-pois.ts <json-file-path>
 *   例如: ts-node scripts/import-pack-derived-pois.ts data/pack-derived-pois/pack.sj.svalbard.pois.json
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

interface DerivedPOI {
  poiId: string;
  names: {
    en: string;
    zh: string;
  };
  canonicalType: string;
  derivedFrom: {
    ruleId?: string;
    hazardType?: string;
    context: string;
  };
  riskLevel: string;
  actionItem: {
    en: string;
    zh: string;
  };
}

interface PackDerivedPOIs {
  sourcePackId: string;
  destinationName: string;
  derivedPOIs: DerivedPOI[];
}

async function importPackDerivedPOIs(filePath: string) {
  console.log(`\n📦 导入 Pack 派生 POI: ${filePath}\n`);

  if (!existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    return false;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data: PackDerivedPOIs = JSON.parse(content);

    // 1. 获取 source pack 的地理位置信息
    const pack = await prisma.readinessPack.findUnique({
      where: { packId: data.sourcePackId },
    });

    if (!pack) {
      console.error(`❌ Pack 不存在: ${data.sourcePackId}`);
      return false;
    }

    const packData = pack.packData as any;
    const geo = packData?.geo || {};
    const baseLat = geo.lat || pack.latitude || 0;
    const baseLng = geo.lng || pack.longitude || 0;
    const countryCode = geo.countryCode || pack.countryCode || '';
    const region = geo.region || pack.region || '';

    console.log(`📍 Pack 地理位置: (${baseLat}, ${baseLng}), ${countryCode}, ${region}\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    // 2. 导入每个派生的 POI
    for (const poi of data.derivedPOIs) {
      try {
        // 检查是否已存在
        const existing = await prisma.poi_canonical.findFirst({
          where: {
            source: 'PACK_DERIVED',
            source_key: poi.poiId,
          },
        });

        if (existing) {
          console.log(`⏭️  跳过已存在的 POI: ${poi.poiId} - ${poi.names.en}`);
          skipped++;
          continue;
        }

        // 创建 POI 记录
        await prisma.poi_canonical.create({
          data: {
            poi_id: randomUUID(),
            source: 'PACK_DERIVED',
            source_key: poi.poiId,
            name_default: poi.names.en,
            name_i18n: {
              en: poi.names.en,
              zh: poi.names.zh,
            },
            category: poi.canonicalType,
            lat: baseLat, // 使用 pack 的坐标作为默认值
            lng: baseLng,
            region_key: region ? region.toLowerCase().replace(/\s+/g, '_') : undefined,
            region_name: region,
            tags_slim: {
              sourcePackId: data.sourcePackId,
              destinationName: data.destinationName,
              derivedFrom: poi.derivedFrom,
              riskLevel: poi.riskLevel,
              actionItem: poi.actionItem,
            },
            fetched_at: new Date(),
          },
        });

        console.log(`✅ 创建 POI: ${poi.poiId} - ${poi.names.en}`);
        created++;
      } catch (error: any) {
        console.error(`❌ 导入 POI ${poi.poiId} 失败: ${error.message}`);
        errors++;
      }
    }

    console.log(`\n📊 导入完成:`);
    console.log(`  ✅ 创建: ${created}`);
    console.log(`  ⏭️  跳过: ${skipped}`);
    console.log(`  ❌ 错误: ${errors}`);
    console.log(`  📦 总计: ${data.derivedPOIs.length}\n`);

    return true;
  } catch (error: any) {
    console.error(`❌ 导入失败: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
使用方法:
  ts-node scripts/import-pack-derived-pois.ts <json-file-path>

示例:
  ts-node scripts/import-pack-derived-pois.ts data/pack-derived-pois/pack.sj.svalbard.pois.json
    `);
    process.exit(1);
  }

  const filePath = args[0];
  await importPackDerivedPOIs(filePath);
}

main()
  .catch((error) => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
