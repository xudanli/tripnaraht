// scripts/import-flight-data-streaming.ts
// 流式导入2024年中国航空航班数据并计算价格因子（内存优化版本）

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse'; // 使用流式 API，不是 sync
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';
import { pipeline } from 'stream/promises';

dotenv.config();

const prisma = new PrismaClient();

interface FlightRecord {
  出发城市: string;
  到达城市: string;
  日期: string;
  价格元: number;
  里程公里?: number;
  航班班次?: string;
  航空公司?: string;
  // 机场信息
  起飞机场?: string;
  起飞机场x?: number; // 经度
  起飞机场y?: number; // 纬度
  降落机场?: string;
  降落机场x?: number; // 经度
  降落机场y?: number; // 纬度
}

interface EnrichedRecord extends FlightRecord {
  dayOfWeek: number;
  month: number;
  routeId: string;
}

/**
 * 计算星期几（0=周一, 6=周日）
 */
function getDayOfWeek(dateStr: string): number {
  const date = new Date(dateStr);
  const day = date.getDay(); // JavaScript: 0=周日, 6=周六
  // 转换为 0=周一, 6=周日
  return day === 0 ? 6 : day - 1;
}

/**
 * 计算月份（1-12）
 */
function getMonth(dateStr: string): number {
  const date = new Date(dateStr);
  return date.getMonth() + 1; // JavaScript: 0-11, 转换为 1-12
}

/**
 * 创建航线ID
 */
function createRouteId(origin: string, destination: string): string {
  return `${origin}->${destination}`;
}

/**
 * 检测文件类型（Excel 或 CSV）
 */
function detectFileType(filePath: string): 'excel' | 'csv' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    return 'excel';
  }
  
  // 检查文件头（Excel 文件以 PK 开头，这是 ZIP 格式）
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(4);
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);
  
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03) {
    return 'excel';
  }
  
  return 'csv';
}

/**
 * 流式处理 CSV 文件并计算统计信息
 */
