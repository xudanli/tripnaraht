#!/usr/bin/env tsx
/**
 * 清洗冰岛 POI GeoJSON 数据
 * 
 * 清洗步骤：
 * 1. 删除重复的经纬度（保留第一个）
 * 2. 验证坐标范围（冰岛范围）
 * 3. 处理空名称
 * 4. 验证数据格式
 * 5. 生成清洗报告
 * 
 * 使用方法：
 *   tsx scripts/clean-iceland-poi-geojson.ts
 *   tsx scripts/clean-iceland-poi-geojson.ts --input=data/iceland_poi.json.geojson --output=data/iceland_poi_cleaned.json.geojson
 *   tsx scripts/clean-iceland-poi-geojson.ts --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    fid?: number;
    nafnFitju?: string | null;
    [key: string]: any;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

interface GeoJSON {
  type: 'FeatureCollection';
  name?: string;
  crs?: any;
  features: GeoJSONFeature[];
}

interface CleaningStats {
  total: number;
  valid: number;
  removed: {
    duplicateCoordinates: number;
    invalidCoordinates: number;
    invalidFormat: number;
  };
  fixed: {
    nullNames: number;
  };
}

// 冰岛大致范围
const ICELAND_BOUNDS = {
  minLng: -25.0,
  maxLng: -13.0,
  minLat: 63.0,
  maxLat: 67.0,
};

function parseArgs(): {
  input: string;
  output: string;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  const options = {
    input: 'data/iceland_poi.json.geojson',
    output: 'data/iceland_poi_cleaned.json.geojson',
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' && args[i + 1]) {
      options.input = args[i + 1];
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

/**
 * 验证坐标是否在冰岛范围内
 */
function isValidIcelandCoordinate(lng: number, lat: number): boolean {
  return (
    lng >= ICELAND_BOUNDS.minLng &&
    lng <= ICELAND_BOUNDS.maxLng &&
    lat >= ICELAND_BOUNDS.minLat &&
    lat <= ICELAND_BOUNDS.maxLat
  );
}

/**
 * 验证 feature 格式
 */
function isValidFeature(feature: any): boolean {
  return (
    feature &&
    feature.type === 'Feature' &&
    feature.geometry &&
    feature.geometry.type === 'Point' &&
    Array.isArray(feature.geometry.coordinates) &&
    feature.geometry.coordinates.length === 2 &&
    typeof feature.geometry.coordinates[0] === 'number' &&
    typeof feature.geometry.coordinates[1] === 'number' &&
    !isNaN(feature.geometry.coordinates[0]) &&
    !isNaN(feature.geometry.coordinates[1])
  );
}

/**
 * 生成坐标键（用于去重）
 */
function getCoordinateKey(lng: number, lat: number, precision: number = 6): string {
  return `${lng.toFixed(precision)},${lat.toFixed(precision)}`;
}

/**
 * 清洗 GeoJSON 数据
 */
