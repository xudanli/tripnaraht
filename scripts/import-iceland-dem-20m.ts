#!/usr/bin/env tsx
/**
 * 冰岛 DEM 20m 数据导入脚本
 * 
 * 将 IslandsDEMv1.0_20x20m_isn2016_zmasl.tif 导入到 PostGIS 数据库
 * 
 * 使用方法:
 *   npx tsx scripts/import-iceland-dem-20m.ts [options]
 * 
 * 选项:
 *   --file <path>         GeoTIFF 文件路径（默认: docs/iceland/geography/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif）
 *   --table <name>       表名（默认: geo_dem_iceland_20m）
 *   --srid <srid>        坐标系 SRID（默认: 5327 ISN2016，如果文件是WGS84则使用4326）
 *   --tile-size <size>    瓦片大小（默认: 100x100）
 *   --drop-existing      删除现有表后重新导入
 *   --dry-run            仅显示命令，不执行
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ImportOptions {
  file: string;
  table: string;
  srid: number;
  tileSize: string;
  dropExisting: boolean;
  dryRun: boolean;
}

/**
 * 解析命令行参数
 */
function parseArgs(): ImportOptions {
  const args = process.argv.slice(2);
  const options: ImportOptions = {
    file: path.join(process.cwd(), 'docs/iceland/geography/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif'),
    table: 'geo_dem_iceland_20m',
    srid: 5327, // ISN2016
    tileSize: '100x100',
    dropExisting: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--file':
        options.file = args[++i];
        break;
      case '--table':
        options.table = args[++i];
        break;
      case '--srid':
        options.srid = parseInt(args[++i], 10);
        break;
      case '--tile-size':
        options.tileSize = args[++i];
        break;
      case '--drop-existing':
        options.dropExisting = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(`
冰岛 DEM 20m 数据导入脚本

使用方法:
  npx tsx scripts/import-iceland-dem-20m.ts [options]

选项:
  --file <path>         GeoTIFF 文件路径
  --table <name>        表名（默认: geo_dem_iceland_20m）
  --srid <srid>         坐标系 SRID（默认: 5327 ISN2016）
  --tile-size <size>    瓦片大小（默认: 100x100）
  --drop-existing       删除现有表后重新导入
  --dry-run             仅显示命令，不执行
  --help, -h            显示帮助信息

示例:
  npx tsx scripts/import-iceland-dem-20m.ts
  npx tsx scripts/import-iceland-dem-20m.ts --srid 4326 --tile-size 200x200
  npx tsx scripts/import-iceland-dem-20m.ts --drop-existing --dry-run
        `);
        process.exit(0);
    }
  }

  return options;
}

/**
 * 检查文件是否存在
 */
function checkFileExists(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    return false;
  }
  return true;
}

/**
 * 检查 raster2pgsql 是否安装
 */
function checkRaster2PgsqlInstalled(): boolean {
  try {
    // raster2pgsql 不支持 --version，直接运行会显示使用说明
    execSync('raster2pgsql 2>&1', { stdio: 'pipe' });
    return true;
  } catch (error: any) {
    // 如果命令不存在，会抛出错误；如果命令存在但没有参数，会返回非零退出码但输出使用说明
    // 检查错误输出中是否包含 "USAGE" 或 "RELEASE" 来判断是否安装
    const errorOutput = error.stdout?.toString() || error.stderr?.toString() || '';
    if (errorOutput.includes('USAGE') || errorOutput.includes('RELEASE')) {
      return true;
    }
    console.error('❌ raster2pgsql 未安装');
    console.error('   请安装 PostGIS:');
    console.error('   macOS: brew install postgis');
    console.error('   Ubuntu/Debian: sudo apt-get install postgis postgresql-14-postgis-3');
    return false;
  }
}

/**
 * 检查表是否存在
 */