async function processCSVStreaming(
  filePath: string,
  onBatchProcessed?: (count: number) => void
): Promise<{
  totalRecords: number;
  validRecords: number;
  dayOfWeekStats: Map<number, { sum: number; count: number }>;
  monthlyStats: Map<string, { sum: number; count: number; prices: number[] }>;
  detailedStats: Map<string, {
    routeId: string;
    originCity: string;
    destinationCity: string;
    originAirport?: string;
    originAirportLongitude?: number;
    originAirportLatitude?: number;
    destinationAirport?: string;
    destinationAirportLongitude?: number;
    destinationAirportLatitude?: number;
    month: number;
    dayOfWeek: number;
    prices: number[];
  }>;
}> {
  console.log(`📂 正在流式处理文件: ${filePath}...`);
  
  const dayOfWeekStats = new Map<number, { sum: number; count: number }>();
  const monthlyStats = new Map<string, { sum: number; count: number; prices: number[] }>();
  const detailedStats = new Map<string, {
    routeId: string;
    originCity: string;
    destinationCity: string;
    originAirport?: string;
    originAirportLongitude?: number;
    originAirportLatitude?: number;
    destinationAirport?: string;
    destinationAirportLongitude?: number;
    destinationAirportLatitude?: number;
    month: number;
    dayOfWeek: number;
    prices: number[];
  }>();

  let totalRecords = 0;
  let validRecords = 0;
  let batchCount = 0;

  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    
    const csvParser = parse({
      columns: true,
      skip_empty_lines: true,
      cast: (value, context) => {
        // 根据列名进行类型转换
        if (context.column === '价格(元)' || context.column === '价格元') {
          const num = parseFloat(value);
          return isNaN(num) ? null : Math.round(num);
        }
        if (context.column === '里程（公里）' || context.column === '里程公里') {
          const num = parseFloat(value);
          return isNaN(num) ? null : num;
        }
        // 机场经纬度字段
        if (context.column === '起飞机场x' || context.column === '降落机场x') {
          const num = parseFloat(value);
          return isNaN(num) ? null : num;
        }
        if (context.column === '起飞机场y' || context.column === '降落机场y') {
          const num = parseFloat(value);
          return isNaN(num) ? null : num;
        }
        if (context.column === '日期') {
          // 处理日期格式：2024/1/1 或 2024-01-01
          const dateStr = value.replace(/\//g, '-');
          return dateStr;
        }
        return value;
      },
      trim: true,
    });

    csvParser.on('data', (record: FlightRecord) => {
      totalRecords++;
      
      // 数据验证
      if (
        !record.出发城市 ||
        !record.到达城市 ||
        !record.日期 ||
        !record.价格元 ||
        record.价格元 <= 0 ||
        record.价格元 >= 100000
      ) {
        return; // 跳过无效记录
      }

      validRecords++;

      // 计算星期几和月份
      const dayOfWeek = getDayOfWeek(record.日期);
      const month = getMonth(record.日期);
      const routeId = createRouteId(record.出发城市, record.到达城市);

      // 更新周内因子统计
      const dayStats = dayOfWeekStats.get(dayOfWeek) || { sum: 0, count: 0 };
      dayStats.sum += record.价格元;
      dayStats.count += 1;
      dayOfWeekStats.set(dayOfWeek, dayStats);

      // 更新月度统计
      const monthlyKey = `${routeId}_${month}`;
      const monthStats = monthlyStats.get(monthlyKey) || { sum: 0, count: 0, prices: [] };
      monthStats.sum += record.价格元;
      monthStats.count += 1;
      monthStats.prices.push(record.价格元);
      monthlyStats.set(monthlyKey, monthStats);

      // 更新详细统计（航线-月份-星期几）
      const detailedKey = `${routeId}_${month}_${dayOfWeek}`;
      const detailStats = detailedStats.get(detailedKey);
      
      if (!detailStats) {
        detailedStats.set(detailedKey, {
          routeId,
          originCity: record.出发城市,
          destinationCity: record.到达城市,
          originAirport: record.起飞机场 || undefined,
          originAirportLongitude: record.起飞机场x || undefined,
          originAirportLatitude: record.起飞机场y || undefined,
          destinationAirport: record.降落机场 || undefined,
          destinationAirportLongitude: record.降落机场x || undefined,
          destinationAirportLatitude: record.降落机场y || undefined,
          month,
          dayOfWeek,
          prices: [record.价格元],
        });
      } else {
        detailStats.prices.push(record.价格元);
        // 如果之前没有机场信息，现在有了，则更新
        if (!detailStats.originAirport && record.起飞机场) {
          detailStats.originAirport = record.起飞机场;
          detailStats.originAirportLongitude = record.起飞机场x || undefined;
          detailStats.originAirportLatitude = record.起飞机场y || undefined;
        }
        if (!detailStats.destinationAirport && record.降落机场) {
          detailStats.destinationAirport = record.降落机场;
          detailStats.destinationAirportLongitude = record.降落机场x || undefined;
          detailStats.destinationAirportLatitude = record.降落机场y || undefined;
        }
      }

      // 每处理 10000 条记录，报告一次进度
      if (validRecords % 10000 === 0) {
        batchCount++;
        if (onBatchProcessed) {
          onBatchProcessed(validRecords);
        }
        process.stdout.write(`\r📊 已处理: ${validRecords.toLocaleString()} 条有效记录...`);
      }
    });

    csvParser.on('error', (err) => {
      reject(err);
    });

    csvParser.on('end', () => {
      console.log(`\n✅ 流式处理完成！`);
      console.log(`   总记录数: ${totalRecords.toLocaleString()}`);
      console.log(`   有效记录: ${validRecords.toLocaleString()}`);
      console.log(`   无效记录: ${(totalRecords - validRecords).toLocaleString()}`);
      
      resolve({
        totalRecords,
        validRecords,
        dayOfWeekStats,
        monthlyStats,
        detailedStats,
      });
    });

    // 开始流式处理
    fileStream.pipe(csvParser);
  });
}

/**
 * 解析文件路径
 */
