#!/usr/bin/env ts-node

/**
 * 导入全球 DEM 数据到 PostGIS
 * 
 * 支持三种类型的全球DEM数据：
 * 1. 主DEM（用于计算）：2025年全球范围的DEM地形数据.tif -> geo_dem_global
 * 2. TID（用于解释/置信度）：gebco_2025_tid_geotiff/*.tif -> geo_dem_global_tid
 * 3. GEBCO高程+水深（用于海洋场景）：gebco_2025_geotiff/*.tif -> geo_dem_global_gebco
 * 
 * 使用方法：
 *   # 导入主DEM（单个大文件，自动分批）
 *   npm run import:dem:global -- --main "2025年全球范围的DEM地形数据.tif"
 * 
 *   # 导入TID瓦片（目录下所有tif文件）
 *   npm run import:dem:global -- --tid-dir "gebco_2025_tid_geotiff"
 * 
 *   # 导入GEBCO瓦片（目录下所有tif文件）
 *   npm run import:dem:global -- --gebco-dir "gebco_2025_geotiff"
 * 
 *   # 导入后删除源文件
 *   npm run import:dem:global -- --main "xxx.tif" --delete-after-import
 * 
 *   # 跳过已存在的表
 *   npm run import:dem:global -- --main "xxx.tif" --skip-existing
 * 
 * 功能：
 * 1. 支持大文件分批导入（使用raster2pgsql的瓦片功能）
 * 2. 支持批量导入目录下的多个tif文件
 * 3. 导入成功后可选删除源文件
 * 4. 自动创建空间索引和约束
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface ImportOptions {
  tifPath: string;
  tableName: string;
  dropExisting?: boolean;
  skipExisting?: boolean;
  deleteAfterImport?: boolean;
  append?: boolean; // 追加模式（用于瓦片文件）
  srid?: number;
  tileSize?: string; // 瓦片大小，如 "256x256"
}

/**
 * 使用 raster2pgsql 导入 DEM 数据（支持大文件分批）
 */
