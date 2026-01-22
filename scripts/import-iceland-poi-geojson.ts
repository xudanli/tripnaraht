#!/usr/bin/env tsx
/**
 * 从 GeoJSON 文件导入冰岛 POI 数据到 Place 表
 * 
 * 使用方法：
 *   tsx scripts/import-iceland-poi-geojson.ts
 *   tsx scripts/import-iceland-poi-geojson.ts --file=data/iceland_poi.json.geojson
 *   tsx scripts/import-iceland-poi-geojson.ts --dry-run
 *   tsx scripts/import-iceland-poi-geojson.ts --batch=100
 *   tsx scripts/import-iceland-poi-geojson.ts --skip-existing
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const prisma = new PrismaClient();

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    fid?: number;
    nafnFitju?: string | null;
    gerdGosgig?: string;
    fitjuflokkar?: number;
    jardsogulegurAldur?: string;
    arJardmyndunar?: string | null;
    aldur?: string | null;
    heimild?: string;
    dagsHeimildar?: string | null;
    gagnaeigandi?: string;
    dagsInnsetningar?: string;
    nafnInnsetningar?: string;
    dagsLeidrettingar?: string;
    nakvaemniXY?: number;
    vinnsluferliFitju?: number;
    [key: string]: any;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

interface GeoJSON {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

interface ImportOptions {
  file: string;
  dryRun: boolean;
  batchSize: number;
  skipExisting: boolean;
  deleteDuplicates?: boolean;
  cityId?: number;
}

function parseArgs(): ImportOptions {
  const args = process.argv.slice(2);
  const options: ImportOptions = {
    file: 'data/iceland_poi_cleaned.json.geojson', // 默认使用清洗后的文件
    dryRun: false,
    batchSize: 50,
    skipExisting: true,
    deleteDuplicates: true, // 默认删除相同经纬度的数据
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && args[i + 1]) {
      options.file = args[i + 1];
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--batch' && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--skip-existing') {
      options.skipExisting = true;
    } else if (arg === '--no-skip-existing') {
      options.skipExisting = false;
    } else if (arg === '--delete-duplicates') {
      options.deleteDuplicates = true;
    } else if (arg === '--no-delete-duplicates') {
      options.deleteDuplicates = false;
    } else if (arg === '--city-id' && args[i + 1]) {
      options.cityId = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

/**
 * 提取地点名称
 */
function extractPlaceName(feature: GeoJSONFeature): { nameCN: string; nameEN: string | null } {
  const name = feature.properties.nafnFitju;
  
  if (name && name.trim()) {
    return {
      nameCN: name.trim(),
      nameEN: name.trim(), // 冰岛语名称也作为英文名称
    };
  }

  // 如果没有名称，根据类型生成默认名称
  const type = feature.properties.gerdGosgig;
  const typeMap: Record<string, string> = {
    'gig03': '火山口',
    'gig04': '熔岩原',
  };
  
  const defaultName = typeMap[type || ''] || '未命名地点';
  return {
    nameCN: `${defaultName} (${feature.properties.fid || '未知'})`,
    nameEN: null,
  };
}

/**
 * 构建 metadata
 */
function buildMetadata(feature: GeoJSONFeature): any {
  return {
    source: 'iceland_nsi',
    sourceId: feature.properties.fid?.toString(),
    fitjuflokkar: feature.properties.fitjuflokkar,
    gerdGosgig: feature.properties.gerdGosgig,
    jardsogulegurAldur: feature.properties.jardsogulegurAldur,
    arJardmyndunar: feature.properties.arJardmyndunar,
    aldur: feature.properties.aldur,
    heimild: feature.properties.heimild,
    dagsHeimildar: feature.properties.dagsHeimildar,
    gagnaeigandi: feature.properties.gagnaeigandi,
    dagsInnsetningar: feature.properties.dagsInnsetningar,
    nafnInnsetningar: feature.properties.nafnInnsetningar,
    dagsLeidrettingar: feature.properties.dagsLeidrettingar,
    nakvaemniXY: feature.properties.nakvaemniXY,
    vinnsluferliFitju: feature.properties.vinnsluferliFitju,
    countryCode: 'IS',
    mainCategory: 'nature',
    subCategory: 'volcano',
    rawProperties: feature.properties,
  };
}

