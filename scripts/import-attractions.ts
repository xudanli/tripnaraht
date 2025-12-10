// 导入景点数据脚本
// 支持 CSV 格式，字段：景区名称,等级,地址,省级,相关文件发布时间,文件网址链接,编码地址,lng_wgs84,lat_wgs84

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

interface AttractionRow {
  景区名称: string;
  等级: string;
  地址: string;
  省级: string;
  相关文件发布时间: string;
  文件网址链接: string;
  编码地址: string;
  lng_wgs84: string;
  lat_wgs84: string;
}

/**
 * 解析 CSV 文件并导入景点数据
 */
async function importAttractions(csvFilePath: string) {
  console.log('🚀 开始导入景点数据...\n');

  // 检查文件是否存在
  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`文件不存在: ${csvFilePath}`);
  }

  console.log(`📂 读取文件: ${csvFilePath}\n`);

  // 读取 CSV 文件
  const fileContent = fs.readFileSync(csvFilePath, 'utf-8');

  // 解析 CSV（使用 csv-parse）
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as AttractionRow[];

  console.log(`📊 解析到 ${records.length} 条记录\n`);

  // 批量导入（每批 1000 条）
  const batchSize = 1000;
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    console.log(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, records.length)})`);

    for (const row of batch) {
      try {
        // 验证必填字段
        if (!row.景区名称 || !row.景区名称.trim()) {
          skipped++;
          continue;
        }

        // 解析经纬度
        const lng = row.lng_wgs84 ? parseFloat(row.lng_wgs84) : null;
        const lat = row.lat_wgs84 ? parseFloat(row.lat_wgs84) : null;

        // 验证经纬度范围
        if (lng !== null && (lng < -180 || lng > 180)) {
          console.warn(`⚠️  无效经度: ${lng} (${row.景区名称})`);
        }
        if (lat !== null && (lat < -90 || lat > 90)) {
          console.warn(`⚠️  无效纬度: ${lat} (${row.景区名称})`);
        }

        // 检查是否已存在（根据名称和地址）
        const existing = await prisma.rawAttractionData.findFirst({
          where: {
            name: row.景区名称.trim(),
            address: row.地址 || undefined,
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // 插入数据
        await prisma.rawAttractionData.create({
          data: {
            name: row.景区名称.trim(),
            level: row.等级?.trim() || null,
            address: row.地址?.trim() || null,
            province: row.省级?.trim() || null,
            publishDate: row.相关文件发布时间?.trim() || null,
            documentUrl: row.文件网址链接?.trim() || null,
            encodedAddress: row.编码地址?.trim() || null,
            lng: lng && !isNaN(lng) ? lng : null,
            lat: lat && !isNaN(lat) ? lat : null,
            processed: false,
          },
        });

        imported++;
      } catch (error: any) {
        errors++;
        console.error(`❌ 导入失败: ${row.景区名称}`, error.message);
      }
    }

    // 显示进度
    const progress = ((i + batch.length) / records.length * 100).toFixed(1);
    console.log(`  进度: ${progress}% (已导入: ${imported}, 跳过: ${skipped}, 错误: ${errors})\n`);
  }

  console.log('✅ 导入完成！\n');
  console.log('📊 统计信息:');
  console.log(`  - 总记录数: ${records.length}`);
  console.log(`  - 成功导入: ${imported}`);
  console.log(`  - 跳过（重复）: ${skipped}`);
  console.log(`  - 错误: ${errors}`);

  // 显示示例数据
  const sample = await prisma.rawAttractionData.findFirst({
    orderBy: { importedAt: 'desc' },
  });

  if (sample) {
    console.log('\n📋 示例数据:');
    console.log(`  名称: ${sample.name}`);
    console.log(`  等级: ${sample.level || '未知'}`);
    console.log(`  省份: ${sample.province || '未知'}`);
    console.log(`  地址: ${sample.address || '未知'}`);
    console.log(`  坐标: (${sample.lng}, ${sample.lat})`);
  }
}

/**
 * 主函数
 */
async function main() {
  const csvFilePath = process.argv[2];

  if (!csvFilePath) {
    console.error('❌ 请提供 CSV 文件路径');
    console.log('\n使用方法:');
    console.log('  npx ts-node --project tsconfig.backend.json scripts/import-attractions.ts <csv文件路径>');
    console.log('\n示例:');
    console.log('  npx ts-node --project tsconfig.backend.json scripts/import-attractions.ts downloads/attractions.csv');
    process.exit(1);
  }

  try {
    await importAttractions(csvFilePath);
  } catch (error: any) {
    console.error('❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