async function importDEMWithRaster2pgsql(options: ImportOptions): Promise<boolean> {
  const { 
    tifPath, 
    tableName, 
    dropExisting = false, 
    skipExisting = false,
    deleteAfterImport = false,
    append = false,
    srid = 4326,
    tileSize = '256x256' // 大文件使用较小的瓦片
  } = options;

  console.log(`\n🔄 开始导入 DEM 数据\n`);
  console.log(`📁 TIF 文件: ${tifPath}`);
  console.log(`📋 表名: ${tableName}`);
  console.log(`🗺️  SRID: ${srid}`);
  console.log(`📦 瓦片大小: ${tileSize}\n`);

  // 检查文件是否存在
  if (!fs.existsSync(tifPath)) {
    console.error(`❌ TIF 文件不存在: ${tifPath}`);
    return false;
  }

  // 检查文件大小
  const stats = fs.statSync(tifPath);
  const fileSizeGB = stats.size / (1024 * 1024 * 1024);
  console.log(`📊 文件大小: ${fileSizeGB.toFixed(2)} GB\n`);

  // 检查 raster2pgsql 是否可用
  try {
    execSync('which raster2pgsql', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ raster2pgsql 未找到。请安装 PostGIS 工具：');
    console.error('  Ubuntu/Debian: sudo apt-get install postgis');
    console.error('  macOS: brew install postgis\n');
    return false;
  }

  // 获取数据库连接信息
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL 环境变量未设置');
    return false;
  }

  // 解析数据库连接信息
  const urlMatch = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!urlMatch) {
    console.error('❌ 无法解析 DATABASE_URL');
    return false;
  }
  const [, user, password, host, port, database] = urlMatch;

  try {
    // 如果 dropExisting，先删除表
    if (dropExisting) {
      console.log('🗑️  删除现有表...');
      try {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
        console.log('✅ 表已删除\n');
      } catch (error) {
        console.warn('⚠️  删除表时出错（可能不存在）:', error instanceof Error ? error.message : error);
      }
    }

    // 检查表是否已存在
    const tableExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = '${tableName}'
      );
    `);

    if (tableExists[0]?.exists) {
      if (skipExisting) {
        console.log(`⏭️  表 ${tableName} 已存在，跳过导入。\n`);
        return true;
      } else {
        console.log(`⚠️  表 ${tableName} 已存在，跳过导入。使用 --drop-existing 重新导入。\n`);
        return false;
      }
    }

    console.log('📥 使用 raster2pgsql 导入 DEM 数据...');
    console.log('   （大文件会自动分批处理，这可能需要较长时间）\n');

    // 构建 raster2pgsql 命令
    // -s: SRID
    // -I: 创建 GIST 索引（仅在创建表时）
    // -C: 应用栅格约束（仅在创建表时）
    // -t: 瓦片大小（256x256，适合大文件分批）
    // -F: 添加文件名列
    // -a: 追加模式（如果表已存在）
    const cmdParts = [
      'raster2pgsql',
      '-s', srid.toString(),
    ];
    
    // 追加模式不需要 -I 和 -C（表已存在）
    if (options.append) {
      cmdParts.push('-a'); // 追加模式
    } else {
      cmdParts.push('-I'); // 创建空间索引
      cmdParts.push('-C'); // 应用栅格约束
    }
    
    cmdParts.push(
      '-t', tileSize,  // 瓦片大小（大文件分批）
      '-F',  // 添加文件名列
      tifPath,
      tableName,
    );
    
    const raster2pgsqlCmd = cmdParts.join(' ');

    // 执行导入
    const psqlCmd = `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${user} -d ${database}`;
    const fullCmd = `${raster2pgsqlCmd} | ${psqlCmd}`;

    console.log('执行命令:', raster2pgsqlCmd);
    console.log('（输出已隐藏，请等待...）\n');

    try {
      // 使用 shell 执行命令（包含管道符）
      execSync(fullCmd, {
        stdio: 'pipe',
        shell: '/bin/bash',
        env: {
          ...process.env,
          PGPASSWORD: password,
        },
      });
      console.log('✅ DEM 数据导入成功！\n');
    } catch (error: any) {
      console.error('❌ raster2pgsql 导入失败:', error.message);
      return false;
    }

    // 验证导入
    console.log('🔍 验证导入结果...');
    const tableCheck = await prisma.$queryRawUnsafe<Array<{ 
      schema_name: string;
      table_name: string;
    }>>(`
      SELECT table_schema as schema_name, table_name
      FROM information_schema.tables
      WHERE table_name = '${tableName}';
    `);
    
    if (tableCheck.length === 0) {
      console.warn(`⚠️  表 ${tableName} 未找到，可能导入失败\n`);
      return false;
    }
    
    const schema = tableCheck[0].schema_name;
    const fullTableName = schema !== 'public' ? `${schema}.${tableName}` : tableName;
    
    const countResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(*) as count FROM ${fullTableName};
    `);
    const count = Number(countResult[0]?.count || 0);
    console.log(`✅ 已导入 ${count} 个栅格瓦片到 ${fullTableName}\n`);

    // 如果导入成功且设置了删除标志，删除源文件
    if (deleteAfterImport && count > 0) {
      console.log('🗑️  删除源文件...');
      try {
        fs.unlinkSync(tifPath);
        console.log(`✅ 已删除源文件: ${tifPath}\n`);
      } catch (error) {
        console.warn(`⚠️  删除源文件失败: ${error instanceof Error ? error.message : error}\n`);
      }
    }

    return true;
  } catch (error) {
    console.error('\n❌ 导入失败:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * 批量导入目录下的所有tif文件
 */
async function importDEMDirectory(
  dirPath: string,
  tableName: string,
  options: {
    dropExisting?: boolean;
    skipExisting?: boolean;
    deleteAfterImport?: boolean;
    srid?: number;
    tileSize?: string;
  }
): Promise<{ success: number; failed: number; skipped: number }> {
  console.log(`\n📁 扫描目录: ${dirPath}\n`);

  if (!fs.existsSync(dirPath)) {
    console.error(`❌ 目录不存在: ${dirPath}`);
    return { success: 0, failed: 0, skipped: 0 };
  }

  // 获取所有tif文件
  const files = fs.readdirSync(dirPath)
    .filter(file => file.toLowerCase().endsWith('.tif'))
    .map(file => path.join(dirPath, file))
    .sort();

  if (files.length === 0) {
    console.log('⚠️  目录下未找到 .tif 文件\n');
    return { success: 0, failed: 0, skipped: 0 };
  }

  console.log(`📊 找到 ${files.length} 个 .tif 文件\n`);

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

    // 逐个导入（对于瓦片文件，可以追加到同一个表）
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileNum = i + 1;
      
      console.log(`[${fileNum}/${files.length}] 📥 导入: ${path.basename(file)}`);

      // 检查表是否已存在
      const tableExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = '${tableName}'
        );
      `);
      
      const isFirstFile = i === 0;
      const shouldAppend = tableExists[0]?.exists && !isFirstFile;
      
      const importOptions: ImportOptions = {
        tifPath: file,
        tableName,
        dropExisting: isFirstFile ? options.dropExisting : false,
        skipExisting: shouldAppend, // 如果表已存在且不是第一个文件，跳过检查（使用追加模式）
        append: shouldAppend, // 追加模式
        deleteAfterImport: options.deleteAfterImport,
        srid: options.srid || 4326,
        tileSize: options.tileSize || '256x256',
      };

      const success = await importDEMWithRaster2pgsql(importOptions);
      
      if (success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

  console.log(`\n📊 批量导入统计:`);
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ⏭️  跳过: ${skippedCount}`);
  console.log(`   ❌ 失败: ${failedCount}`);
  console.log(`   📝 总计: ${files.length}\n`);

  return { success: successCount, failed: failedCount, skipped: skippedCount };
}

