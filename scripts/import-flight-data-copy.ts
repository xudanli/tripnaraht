// scripts/import-flight-data-copy.ts
// 使用 PostgreSQL COPY 命令高效导入航班数据（最高效方案）

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

const prisma = new PrismaClient();

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
 * 从 DATABASE_URL 解析连接信息
 */
function parseDatabaseUrl(): { host: string; port: number; database: string; user: string; password: string } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 环境变量未设置');
  }

  // 解析格式: postgresql://user:password@host:port/database
  const url = new URL(databaseUrl);
  
  return {
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1), // 移除开头的 '/'
    user: url.username,
    password: url.password,
  };
}

/**
 * 主函数：使用 COPY 命令导入数据
 */
async function main() {
  const args = process.argv.slice(2);
  const csvFilePath = resolveFilePath(args[0]);

  console.log('🚀 开始使用 PostgreSQL COPY 命令导入航班数据（最高效方案）...\n');
  console.log(`📁 文件路径: ${csvFilePath}\n`);

  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ 文件不存在: ${csvFilePath}`);
    process.exit(1);
  }

  // 检查文件是否为 CSV（不是 Excel）
  const ext = path.extname(csvFilePath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    console.error(`\n❌ 错误：检测到 Excel 文件，COPY 命令仅支持 CSV 格式。`);
    console.error(`\n💡 解决方案：先转换为 CSV`);
    console.error(`   npm run convert:excel-to-csv ${csvFilePath}`);
    process.exit(1);
  }

  // 检查文件头（确保不是 Excel）
  const fd = fs.openSync(csvFilePath, 'r');
  const buffer = Buffer.alloc(4);
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);
  
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03) {
    console.error(`\n❌ 错误：文件实际上是 Excel 格式（以 PK 开头），COPY 命令仅支持 CSV 格式。`);
    console.error(`\n💡 解决方案：先转换为 CSV`);
    console.error(`   npm run convert:excel-to-csv ${csvFilePath}`);
    process.exit(1);
  }

  const pgClient = new Client(parseDatabaseUrl());

  try {
    await pgClient.connect();
    console.log('✅ 已连接到 PostgreSQL 数据库\n');

    // ============================================
    // 步骤 1: 创建临时表
    // ============================================
    console.log('📋 创建临时表...');
    await pgClient.query(`
      CREATE TEMP TABLE IF NOT EXISTS flight_data_temp (
        出发城市 VARCHAR(50),
        到达城市 VARCHAR(50),
        日期 DATE,
        价格元 INTEGER,
        里程公里 NUMERIC,
        航班班次 VARCHAR(20),
        航空公司 VARCHAR(50)
      );
    `);
    console.log('✅ 临时表创建完成\n');

    // ============================================
    // 步骤 2: 使用 COPY 导入数据
    // ============================================
    console.log('📥 开始导入数据（COPY 命令）...');
    const startTime = Date.now();
    
    // 注意：COPY 命令需要文件的绝对路径，且 PostgreSQL 服务器必须能访问该文件
    // 如果文件在客户端，需要使用 \copy（客户端 COPY）或通过 stdin
    const absolutePath = path.resolve(csvFilePath);
    
    // 使用客户端 COPY（\copy 的等价操作）
    // 读取文件并通过 stdin 传输
    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    const lines = fileContent.split('\n');
    const header = lines[0];
    
    // 跳过标题行，处理数据
    const dataLines = lines.slice(1).filter(line => line.trim());
    
    console.log(`   总行数: ${dataLines.length.toLocaleString()}`);
    console.log(`   正在导入...`);
    
    // 使用批量插入（COPY FROM stdin）
    const copyQuery = `
      COPY flight_data_temp(出发城市, 到达城市, 日期, 价格元, 里程公里, 航班班次, 航空公司)
      FROM STDIN
      WITH (FORMAT csv, DELIMITER ',', ENCODING 'UTF8');
    `;
    
    const copyStream = pgClient.query(copyQuery);
    
    // 写入数据（跳过标题行）
    for (const line of dataLines) {
      if (line.trim()) {
        copyStream.write(line + '\n');
      }
    }
    
    await copyStream.end();
    
    const importTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ 数据导入完成（耗时: ${importTime} 秒）\n`);

    // ============================================
    // 步骤 3: 验证导入数据
    // ============================================
    const countResult = await pgClient.query('SELECT COUNT(*) as count FROM flight_data_temp WHERE 价格元 > 0 AND 价格元 < 100000');
    const validCount = parseInt(countResult.rows[0].count);
    console.log(`📊 有效记录数: ${validCount.toLocaleString()}\n`);

    // ============================================
    // 步骤 4: 计算并插入周内因子
    // ============================================
    console.log('📊 计算周内因子...');
    await pgClient.query(`
      INSERT INTO "DayOfWeekFactor" (day_of_week, factor, avg_price, total_avg_price, sample_count, last_updated)
      SELECT 
        CASE 
          WHEN EXTRACT(DOW FROM 日期) = 0 THEN 6  -- 周日转换为 6
          ELSE EXTRACT(DOW FROM 日期) - 1          -- 其他天减 1（周一=1 -> 0）
        END as day_of_week,
        AVG(价格元) / (SELECT AVG(价格元) FROM flight_data_temp WHERE 价格元 > 0 AND 价格元 < 100000) as factor,
        AVG(价格元) as avg_price,
        (SELECT AVG(价格元) FROM flight_data_temp WHERE 价格元 > 0 AND 价格元 < 100000) as total_avg_price,
        COUNT(*) as sample_count,
        NOW() as last_updated
      FROM flight_data_temp
      WHERE 价格元 > 0 AND 价格元 < 100000
      GROUP BY CASE 
        WHEN EXTRACT(DOW FROM 日期) = 0 THEN 6
        ELSE EXTRACT(DOW FROM 日期) - 1
      END
      ON CONFLICT (day_of_week) DO UPDATE SET
        factor = EXCLUDED.factor,
        avg_price = EXCLUDED.avg_price,
        total_avg_price = EXCLUDED.total_avg_price,
        sample_count = EXCLUDED.sample_count,
        last_updated = EXCLUDED.last_updated;
    `);
    console.log('✅ 周内因子计算完成\n');

    // ============================================
    // 步骤 5: 计算并插入详细数据
    // ============================================
    console.log('📊 计算详细数据（航线×月份×星期）...');
    const detailStartTime = Date.now();
    
    await pgClient.query(`
      INSERT INTO "FlightPriceDetail" (
        route_id, origin_city, destination_city, month, day_of_week,
        monthly_base_price, day_of_week_factor, sample_count, min_price, max_price, std_dev, last_updated
      )
      SELECT 
        CONCAT(出发城市, '->', 到达城市) as route_id,
        出发城市 as origin_city,
        到达城市 as destination_city,
        EXTRACT(MONTH FROM 日期)::INTEGER as month,
        CASE 
          WHEN EXTRACT(DOW FROM 日期) = 0 THEN 6
          ELSE EXTRACT(DOW FROM 日期) - 1
        END as day_of_week,
        AVG(价格元) as monthly_base_price,
        (SELECT factor FROM "DayOfWeekFactor" WHERE day_of_week = 
          CASE 
            WHEN EXTRACT(DOW FROM 日期) = 0 THEN 6
            ELSE EXTRACT(DOW FROM 日期) - 1
          END
        ) as day_of_week_factor,
        COUNT(*) as sample_count,
        MIN(价格元) as min_price,
        MAX(价格元) as max_price,
        STDDEV(价格元) as std_dev,
        NOW() as last_updated
      FROM flight_data_temp
      WHERE 价格元 > 0 AND 价格元 < 100000
      GROUP BY 出发城市, 到达城市, EXTRACT(MONTH FROM 日期), 
        CASE 
          WHEN EXTRACT(DOW FROM 日期) = 0 THEN 6
          ELSE EXTRACT(DOW FROM 日期) - 1
        END
      ON CONFLICT (route_id, month, day_of_week) DO UPDATE SET
        monthly_base_price = EXCLUDED.monthly_base_price,
        day_of_week_factor = EXCLUDED.day_of_week_factor,
        sample_count = EXCLUDED.sample_count,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        std_dev = EXCLUDED.std_dev,
        last_updated = EXCLUDED.last_updated;
    `);
    
    const detailTime = ((Date.now() - detailStartTime) / 1000).toFixed(2);
    console.log(`✅ 详细数据计算完成（耗时: ${detailTime} 秒）\n`);

    // ============================================
    // 步骤 6: 显示统计信息
    // ============================================
    const dayOfWeekResult = await pgClient.query('SELECT * FROM "DayOfWeekFactor" ORDER BY day_of_week');
    console.log('📈 周内因子统计:');
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    dayOfWeekResult.rows.forEach((row) => {
      const dayName = dayNames[row.day_of_week] || `星期${row.day_of_week + 1}`;
      console.log(`   ${dayName} (${row.day_of_week}): ${parseFloat(row.factor).toFixed(3)} (样本: ${parseInt(row.sample_count).toLocaleString()})`);
    });
    console.log('');

    const detailCountResult = await pgClient.query('SELECT COUNT(*) as count FROM "FlightPriceDetail"');
    const detailCount = parseInt(detailCountResult.rows[0].count);
    console.log(`📊 详细数据记录数: ${detailCount.toLocaleString()}\n`);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ 导入完成！总耗时: ${totalTime} 秒`);

  } catch (error: any) {
    console.error('\n❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pgClient.end();
    await prisma.$disconnect();
  }
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