/**
 * 检查地点是否已存在（通过坐标和名称）
 */
async function checkExistingPlace(
  lng: number,
  lat: number,
  nameCN: string
): Promise<number | null> {
  const existing = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM "Place"
    WHERE "nameCN" = ${nameCN}
      AND location IS NOT NULL
      AND ST_DWithin(
        location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        50
      )
    LIMIT 1
  `;

  return existing.length > 0 ? existing[0].id : null;
}

/**
 * 删除具有相同经纬度的所有 Place 记录
 * 使用精确匹配（通过比较坐标值）
 */
async function deletePlacesByExactLocation(
  lng: number,
  lat: number
): Promise<number> {
  // 先查询要删除的记录ID
  const toDelete = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM "Place"
    WHERE location IS NOT NULL
      AND ST_X(location::geometry) = ${lng}
      AND ST_Y(location::geometry) = ${lat}
  `;

  if (toDelete.length === 0) {
    return 0;
  }

  const ids = toDelete.map(r => r.id);
  
  // 批量删除
  const result = await prisma.place.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });

  return result.count;
}

/**
 * 批量导入地点
 */
async function importPlaces(
  features: GeoJSONFeature[],
  options: ImportOptions
): Promise<{
  total: number;
  created: number;
  skipped: number;
  errors: number;
  deleted: number;
  results: Array<{
    fid?: number;
    name: string;
    status: 'created' | 'skipped' | 'error' | 'deleted';
    error?: string;
  }>;
}> {
  const results: Array<{
    fid?: number;
    name: string;
    status: 'created' | 'skipped' | 'error' | 'deleted';
    error?: string;
  }> = [];

  let created = 0;
  let skipped = 0;
  let errors = 0;
  let deleted = 0;

  // 按批次处理
  for (let i = 0; i < features.length; i += options.batchSize) {
    const batch = features.slice(i, i + options.batchSize);
    console.log(`\n处理批次 ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(features.length / options.batchSize)} (${batch.length} 条)`);

    for (const feature of batch) {
      try {
        // 提取坐标
        const [lng, lat] = feature.geometry.coordinates;
        if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
          errors++;
          results.push({
            fid: feature.properties.fid,
            name: feature.properties.nafnFitju || 'Unknown',
            status: 'error',
            error: '无效的坐标',
          });
          continue;
        }

        // 提取名称
        const { nameCN, nameEN } = extractPlaceName(feature);

        // 删除相同经纬度的重复数据
        if (options.deleteDuplicates && !options.dryRun) {
          const deletedCount = await deletePlacesByExactLocation(lng, lat);
          if (deletedCount > 0) {
            deleted += deletedCount;
            console.log(`  🗑️  删除 ${deletedCount} 条相同经纬度的记录 (${lng}, ${lat})`);
          }
        }

        // 检查是否已存在（如果启用了跳过已存在）
        if (options.skipExisting && !options.deleteDuplicates) {
          const existingId = await checkExistingPlace(lng, lat, nameCN);
          if (existingId) {
            skipped++;
            results.push({
              fid: feature.properties.fid,
              name: nameCN,
              status: 'skipped',
            });
            continue;
          }
        }

        if (options.dryRun) {
          created++;
          results.push({
            fid: feature.properties.fid,
            name: nameCN,
            status: 'created',
          });
          continue;
        }

        // 构建 metadata
        const metadata = buildMetadata(feature);

        // 创建 Place 记录
        const place = await prisma.place.create({
          data: {
            uuid: randomUUID(),
            nameCN,
            nameEN,
            category: 'ATTRACTION',
            cityId: options.cityId || null,
            metadata: metadata as any,
            updatedAt: new Date(),
          } as any,
        });

        // 更新地理位置
        await prisma.$executeRaw`
          UPDATE "Place"
          SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          WHERE id = ${place.id}
        `;

        created++;
        results.push({
          fid: feature.properties.fid,
          name: nameCN,
          status: 'created',
        });
      } catch (error: any) {
        errors++;
        results.push({
          fid: feature.properties.fid,
          name: feature.properties.nafnFitju || 'Unknown',
          status: 'error',
          error: error.message || String(error),
        });
        console.error(`  ❌ 导入失败 (fid: ${feature.properties.fid}):`, error.message);
      }
    }

    // 显示进度
    const processed = Math.min(i + options.batchSize, features.length);
    console.log(`  进度: ${processed}/${features.length} (${((processed / features.length) * 100).toFixed(1)}%)`);
  }

  return {
    total: features.length,
    created,
    skipped,
    errors,
    deleted,
    results,
  };
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('冰岛 POI GeoJSON 导入脚本');
  console.log('='.repeat(60));
  console.log(`文件: ${options.file}`);
  console.log(`模式: ${options.dryRun ? '🔍 预览模式（不会实际导入）' : '✅ 导入模式'}`);
  console.log(`批次大小: ${options.batchSize}`);
  console.log(`删除相同经纬度: ${options.deleteDuplicates ? '是' : '否'}`);
  console.log(`跳过已存在: ${options.skipExisting && !options.deleteDuplicates ? '是' : '否'}`);
  if (options.cityId) {
    console.log(`城市 ID: ${options.cityId}`);
  }
  console.log('');

  try {
    // 1. 读取 GeoJSON 文件
    const filePath = path.resolve(process.cwd(), options.file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 文件不存在: ${filePath}`);
      process.exit(1);
    }

    console.log('📖 读取 GeoJSON 文件...');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const geojson: GeoJSON = JSON.parse(fileContent);

    if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
      console.error('❌ 无效的 GeoJSON 格式：必须是 FeatureCollection');
      process.exit(1);
    }

    console.log(`✓ 读取成功，共 ${geojson.features.length} 个 features\n`);

    // 2. 验证数据
    console.log('🔍 验证数据...');
    const validFeatures = geojson.features.filter(f => {
      return (
        f.geometry &&
        f.geometry.type === 'Point' &&
        Array.isArray(f.geometry.coordinates) &&
        f.geometry.coordinates.length === 2 &&
        !isNaN(f.geometry.coordinates[0]) &&
        !isNaN(f.geometry.coordinates[1])
      );
    });

    const invalidCount = geojson.features.length - validFeatures.length;
    if (invalidCount > 0) {
      console.log(`⚠️  发现 ${invalidCount} 个无效的 features（已跳过）`);
    }
    console.log(`✓ 有效 features: ${validFeatures.length}\n`);

    // 3. 导入数据
    console.log('📥 开始导入...');
    const result = await importPlaces(validFeatures, options);

    // 4. 显示结果
    console.log('\n' + '='.repeat(60));
    console.log('导入结果');
    console.log('='.repeat(60));
    console.log(`总计: ${result.total}`);
    console.log(`✅ 创建: ${result.created}`);
    console.log(`🗑️  删除重复: ${result.deleted}`);
    console.log(`⏭️  跳过: ${result.skipped}`);
    console.log(`❌ 错误: ${result.errors}`);

    if (result.errors > 0) {
      console.log('\n错误详情:');
      result.results
        .filter(r => r.status === 'error')
        .slice(0, 10)
        .forEach(r => {
          console.log(`  - ${r.name} (fid: ${r.fid}): ${r.error}`);
        });
      if (result.errors > 10) {
        console.log(`  ... 还有 ${result.errors - 10} 个错误`);
      }
    }

    console.log('\n✅ 导入完成！');
  } catch (error: any) {
    console.error('\n❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
