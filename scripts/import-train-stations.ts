// 导入火车站数据脚本
// 支持 CSV 格式，字段：站名,车站地址,铁路局,类别,性质,省,市,WGS84_Lng,WGS84_Lat

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

interface TrainStationRow {
  站名: string;
  车站地址: string;
  铁路局: string;
  类别: string;
  性质: string;
  省: string;
  市: string;
  WGS84_Lng: string;
  WGS84_Lat: string;
}

/**
 * 解析 CSV 文件并导入火车站数据
 */
async function importTrainStations(csvFilePath: string) {
  console.log('🚀 开始导入火车站数据...\n');

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
  }) as TrainStationRow[];

  console.log(`📊 解析到 ${records.length} 条记录\n`);

  // 批量导入（每批 1000 条）
  const batchSize = 1000;
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    console.log(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, records.length)})`);

    for (const record of batch) {
      try {
        // 验证必填字段
        if (!record.站名) {
          console.warn(`⚠️  跳过：缺少站名`);
          skipped++;
          continue;
        }

        // 解析坐标
        const lng = record.WGS84_Lng ? parseFloat(record.WGS84_Lng) : null;
        const lat = record.WGS84_Lat ? parseFloat(record.WGS84_Lat) : null;

        // 验证坐标范围（中国境内大致范围）
        if (lng !== null && (lng < 73 || lng > 135)) {
          console.warn(`⚠️  跳过：经度超出范围 ${record.站名} (lng: ${lng})`);
          skipped++;
          continue;
        }
        if (lat !== null && (lat < 18 || lat > 54)) {
          console.warn(`⚠️  跳过：纬度超出范围 ${record.站名} (lat: ${lat})`);
          skipped++;
          continue;
        }

        // 检查是否已存在（根据站名）
        const existing = await prisma.rawTrainStationData.findFirst({
          where: {
            name: record.站名,
            province: record.省 || undefined,
            city: record.市 || undefined,
          },
        });

        if (existing) {
          // 更新现有记录
          await prisma.rawTrainStationData.update({
            where: { id: existing.id },
            data: {
              address: record.车站地址 || null,
              railwayBureau: record.铁路局 || null,
              category: record.类别 || null,
              nature: record.性质 || null,
              province: record.省 || null,
              city: record.市 || null,
              wgs84Lng: lng,
              wgs84Lat: lat,
            },
          });
          skipped++;
          continue;
        }

        // 创建新记录
        await prisma.rawTrainStationData.create({
          data: {
            name: record.站名,
            address: record.车站地址 || null,
            railwayBureau: record.铁路局 || null,
            category: record.类别 || null,
            nature: record.性质 || null,
            province: record.省 || null,
            city: record.市 || null,
            wgs84Lng: lng,
            wgs84Lat: lat,
          },
        });

        imported++;
      } catch (error: any) {
        errors++;
        console.error(`❌ 导入失败: ${record.站名}`, error.message);
      }
    }

    const progress = ((i + batch.length) / records.length * 100).toFixed(1);
    console.log(`  进度: ${progress}% (已导入: ${imported}, 跳过: ${skipped}, 错误: ${errors})\n`);
  }

  console.log('✅ 导入完成！\n');
  console.log('📊 统计信息:');
  console.log(`  - 总记录数: ${records.length}`);
  console.log(`  - 成功导入: ${imported}`);
  console.log(`  - 跳过: ${skipped}`);
  console.log(`  - 错误: ${errors}`);
}

/**
 * 主函数
 */
async function main() {
  const csvFilePath = process.argv[2] || 'scripts/train_stations.csv';

  try {
    await importTrainStations(csvFilePath);
  } catch (error: any) {
    console.error('❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

