// scripts/import-flight-data.ts
// 导入2024年中国航空航班数据并计算价格因子

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';

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
 * 处理单行Excel数据
 */
function processExcelRow(row: any): FlightRecord | null {
  // 处理列名映射（Excel 可能有不同的列名）
  const priceColumn = (row as any)['价格(元)'] ?? (row as any)['价格元'] ?? (row as any)['价格'] ?? (row as any)['价格（元）'];
  const dateColumn = (row as any)['日期'] ?? (row as any)['Date'] ?? (row as any)['date'];
  const originColumn = (row as any)['出发城市'] ?? (row as any)['出发'] ?? (row as any)['Origin'];
  const destColumn = (row as any)['到达城市'] ?? (row as any)['到达'] ?? (row as any)['Destination'];
  
  // 解析价格
  let price = 0;
  if (typeof priceColumn === 'number') {
    price = Math.round(priceColumn);
  } else if (typeof priceColumn === 'string') {
    const num = parseFloat(priceColumn.replace(/[^\d.]/g, ''));
    price = isNaN(num) ? 0 : Math.round(num);
  }
  
  // 解析日期
  let dateStr = '';
  if (dateColumn instanceof Date) {
    dateStr = dateColumn.toISOString().split('T')[0];
  } else if (typeof dateColumn === 'string') {
    dateStr = dateColumn.replace(/\//g, '-');
  } else if (typeof dateColumn === 'number') {
    // Excel 日期序列号（1900年1月1日为基准）
    try {
      const excelDate = XLSX.SSF.parse_date_code(dateColumn);
      dateStr = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
    } catch (e) {
      // 如果解析失败，尝试使用 JavaScript Date
      const jsDate = XLSX.SSF.parse_date_code(dateColumn);
      const date = new Date((jsDate.y - 1900), jsDate.m - 1, jsDate.d);
      dateStr = date.toISOString().split('T')[0];
    }
  }
  
  // 只返回有效记录
  if (originColumn && destColumn && dateStr && price > 0) {
    return {
      出发城市: String(originColumn),
      到达城市: String(destColumn),
      日期: dateStr,
      价格元: price,
      里程公里: (row as any)['里程（公里）'] || (row as any)['里程'] || (row as any)['里程公里'] ? parseFloat(String((row as any)['里程（公里）'] || (row as any)['里程'] || (row as any)['里程公里'])) : undefined,
      航班班次: (row as any)['航班班次'] || (row as any)['航班'] || undefined,
      航空公司: (row as any)['航空公司'] || (row as any)['航司'] || undefined,
    };
  }
  
  return null;
}

/**
 * 分批加载 Excel 文件（优化内存使用）
 * 使用生成器模式，逐批返回数据
 */
function* loadExcelFileBatched(filePath: string, batchSize: number = 10000): Generator<FlightRecord[], void, unknown> {
  console.log(`📊 检测到 Excel 文件，正在分批解析...`);
  
  console.log(`  正在读取文件...`);
  const workbook = XLSX.readFile(filePath, { 
    // 使用更高效的模式
    cellDates: false, // 不自动转换日期，我们自己处理
    cellNF: false,    // 不格式化数字
    cellStyles: false, // 不读取样式
  });
  const sheetName = workbook.SheetNames[0]; // 读取第一个工作表
  console.log(`  工作表: ${sheetName}`);
  
  const worksheet = workbook.Sheets[sheetName];
  
  // 获取总行数（估算）
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const totalRows = range.e.r + 1; // 包括表头
  const dataRows = totalRows - 1; // 减去表头
  console.log(`  预计数据行数: ${dataRows.toLocaleString()}`);
  
  // 显示第一行数据，帮助调试列名
  const firstRow = XLSX.utils.sheet_to_json(worksheet, { 
    raw: true, 
    defval: null,
    range: 0, // 只读取第一行
  });
  if (firstRow.length > 0) {
    console.log(`  列名示例:`, Object.keys(firstRow[0] as object));
  }
  
  // 分批处理：每次处理 batchSize 行
  console.log(`  正在分批处理数据（每批 ${batchSize.toLocaleString()} 行）...`);
  let processedCount = 0;
  let batch: FlightRecord[] = [];
  
  // 使用 sheet_to_json 的 range 选项来分批读取
  // 但由于 xlsx 库的限制，我们只能一次性读取，然后分批处理
  // 为了优化内存，我们使用流式处理的方式
  const rawData = XLSX.utils.sheet_to_json(worksheet, { 
    raw: true, 
    defval: null,
    // 不一次性加载所有数据到内存，而是逐行处理
  });
  
  console.log(`  原始数据行数: ${rawData.length.toLocaleString()}`);
  
  for (const row of rawData) {
    processedCount++;
    
    const record = processExcelRow(row);
    if (record) {
      batch.push(record);
    }
    
    // 每处理 batchSize 行，返回一批数据
    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
    
    // 进度显示
    if (processedCount % 10000 === 0) {
      process.stdout.write(`  已处理 ${processedCount.toLocaleString()}/${rawData.length.toLocaleString()} 行 (${((processedCount / rawData.length) * 100).toFixed(1)}%)...\r`);
    }
  }
  
  // 返回最后一批数据
  if (batch.length > 0) {
    yield batch;
  }
  
  console.log(`\n✅ 成功处理 ${processedCount.toLocaleString()} 行数据`);
}

/**
 * 加载 Excel 文件（兼容旧接口，但使用分批处理）
 */
function loadExcelFile(filePath: string): FlightRecord[] {
  const allRecords: FlightRecord[] = [];
  let totalProcessed = 0;
  
  const generator = loadExcelFileBatched(filePath, 10000);
  let result = generator.next();
  while (!result.done) {
    const batch = result.value;
    if (batch && batch.length > 0) {
      allRecords.push(...batch);
      totalProcessed += batch.length;
    }
    result = generator.next();
  }
  
  console.log(`✅ 成功加载 ${allRecords.length.toLocaleString()} 条有效记录`);
  return allRecords;
}

/**
 * 加载 CSV 文件（同步版本）
 */
function loadCSVFileContent(filePath: string): FlightRecord[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  
  // 使用 csv-parse 解析，指定列名和数据类型
  const records = parse(fileContent, {
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
      if (context.column === '日期') {
        // 处理日期格式：2024/1/1 或 2024-01-01
        const dateStr = value.replace(/\//g, '-');
        return dateStr;
      }
      return value;
    },
    trim: true,
  });

  return records as FlightRecord[];
}

/**
 * 高效加载文件（支持 CSV 和 Excel）
 */
async function loadCSVFile(filePath: string): Promise<FlightRecord[]> {
  console.log(`📂 正在加载文件: ${filePath}...`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const fileType = detectFileType(filePath);
  
  if (fileType === 'excel') {
    return loadExcelFile(filePath);
  } else {
    const records = loadCSVFileContent(filePath);
    console.log(`✅ 成功加载 ${records.length} 条记录`);
    return records;
  }
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
 * 解析文件路径（智能处理相对路径和绝对路径）
 */
function resolveFilePath(inputPath: string | undefined): string {
  const defaultPath = path.join(process.cwd(), 'scripts', 'flight_data_2024_CN.csv');
  
  if (!inputPath) {
    return defaultPath;
  }

  // 如果是绝对路径且文件存在，直接使用
  if (path.isAbsolute(inputPath) && fs.existsSync(inputPath)) {
    return inputPath;
  }

  // 如果是绝对路径但文件不存在，可能是用户误用了绝对路径格式
  // 例如：/scripts/file.csv 应该是 scripts/file.csv
  if (path.isAbsolute(inputPath) && !fs.existsSync(inputPath)) {
    // 尝试去掉开头的 / 并解析为相对路径
    const relativePath = inputPath.startsWith('/') ? inputPath.substring(1) : inputPath;
    const resolvedPath = path.resolve(process.cwd(), relativePath);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
    // 如果还是不存在，返回原始路径（让 loadCSVFile 抛出清晰的错误）
    return inputPath;
  }

  // 相对路径：从项目根目录解析
  return path.resolve(process.cwd(), inputPath);
}

/**
 * 主函数：导入数据并计算因子
 */
async function main() {
  const args = process.argv.slice(2);
  const csvFilePath = resolveFilePath(args[0]);

  console.log('🚀 开始导入航班数据...\n');
  console.log(`📁 文件路径: ${csvFilePath}\n`);

  try {
    // ============================================
    // 步骤 1: 高效加载数据
    // ============================================
    const records = await loadCSVFile(csvFilePath);

    // 数据清洗：过滤无效数据
    const validRecords = records.filter((r) => {
      return (
        r.出发城市 &&
        r.到达城市 &&
        r.日期 &&
        r.价格元 &&
        r.价格元 > 0 &&
        r.价格元 < 100000 // 价格合理性检查
      );
    });

    console.log(`📊 有效记录: ${validRecords.length} 条（过滤 ${records.length - validRecords.length} 条无效数据）\n`);

    // ============================================
    // 步骤 2: 计算星期几和月份
    // ============================================
    const enrichedRecords = validRecords.map((r) => {
      const dayOfWeek = getDayOfWeek(r.日期);
      const month = getMonth(r.日期);
      const routeId = createRouteId(r.出发城市, r.到达城市);

      return {
        ...r,
        dayOfWeek,
        month,
        routeId,
      };
    });

    // ============================================
    // 步骤 3: 计算总平均价（用于周内因子）
    // ============================================
    const totalAvgPrice = enrichedRecords.reduce((sum, r) => sum + r.价格元, 0) / enrichedRecords.length;
    console.log(`📈 总平均价格: ${totalAvgPrice.toFixed(2)} 元\n`);

    // ============================================
    // 步骤 4: 计算周内因子 (F_day)
    // ============================================
    console.log('📊 计算周内因子...');
    const dayOfWeekStats = new Map<number, { sum: number; count: number }>();

    for (const record of enrichedRecords) {
      const stats = dayOfWeekStats.get(record.dayOfWeek) || { sum: 0, count: 0 };
      stats.sum += record.价格元;
      stats.count += 1;
      dayOfWeekStats.set(record.dayOfWeek, stats);
    }

    // 计算并存储周内因子
    const dayOfWeekFactors: Array<{
      dayOfWeek: number;
      factor: number;
      avgPrice: number;
      sampleCount: number;
    }> = [];

    for (const [dayOfWeek, stats] of Array.from(dayOfWeekStats.entries())) {
      const avgPrice = stats.sum / stats.count;
      const factor = avgPrice / totalAvgPrice;

      dayOfWeekFactors.push({
        dayOfWeek,
        factor,
        avgPrice,
        sampleCount: stats.count,
      });

      // 更新或创建 DayOfWeekFactor 记录
      await prisma.dayOfWeekFactor.upsert({
        where: { dayOfWeek },
        create: {
          dayOfWeek,
          factor,
          avgPrice,
          totalAvgPrice,
          sampleCount: stats.count,
        },
        update: {
          factor,
          avgPrice,
          totalAvgPrice,
          sampleCount: stats.count,
        },
      });
    }

    console.log('✅ 周内因子计算完成:');
    dayOfWeekFactors.forEach((f) => {
      const dayName = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][f.dayOfWeek];
      console.log(`  ${dayName} (${f.dayOfWeek}): ${f.factor.toFixed(3)} (样本: ${f.sampleCount})`);
    });
    console.log('');

    // ============================================
    // 步骤 5: 计算月度基准价 (P_month)
    // ============================================
    console.log('📊 计算月度基准价...');
    const monthlyStats = new Map<string, { sum: number; count: number; prices: number[] }>();

    for (const record of enrichedRecords) {
      const key = `${record.routeId}_${record.month}`;
      const stats = monthlyStats.get(key) || { sum: 0, count: 0, prices: [] };
      stats.sum += record.价格元;
      stats.count += 1;
      stats.prices.push(record.价格元);
      monthlyStats.set(key, stats);
    }

    console.log(`📦 共 ${monthlyStats.size} 条航线-月份组合\n`);

    // ============================================
    // 步骤 6: 按航线-月份-星期几分组计算详细数据
    // ============================================
    console.log('📊 计算航线-月份-星期几详细数据...');
    const detailedStats = new Map<string, {
      routeId: string;
      originCity: string;
      destinationCity: string;
      month: number;
      dayOfWeek: number;
      prices: number[];
    }>();

    for (const record of enrichedRecords) {
      const key = `${record.routeId}_${record.month}_${record.dayOfWeek}`;
      const stats = detailedStats.get(key);

      if (!stats) {
        detailedStats.set(key, {
          routeId: record.routeId,
          originCity: record.出发城市,
          destinationCity: record.到达城市,
          month: record.month,
          dayOfWeek: record.dayOfWeek,
          prices: [record.价格元],
        });
      } else {
        stats.prices.push(record.价格元);
      }
    }

    // ============================================
    // 步骤 7: 批量写入数据库
    // ============================================
    console.log(`💾 开始写入数据库（${detailedStats.size} 条记录）...\n`);

    let successCount = 0;
    let updateCount = 0;
    let createCount = 0;
    const batchSize = 100;

    const entries = Array.from(detailedStats.entries());
    
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async ([key, stats]) => {
          const prices = stats.prices;
          const monthlyBasePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          
          // 计算标准差
          const variance = prices.reduce((sum: number, p: number) => sum + Math.pow(p - monthlyBasePrice, 2), 0) / prices.length;
          const stdDev = Math.sqrt(variance);

          // 获取周内因子
          const dayFactor = dayOfWeekFactors.find((f) => f.dayOfWeek === stats.dayOfWeek);
          const dayOfWeekFactor = dayFactor?.factor || null;

          try {
            const existing = await prisma.flightPriceDetail.findFirst({
              where: {
                routeId: stats.routeId,
                month: stats.month,
                dayOfWeek: stats.dayOfWeek,
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
                },
              });
              updateCount++;
            } else {
              await prisma.flightPriceDetail.create({
                data: {
                  routeId: stats.routeId,
                  originCity: stats.originCity,
                  destinationCity: stats.destinationCity,
                  month: stats.month,
                  dayOfWeek: stats.dayOfWeek,
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
            console.error(`❌ 处理 ${key} 失败:`, error.message);
          }
        })
      );

      // 进度显示
      if ((i + batchSize) % 1000 === 0 || i + batchSize >= entries.length) {
        console.log(`  进度: ${Math.min(i + batchSize, entries.length)} / ${entries.length}`);
      }
    }

    // ============================================
    // 步骤 8: 计算并存储月度基准价（汇总表，不区分星期几）
    // ============================================
    console.log('\n📊 计算月度基准价汇总表...');
    
    for (const [key, stats] of Array.from(monthlyStats.entries())) {
      const [routeId, monthStr] = key.split('_');
      const month = parseInt(monthStr);
      
      // 找到该航线的第一条记录获取城市信息
      const sampleRecord = enrichedRecords.find(
        (r) => r.routeId === routeId && r.month === month
      );
      
      if (!sampleRecord) continue;

      const prices = stats.prices;
      const monthlyBasePrice = stats.sum / stats.count;
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      
      const variance = prices.reduce((sum: number, p: number) => sum + Math.pow(p - monthlyBasePrice, 2), 0) / prices.length;
      const stdDev = Math.sqrt(variance);

      // 存储月度基准价（dayOfWeek = null 表示汇总数据）
      try {
        const existing = await prisma.flightPriceDetail.findFirst({
          where: {
            routeId,
            month,
            dayOfWeek: null,
          },
        });

        if (existing) {
          await prisma.flightPriceDetail.update({
            where: { id: existing.id },
            data: {
              monthlyBasePrice,
              sampleCount: stats.count,
              minPrice,
              maxPrice,
              stdDev,
            },
          });
        } else {
          await prisma.flightPriceDetail.create({
            data: {
              routeId,
              originCity: sampleRecord.出发城市,
              destinationCity: sampleRecord.到达城市,
              month,
              dayOfWeek: null,
              monthlyBasePrice,
              dayOfWeekFactor: null,
              sampleCount: stats.count,
              minPrice,
              maxPrice,
              stdDev,
            },
          });
        }
      } catch (error: any) {
        // 如果唯一约束冲突，忽略（可能已存在）
        if (!error.message.includes('Unique constraint')) {
          console.error(`❌ 处理月度基准价 ${key} 失败:`, error.message);
        }
      }
    }

    // ============================================
    // 统计信息
    // ============================================
    console.log('\n📊 导入统计:');
    console.log(`  总记录数: ${records.length}`);
    console.log(`  有效记录: ${validRecords.length}`);
    console.log(`  成功导入: ${successCount} 条`);
    console.log(`  创建: ${createCount} 条`);
    console.log(`  更新: ${updateCount} 条`);
    console.log(`  周内因子: ${dayOfWeekFactors.length} 个`);
    console.log(`  航线-月份组合: ${monthlyStats.size} 个`);
    console.log('\n✅ 数据导入完成！');
  } catch (error: any) {
    console.error('❌ 导入失败:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