function resolveFilePath(inputPath: string | undefined): string {
  const defaultPath = path.join(process.cwd(), 'scripts', 'flight_data_2024_CN.csv');
  
  if (!inputPath) {
    return defaultPath;
  }

  if (path.isAbsolute(inputPath) && fs.existsSync(inputPath)) {
    return inputPath;
  }

  if (path.isAbsolute(inputPath) && !fs.existsSync(inputPath)) {
    const relativePath = inputPath.startsWith('/') ? inputPath.substring(1) : inputPath;
    const resolvedPath = path.resolve(process.cwd(), relativePath);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
    return inputPath;
  }

  return path.resolve(process.cwd(), inputPath);
}

/**
 * 主函数：流式导入数据并计算因子
 */
async function main() {
  const args = process.argv.slice(2);
  const csvFilePath = resolveFilePath(args[0]);

  console.log('🚀 开始流式导入航班数据（内存优化版本）...\n');
  console.log(`📁 文件路径: ${csvFilePath}\n`);

  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ 文件不存在: ${csvFilePath}`);
    process.exit(1);
  }

  // 检测文件类型
  const fileType = detectFileType(csvFilePath);
  if (fileType === 'excel') {
    console.error(`\n❌ 错误：检测到 Excel 文件，流式处理脚本仅支持 CSV 格式。`);
    console.error(`\n💡 解决方案：`);
    console.error(`   1. 先转换为 CSV（推荐）：`);
    console.error(`      npm run convert:excel-to-csv ${csvFilePath}`);
    console.error(`   2. 然后使用 CSV 文件导入：`);
    console.error(`      npm run import:flight-data:streaming <转换后的CSV文件路径>`);
    console.error(`\n   或者使用批量加载脚本（支持 Excel）：`);
    console.error(`      npm run import:flight-data ${csvFilePath}`);
    process.exit(1);
  }

  try {
    // ============================================
    // 步骤 1: 流式处理 CSV 文件
    // ============================================
    const stats = await processCSVStreaming(csvFilePath, (count) => {
      // 进度回调（可选）
    });

    console.log(`\n📊 统计信息:`);
    console.log(`   总记录数: ${stats.totalRecords.toLocaleString()}`);
    console.log(`   有效记录: ${stats.validRecords.toLocaleString()}\n`);

    // ============================================
    // 步骤 2: 计算总平均价（用于周内因子）
    // ============================================
    let totalSum = 0;
    let totalCount = 0;
    for (const dayStats of Array.from(stats.dayOfWeekStats.values())) {
      totalSum += dayStats.sum;
      totalCount += dayStats.count;
    }
    const totalAvgPrice = totalSum / totalCount;
    console.log(`📈 总平均价格: ${totalAvgPrice.toFixed(2)} 元\n`);

    // ============================================
    // 步骤 3: 计算并存储周内因子 (F_day)
    // ============================================
    console.log('📊 计算周内因子...');
    const dayOfWeekFactors: Array<{
      dayOfWeek: number;
      factor: number;
      avgPrice: number;
      sampleCount: number;
    }> = [];

    for (const [dayOfWeek, dayStats] of Array.from(stats.dayOfWeekStats.entries())) {
      const avgPrice = dayStats.sum / dayStats.count;
      const factor = avgPrice / totalAvgPrice;

      dayOfWeekFactors.push({
        dayOfWeek,
        factor,
        avgPrice,
        sampleCount: dayStats.count,
      });

      // 更新或创建 DayOfWeekFactor 记录
      await prisma.dayOfWeekFactor.upsert({
        where: { dayOfWeek },
        create: {
          dayOfWeek,
          factor,
          avgPrice,
          totalAvgPrice,
          sampleCount: dayStats.count,
        },
        update: {
          factor,
          avgPrice,
          totalAvgPrice,
          sampleCount: dayStats.count,
        },
      });
    }

    console.log('✅ 周内因子计算完成:');
    dayOfWeekFactors.forEach((f) => {
      const dayName = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][f.dayOfWeek];
      console.log(`  ${dayName} (${f.dayOfWeek}): ${f.factor.toFixed(3)} (样本: ${f.sampleCount.toLocaleString()})`);
    });
    console.log('');

    // ============================================
    // 步骤 4: 批量写入详细数据到数据库
    // ============================================
    console.log(`💾 开始写入数据库（${stats.detailedStats.size.toLocaleString()} 条记录）...\n`);

    let successCount = 0;
    let updateCount = 0;
    let createCount = 0;
    const batchSize = 100;

    const entries = Array.from(stats.detailedStats.entries());
    
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async ([key, detailStats]) => {
          const prices = detailStats.prices;
          const monthlyBasePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          
          // 计算标准差
          const variance = prices.reduce((sum: number, p: number) => sum + Math.pow(p - monthlyBasePrice, 2), 0) / prices.length;
          const stdDev = Math.sqrt(variance);

          // 获取周内因子
          const dayFactor = dayOfWeekFactors.find((f) => f.dayOfWeek === detailStats.dayOfWeek);
          const dayOfWeekFactor = dayFactor?.factor || null;

          try {
            const existing = await prisma.flightPriceDetail.findFirst({
              where: {
                routeId: detailStats.routeId,
                month: detailStats.month,
                dayOfWeek: detailStats.dayOfWeek,
              },
            });

            if (existing) {
              await prisma.flightPriceDetail.update({
                where: { id: existing.id },
                data: {
                  monthlyBasePrice,
                  dayOfWeekFactor,
                  sampleCount: prices.length,
                  minPrice,
                  maxPrice,
                  stdDev,
                  // 更新机场信息（如果之前没有）
                  originAirport: detailStats.originAirport || existing.originAirport,
                  originAirportLongitude: detailStats.originAirportLongitude ?? existing.originAirportLongitude,
                  originAirportLatitude: detailStats.originAirportLatitude ?? existing.originAirportLatitude,
                  destinationAirport: detailStats.destinationAirport || existing.destinationAirport,
                  destinationAirportLongitude: detailStats.destinationAirportLongitude ?? existing.destinationAirportLongitude,
                  destinationAirportLatitude: detailStats.destinationAirportLatitude ?? existing.destinationAirportLatitude,
                },
              });
              updateCount++;
            } else {
              await prisma.flightPriceDetail.create({
                data: {
                  routeId: detailStats.routeId,
                  originCity: detailStats.originCity,
                  destinationCity: detailStats.destinationCity,
                  originAirport: detailStats.originAirport,
                  originAirportLongitude: detailStats.originAirportLongitude,
                  originAirportLatitude: detailStats.originAirportLatitude,
                  destinationAirport: detailStats.destinationAirport,
                  destinationAirportLongitude: detailStats.destinationAirportLongitude,
                  destinationAirportLatitude: detailStats.destinationAirportLatitude,
                  month: detailStats.month,
                  dayOfWeek: detailStats.dayOfWeek,
                  monthlyBasePrice,
                  dayOfWeekFactor,
                  sampleCount: prices.length,
                  minPrice,
                  maxPrice,
                  stdDev,
                },
              });
              createCount++;
            }
            successCount++;
          } catch (error: any) {
            console.error(`\n❌ 写入失败 (${key}):`, error.message);
          }
        })
      );

      // 显示进度
      if ((i + batchSize) % (batchSize * 10) === 0 || i + batchSize >= entries.length) {
        const progressPercent = ((i + batchSize) / entries.length * 100);
        const progress = Math.min(100, progressPercent).toFixed(1);
        process.stdout.write(`\r💾 写入进度: ${progress}% (${Math.min(i + batchSize, entries.length)}/${entries.length})`);
      }
    }

    console.log(`\n\n✅ 导入完成！`);
    console.log(`   成功: ${successCount.toLocaleString()} 条`);
    console.log(`   新建: ${createCount.toLocaleString()} 条`);
    console.log(`   更新: ${updateCount.toLocaleString()} 条`);

  } catch (error: any) {
    console.error('\n❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