async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const result: any = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '${tableName}'
      ) as exists;
    `);
    return result?.[0]?.exists === true;
  } catch (error) {
    return false;
  }
}

/**
 * 删除表
 */
async function dropTable(tableName: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`[DRY RUN] 将删除表: ${tableName}`);
    return;
  }

  try {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
    console.log(`✅ 已删除表: ${tableName}`);
  } catch (error: any) {
    console.error(`❌ 删除表失败:`, error.message);
    throw error;
  }
}

/**
 * 执行导入
 */
async function importDEM(options: ImportOptions): Promise<void> {
  const { file, table, srid, tileSize, dropExisting, dryRun } = options;

  console.log('\n🚀 开始导入冰岛 DEM 数据...\n');
  console.log(`文件: ${file}`);
  console.log(`表名: ${table}`);
  console.log(`坐标系: SRID ${srid}`);
  console.log(`瓦片大小: ${tileSize}`);
  console.log(`删除现有表: ${dropExisting ? '是' : '否'}`);
  console.log(`模式: ${dryRun ? 'DRY RUN（仅显示命令）' : '实际执行'}\n`);

  // 1. 检查文件
  if (!checkFileExists(file)) {
    process.exit(1);
  }

  // 2. 检查 raster2pgsql
  if (!checkRaster2PgsqlInstalled()) {
    process.exit(1);
  }

  // 3. 检查表是否存在
  const tableExists = await checkTableExists(table);
  if (tableExists) {
    if (dropExisting) {
      console.log(`⚠️  表 ${table} 已存在，将删除后重新导入...`);
      await dropTable(table, dryRun);
    } else {
      console.error(`❌ 表 ${table} 已存在`);
      console.error(`   使用 --drop-existing 删除现有表后重新导入`);
      process.exit(1);
    }
  }

  // 4. 构建导入命令
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL 环境变量未设置');
    console.error('   请设置: export DATABASE_URL="postgresql://user:password@host:port/database"');
    process.exit(1);
  }

  // 解析数据库连接信息
  const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!urlMatch) {
    console.error('❌ DATABASE_URL 格式不正确');
    process.exit(1);
  }

  const [, user, password, host, port, database] = urlMatch;

  const raster2pgsqlCmd = [
    'raster2pgsql',
    `-s ${srid}`,
    '-I', // 创建空间索引
    '-C', // 应用约束
    '-M', // 更新统计信息
    '-F', // 添加文件名列
    `-t ${tileSize}`, // 瓦片大小
    // 注意：不使用-R选项，将数据完全存储在数据库中（而不是引用外部文件）
    // 这样远程数据库服务器才能正常查询数据
    `"${file}"`,
    table,
  ].join(' ');

  console.log('📋 执行命令:');
  console.log(`   ${raster2pgsqlCmd}\n`);

  if (dryRun) {
    console.log('[DRY RUN] 命令已显示，未实际执行');
    return;
  }

  // 5. 执行导入
  try {
    console.log('⏳ 正在生成SQL并导入数据（这可能需要几分钟）...\n');
    
    // 检查是否有psql可用，如果有则使用管道方式（更快且不需要大缓冲区）
    const psqlPath = '/usr/local/opt/postgresql@17/bin/psql';
    const fs = require('fs');
    const hasPsql = fs.existsSync(psqlPath);
    
    if (hasPsql) {
      console.log('✅ 检测到psql，使用管道方式导入（推荐，数据将完全存储在数据库中）\n');
      const pipeCmd = `${raster2pgsqlCmd} | PGPASSWORD="${password}" ${psqlPath} -h ${host} -p ${port} -U ${user} -d ${database}`;
      execSync(pipeCmd, {
        stdio: 'inherit',
        env: {
          ...process.env,
          PGPASSWORD: password,
        },
        shell: '/bin/bash',
      });
      console.log('\n✅ 导入完成！\n');
      // 使用psql管道方式，跳过后续的Prisma处理
      // 但需要继续执行验证步骤
    } else {
      // 如果没有psql，使用Prisma方式（需要大缓冲区）
      console.log('⚠️  未检测到psql，使用Prisma方式导入（较慢，需要大内存）\n');
      
      // 使用raster2pgsql生成SQL
      const sqlOutput = execSync(raster2pgsqlCmd, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 500, // 500MB buffer for large SQL (不使用-R时数据会很大)
      });

    // 检查SQL是否包含事务
    const hasTransaction = sqlOutput.trim().startsWith('BEGIN');
    const hasCommit = sqlOutput.includes('COMMIT');
    
    // 移除BEGIN和COMMIT，因为我们使用Prisma的事务
    let sqlToExecute = sqlOutput;
    if (hasTransaction) {
      sqlToExecute = sqlToExecute.replace(/^BEGIN;\s*/i, '');
    }
    if (hasCommit) {
      sqlToExecute = sqlToExecute.replace(/\s*COMMIT;\s*$/i, '');
    }

    // 将SQL按分号分割成多个语句，但要注意字符串中的分号
    // 简单方法：按行分割，每行应该是一个完整的语句
    const lines = sqlToExecute.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('--'));
    
    // 合并多行语句（如果一行以分号结尾，则是一条完整语句）
    const sqlStatements: string[] = [];
    let currentStatement = '';
    
    for (const line of lines) {
      currentStatement += (currentStatement ? ' ' : '') + line;
      if (line.endsWith(';')) {
        sqlStatements.push(currentStatement.slice(0, -1)); // 移除末尾分号
        currentStatement = '';
      }
    }
    
    if (currentStatement) {
      sqlStatements.push(currentStatement);
    }

    console.log(`📝 生成了 ${sqlStatements.length} 条SQL语句\n`);

    // 不使用Prisma事务，直接执行SQL（因为raster2pgsql生成的SQL已经包含事务）
    // 但Prisma不支持多条语句，所以我们需要分批执行
    let executedCount = 0;
    let errorCount = 0;
    const batchSize = 1000; // 每批1000条语句
    
    // 先执行CREATE TABLE语句（应该在前面）
    const createTableIndex = sqlStatements.findIndex(s => s.trim().toUpperCase().startsWith('CREATE'));
    if (createTableIndex >= 0) {
      try {
        await prisma.$executeRawUnsafe(sqlStatements[createTableIndex]);
        console.log('✅ CREATE TABLE 语句执行成功');
        executedCount++;
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log('⚠️  表已存在，跳过CREATE TABLE');
        } else {
          console.error('❌ CREATE TABLE 失败:', error.message);
          throw error;
        }
      }
    }
    
    // 分批执行INSERT和其他语句
    for (let batchStart = 0; batchStart < sqlStatements.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, sqlStatements.length);
      const batch = sqlStatements.slice(batchStart, batchEnd);
      
      // 跳过CREATE TABLE（已经执行）
      const statementsToExecute = batch.filter((_, idx) => batchStart + idx !== createTableIndex);
      
      for (let i = 0; i < statementsToExecute.length; i++) {
        const sql = statementsToExecute[i];
        const globalIndex = batchStart + (batchStart <= createTableIndex && createTableIndex < batchEnd ? i + 1 : i);
        
        try {
          await prisma.$executeRawUnsafe(sql);
          executedCount++;
          
          if (executedCount % 1000 === 0) {
            console.log(`   已执行 ${executedCount}/${sqlStatements.length} 条语句...`);
          }
        } catch (error: any) {
          errorCount++;
          // 某些语句可能失败（如重复键），继续执行
          if (!error.message.includes('already exists') && 
              !error.message.includes('does not exist') &&
              !error.message.includes('duplicate key') &&
              !error.message.includes('duplicate')) {
            // 只显示前10个错误，避免输出过多
            if (errorCount <= 10) {
              console.error(`⚠️  执行第 ${globalIndex + 1} 条语句时出错:`, error.message.substring(0, 100));
            }
          }
        }
      }
    }
    
    if (errorCount > 10) {
      console.log(`\n⚠️  共有 ${errorCount} 条语句执行出错（已忽略重复键等常见错误）`);
    }

      console.log(`\n✅ 导入完成！已执行 ${executedCount} 条SQL语句\n`);
    }
  } catch (error: any) {
    console.error('\n❌ 导入失败:', error.message);
    if (error.stdout) {
      console.error('输出:', error.stdout.substring(0, 500));
    }
    if (error.stderr) {
      console.error('错误输出:', error.stderr.substring(0, 500));
    }
    process.exit(1);
  }

  // 6. 验证导入结果
  console.log('🔍 验证导入结果...\n');
  try {
    const countResult: any = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM ${table};
    `);
    const count = parseInt(countResult[0].count, 10);
    console.log(`✅ 导入成功: ${count} 个瓦片`);

    // 获取栅格信息
    const infoResult: any = await prisma.$queryRawUnsafe(`
      SELECT 
        ST_Width(rast) as width,
        ST_Height(rast) as height,
        ST_ScaleX(rast) as scale_x,
        ST_ScaleY(rast) as scale_y,
        ST_SRID(rast) as srid
      FROM ${table} 
      LIMIT 1;
    `);

    if (infoResult && infoResult[0]) {
      console.log(`\n📊 栅格信息:`);
      console.log(`   宽度: ${infoResult[0].width} 像素`);
      console.log(`   高度: ${infoResult[0].height} 像素`);
      console.log(`   X 比例: ${infoResult[0].scale_x}`);
      console.log(`   Y 比例: ${infoResult[0].scale_y}`);
      console.log(`   坐标系: SRID ${infoResult[0].srid}`);
    }

    // 测试查询（雷克雅未克坐标）
    console.log(`\n🧪 测试查询（雷克雅未克）...`);
    const testLng = -21.9426;
    const testLat = 64.1466;
    
    // 如果使用ISN2016，需要转换坐标
    let testQuery: string;
    if (srid === 5327) {
      testQuery = `
        SELECT 
          ST_Value(rast, ST_Transform(ST_SetSRID(ST_MakePoint(${testLng}, ${testLat}), 4326), 5327)) as elevation
        FROM ${table} 
        WHERE ST_Intersects(rast, ST_Transform(ST_SetSRID(ST_MakePoint(${testLng}, ${testLat}), 4326), 5327))
        LIMIT 1;
      `;
    } else {
      testQuery = `
        SELECT 
          ST_Value(rast, ST_SetSRID(ST_MakePoint(${testLng}, ${testLat}), ${srid})) as elevation
        FROM ${table} 
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${testLng}, ${testLat}), ${srid}))
        LIMIT 1;
      `;
    }

    const testResult: any = await prisma.$queryRawUnsafe(testQuery);
    if (testResult && testResult[0] && testResult[0].elevation !== null) {
      console.log(`   ✅ 雷克雅未克 (${testLat}, ${testLng}): ${testResult[0].elevation}m`);
    } else {
      console.log(`   ⚠️  未找到该坐标的高程数据`);
    }

    console.log('\n✅ 验证完成！');
  } catch (error: any) {
    console.error('❌ 验证失败:', error.message);
  }
}

// 主函数
async function main() {
  try {
    const options = parseArgs();
    await importDEM(options);
  } catch (error: any) {
    console.error('❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