async function main() {
  const args = process.argv.slice(2);
  let mainTifPath = '';
  let tidDir = '';
  let gebcoDir = '';
  let dropExisting = false;
  let skipExisting = false;
  let deleteAfterImport = false;
  let srid = 4326;
  let tileSize = '256x256';

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--main' && args[i + 1]) {
      mainTifPath = args[i + 1];
      i++;
    } else if (args[i] === '--tid-dir' && args[i + 1]) {
      tidDir = args[i + 1];
      i++;
    } else if (args[i] === '--gebco-dir' && args[i + 1]) {
      gebcoDir = args[i + 1];
      i++;
    } else if (args[i] === '--drop-existing') {
      dropExisting = true;
    } else if (args[i] === '--skip-existing') {
      skipExisting = true;
    } else if (args[i] === '--delete-after-import') {
      deleteAfterImport = true;
    } else if (args[i] === '--srid' && args[i + 1]) {
      srid = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--tile-size' && args[i + 1]) {
      tileSize = args[i + 1];
      i++;
    }
  }

  if (!mainTifPath && !tidDir && !gebcoDir) {
    console.error('❌ 错误: 未指定要导入的文件或目录');
    console.error('\n使用方法:');
    console.error('  # 导入主DEM');
    console.error('  npm run import:dem:global -- --main "2025年全球范围的DEM地形数据.tif"');
    console.error('');
    console.error('  # 导入TID瓦片目录');
    console.error('  npm run import:dem:global -- --tid-dir "gebco_2025_tid_geotiff"');
    console.error('');
    console.error('  # 导入GEBCO瓦片目录');
    console.error('  npm run import:dem:global -- --gebco-dir "gebco_2025_geotiff"');
    console.error('');
    console.error('  # 导入后删除源文件');
    console.error('  npm run import:dem:global -- --main "xxx.tif" --delete-after-import');
    console.error('');
    console.error('  # 跳过已存在的表');
    console.error('  npm run import:dem:global -- --main "xxx.tif" --skip-existing');
    process.exit(1);
  }

  try {
    // 导入主DEM
    if (mainTifPath) {
      const success = await importDEMWithRaster2pgsql({
        tifPath: mainTifPath,
        tableName: 'geo_dem_global',
        dropExisting,
        skipExisting,
        deleteAfterImport,
        srid,
        tileSize,
      });
      
      if (!success) {
        console.error('❌ 主DEM导入失败');
        process.exit(1);
      }
    }

    // 导入TID目录
    if (tidDir) {
      await importDEMDirectory(tidDir, 'geo_dem_global_tid', {
        dropExisting,
        skipExisting,
        deleteAfterImport,
        srid,
        tileSize,
      });
    }

    // 导入GEBCO目录
    if (gebcoDir) {
      await importDEMDirectory(gebcoDir, 'geo_dem_global_gebco', {
        dropExisting,
        skipExisting,
        deleteAfterImport,
        srid,
        tileSize,
      });
    }

    console.log('✅ 全球DEM数据导入完成！\n');
    console.log('💡 提示:');
    console.log('  - 主DEM表: geo_dem_global');
    console.log('  - TID表: geo_dem_global_tid');
    console.log('  - GEBCO表: geo_dem_global_gebco');
    console.log('  - DEMElevationService 会自动使用全球DEM作为最终后备\n');

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

