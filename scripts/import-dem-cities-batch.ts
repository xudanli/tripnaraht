#!/usr/bin/env ts-node

/**
 * 批量导入所有城市的 DEM 数据
 * 
 * 使用方法：
 *   npm run import:dem:cities:batch
 *   npm run import:dem:cities:batch -- --dir "data/geographic/dem/china/cities"
 *   npm run import:dem:cities:batch -- --skip-existing
 * 
 * 功能：
 * 1. 扫描指定目录下的所有 .tif 文件
 * 2. 从文件名提取城市名
 * 3. 批量导入每个城市的 DEM 数据
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * 从文件名提取城市名
 * 例如: "拉萨市.tif" -> "拉萨市"
 */
function extractCityNameFromFilename(filename: string): string {
  return filename.replace(/\.tif$/i, '');
}

/**
 * 批量导入城市 DEM 数据
 */
async function importCitiesBatch(
  citiesDir: string,
  skipExisting: boolean = false
): Promise<void> {
  console.log('\n🔄 开始批量导入城市 DEM 数据\n');
  console.log(`📁 目录: ${citiesDir}\n`);

  if (!fs.existsSync(citiesDir)) {
    throw new Error(`目录不存在: ${citiesDir}`);
  }

  // 扫描所有 .tif 文件并按中文拼音排序
  const files = fs.readdirSync(citiesDir)
    .filter(file => file.toLowerCase().endsWith('.tif'))
    .map(file => ({
      filename: file,
      cityName: extractCityNameFromFilename(file),
      fullPath: path.join(citiesDir, file),
    }))
    .sort((a, b) => a.cityName.localeCompare(b.cityName, 'zh-CN')); // 按中文拼音排序

  if (files.length === 0) {
    console.log('⚠️  未找到任何 .tif 文件\n');
    return;
  }

  console.log(`📊 找到 ${files.length} 个城市 DEM 文件:\n`);
  files.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file.cityName} (${file.filename})`);
  });
  console.log('');

  // 检查已存在的表
  const existingTables = await prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_name LIKE 'geo_dem_city_%'
    ORDER BY table_name;
  `) as Array<{ table_name: string }>;

  const existingTableNames = new Set(existingTables.map(t => t.table_name));

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // 逐个导入
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`\n[${i + 1}/${files.length}] 📥 导入 ${file.cityName}...`);

    try {
      // 检查表是否已存在
      const tableName = `geo_dem_city_${file.cityName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      if (skipExisting && existingTableNames.has(tableName)) {
        console.log(`   ⏭️  表 ${tableName} 已存在，跳过`);
        skipCount++;
        continue;
      }

      // 调用导入脚本
      const { execSync } = require('child_process');
      const cmd = `npm run import:dem:city -- --city "${file.cityName}" --tif "${file.fullPath}"`;
      
      execSync(cmd, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      successCount++;
      console.log(`   ✅ ${file.cityName} 导入成功`);
    } catch (error) {
      errorCount++;
      console.error(`   ❌ ${file.cityName} 导入失败:`, error instanceof Error ? error.message : error);
    }
  }

  // 统计
  console.log('\n');
  console.log('📊 批量导入统计:');
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ⏭️  跳过: ${skipCount}`);
  console.log(`   ❌ 失败: ${errorCount}`);
  console.log(`   📝 总计: ${files.length}\n`);

  if (successCount > 0) {
    console.log('✅ 批量导入完成！\n');
  }
}

async function main() {
  const args = process.argv.slice(2);
  let citiesDir = path.join(process.cwd(), 'data/geographic/dem/china/cities');
  let skipExisting = false;

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      citiesDir = args[i + 1];
      i++;
    } else if (args[i] === '--skip-existing') {
      skipExisting = true;
    }
  }

  try {
    await importCitiesBatch(citiesDir, skipExisting);
  } catch (error) {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