function cleanGeoJSON(geojson: GeoJSON): {
  cleaned: GeoJSON;
  stats: CleaningStats;
} {
  const stats: CleaningStats = {
    total: geojson.features.length,
    valid: 0,
    removed: {
      duplicateCoordinates: 0,
      invalidCoordinates: 0,
      invalidFormat: 0,
    },
    fixed: {
      nullNames: 0,
    },
  };

  const cleanedFeatures: GeoJSONFeature[] = [];
  const seenCoordinates = new Set<string>();
  const coordinateMap = new Map<string, GeoJSONFeature>(); // 用于记录第一个出现的坐标

  for (const feature of geojson.features) {
    // 1. 验证格式
    if (!isValidFeature(feature)) {
      stats.removed.invalidFormat++;
      continue;
    }

    const [lng, lat] = feature.geometry.coordinates;

    // 2. 验证坐标范围
    if (!isValidIcelandCoordinate(lng, lat)) {
      stats.removed.invalidCoordinates++;
      continue;
    }

    // 3. 检查重复坐标（精确匹配）
    const coordKey = getCoordinateKey(lng, lat, 10); // 使用10位小数精度
    if (seenCoordinates.has(coordKey)) {
      stats.removed.duplicateCoordinates++;
      continue; // 跳过重复的坐标
    }
    seenCoordinates.add(coordKey);

    // 4. 处理空名称（生成默认名称）
    let cleanedFeature = { ...feature };
    if (!cleanedFeature.properties.nafnFitju || cleanedFeature.properties.nafnFitju.trim() === '') {
      const type = cleanedFeature.properties.gerdGosgig || 'unknown';
      const fid = cleanedFeature.properties.fid || cleanedFeatures.length + 1;
      cleanedFeature.properties.nafnFitju = `未命名地点-${type}-${fid}`;
      stats.fixed.nullNames++;
    }

    cleanedFeatures.push(cleanedFeature);
    stats.valid++;
  }

  const cleaned: GeoJSON = {
    type: 'FeatureCollection',
    name: geojson.name,
    crs: geojson.crs,
    features: cleanedFeatures,
  };

  return { cleaned, stats };
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('冰岛 POI GeoJSON 数据清洗脚本');
  console.log('='.repeat(60));
  console.log(`输入文件: ${options.input}`);
  console.log(`输出文件: ${options.output}`);
  console.log(`模式: ${options.dryRun ? '🔍 预览模式（不会保存）' : '✅ 清洗模式'}`);
  console.log('');

  try {
    // 1. 读取 GeoJSON 文件
    const inputPath = path.resolve(process.cwd(), options.input);
    if (!fs.existsSync(inputPath)) {
      console.error(`❌ 文件不存在: ${inputPath}`);
      process.exit(1);
    }

    console.log('📖 读取 GeoJSON 文件...');
    const fileContent = fs.readFileSync(inputPath, 'utf-8');
    const geojson: GeoJSON = JSON.parse(fileContent);

    if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
      console.error('❌ 无效的 GeoJSON 格式：必须是 FeatureCollection');
      process.exit(1);
    }

    console.log(`✓ 读取成功，共 ${geojson.features.length} 个 features\n`);

    // 2. 清洗数据
    console.log('🧹 开始清洗数据...');
    const { cleaned, stats } = cleanGeoJSON(geojson);

    // 3. 显示统计信息
    console.log('\n' + '='.repeat(60));
    console.log('清洗结果统计');
    console.log('='.repeat(60));
    console.log(`总计: ${stats.total}`);
    console.log(`✅ 有效: ${stats.valid}`);
    console.log(`\n删除统计:`);
    console.log(`  - 格式无效: ${stats.removed.invalidFormat}`);
    console.log(`  - 坐标超出范围: ${stats.removed.invalidCoordinates}`);
    console.log(`  - 重复坐标: ${stats.removed.duplicateCoordinates}`);
    console.log(`\n修复统计:`);
    console.log(`  - 空名称修复: ${stats.fixed.nullNames}`);
    console.log(`\n保留率: ${((stats.valid / stats.total) * 100).toFixed(2)}%`);

    // 4. 保存清洗后的数据
    if (!options.dryRun) {
      const outputPath = path.resolve(process.cwd(), options.output);
      const outputDir = path.dirname(outputPath);
      
      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      console.log(`\n💾 保存清洗后的数据到: ${outputPath}`);
      fs.writeFileSync(
        outputPath,
        JSON.stringify(cleaned, null, 2),
        'utf-8'
      );
      console.log('✅ 保存成功！');
    } else {
      console.log('\n🔍 预览模式：未保存文件');
    }

    // 5. 显示一些示例数据
    if (cleaned.features.length > 0) {
      console.log('\n📋 清洗后的数据示例（前5条）:');
      cleaned.features.slice(0, 5).forEach((f, i) => {
        const [lng, lat] = f.geometry.coordinates;
        const name = f.properties.nafnFitju || 'N/A';
        console.log(`  ${i + 1}. ${name} (${lng.toFixed(6)}, ${lat.toFixed(6)})`);
      });
    }

    console.log('\n✅ 清洗完成！');
  } catch (error: any) {
    console.error('\n❌ 清洗失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
