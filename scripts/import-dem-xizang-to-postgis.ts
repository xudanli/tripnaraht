#!/usr/bin/env ts-node

/**
 * 导入西藏 DEM 数据到 PostGIS
 * 
 * 使用方法：
 *   npm run import:dem:xizang -- --tif data/geographic/dem/xizang/dem\ 地形.tif
 *   npm run import:dem:xizang -- --tif data/geographic/dem/xizang/dem\ 地形.tif --drop-existing
 * 
 * 功能：
 * 1. 使用 raster2pgsql 导入 DEM TIF 文件到 PostGIS
 * 2. 创建表 geo_dem_xizang
 * 3. 创建空间索引和约束
 * 
 * 注意：
 * - 需要安装 PostGIS 和 raster2pgsql 工具
 * - 如果系统没有 raster2pgsql，可以使用 GDAL Node.js 绑定（需要额外安装）
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface ImportOptions {
  tifPath: string;
  tableName?: string;
  dropExisting?: boolean;
  srid?: number;
}

/**
 * 使用 raster2pgsql 导入 DEM 数据
 */
async function importDEMWithRaster2pgsql(options: ImportOptions): Promise<void> {
  const { tifPath, tableName = 'geo_dem_xizang', dropExisting = false, srid = 4326 } = options;

  console.log('\n🔄 开始导入西藏 DEM 数据\n');
  console.log(`📁 TIF 文件: ${tifPath}`);
  console.log(`📋 表名: ${tableName}`);
  console.log(`🗺️  SRID: ${srid}\n`);

  // 检查文件是否存在
  if (!fs.existsSync(tifPath)) {
    throw new Error(`TIF 文件不存在: ${tifPath}`);
  }

  // 检查 raster2pgsql 是否可用
  try {
    execSync('which raster2pgsql', { stdio: 'ignore' });
  } catch (error) {
    throw new Error(
      'raster2pgsql 未找到。请安装 PostGIS 工具：\n' +
      '  Ubuntu/Debian: sudo apt-get install postgis\n' +
      '  macOS: brew install postgis\n' +
      '  或使用 GDAL Node.js 绑定（需要额外实现）'
    );
  }

  // 获取数据库连接信息
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 环境变量未设置');
  }

  // 解析数据库连接信息
  // 处理格式: postgresql://user:password@host:port/database?schema=public
  const urlMatch = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!urlMatch) {
    throw new Error('无法解析 DATABASE_URL');
  }
  const [, user, password, host, port, database] = urlMatch;

  try {
    // 如果 dropExisting，先删除表
    if (dropExisting) {
      console.log('🗑️  删除现有表...');
      try {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
        console.log('✅ 表已删除');
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

    if (tableExists[0]?.exists && !dropExisting) {
      console.log(`⚠️  表 ${tableName} 已存在，跳过导入。使用 --drop-existing 重新导入。`);
      return;
    }

    console.log('📥 使用 raster2pgsql 导入 DEM 数据...');
    console.log('   （这可能需要几分钟，取决于文件大小）\n');

    // 构建 raster2pgsql 命令
    // -s: SRID
    // -I: 创建 GIST 索引
    // -C: 应用栅格约束
    // -t: 瓦片大小（256x256，适合大文件）
    const raster2pgsqlCmd = [
      'raster2pgsql',
      '-s', srid.toString(),
      '-I',  // 创建空间索引
      '-C',  // 应用栅格约束
      '-t', '256x256',  // 瓦片大小
      '-F',  // 添加文件名列
      tifPath,
      tableName,
    ].join(' ');

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
      throw error;
    }

    // 验证导入（检查所有 schema）
    console.log('🔍 验证导入结果...');
    // 先检查表是否存在（可能在 public schema 或其他 schema）
    const tableCheck = await prisma.$queryRawUnsafe<Array<{ 
      schema_name: string;
      table_name: string;
    }>>(`
      SELECT table_schema as schema_name, table_name
      FROM information_schema.tables
      WHERE table_name = '${tableName}';
    `);
    
    if (tableCheck.length === 0) {
      console.warn(`⚠️  表 ${tableName} 未找到，可能导入失败或表在不同 schema`);
      console.log('💡 提示: 检查 raster2pgsql 的输出是否有错误信息\n');
      return;
    }
    
    const schema = tableCheck[0].schema_name;
    const fullTableName = schema !== 'public' ? `${schema}.${tableName}` : tableName;
    
    const countResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(*) as count FROM ${fullTableName};
    `);
    const count = Number(countResult[0]?.count || 0);
    console.log(`✅ 已导入 ${count} 个栅格瓦片到 ${fullTableName}\n`);

    // 获取栅格元数据
    const metadataResult = await prisma.$queryRawUnsafe<Array<{
      width: number;
      height: number;
      srid: number;
      scale_x: number;
      scale_y: number;
      upper_left_x: number;
      upper_left_y: number;
    }>>(`
      SELECT 
        ST_Width(rast) as width,
        ST_Height(rast) as height,
        ST_SRID(rast) as srid,
        ST_ScaleX(rast) as scale_x,
        ST_ScaleY(rast) as scale_y,
        ST_UpperLeftX(rast) as upper_left_x,
        ST_UpperLeftY(rast) as upper_left_y
      FROM ${fullTableName}
      LIMIT 1;
    `);

    if (metadataResult.length > 0) {
      const meta = metadataResult[0];
      console.log('📊 栅格元数据:');
      console.log(`   尺寸: ${meta.width} x ${meta.height}`);
      console.log(`   SRID: ${meta.srid}`);
      console.log(`   分辨率: ${Math.abs(meta.scale_x)}° x ${Math.abs(meta.scale_y)}°`);
      console.log(`   左上角: (${meta.upper_left_x}, ${meta.upper_left_y})\n`);
    }

    // 创建辅助函数：从坐标点获取海拔
    console.log('📝 创建辅助函数...');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION get_elevation_from_dem(
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        dem_table TEXT DEFAULT 'geo_dem_xizang'
      )
      RETURNS INTEGER AS $$
      DECLARE
        elevation INTEGER;
      BEGIN
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(lng, lat), 4326))::INTEGER
        INTO elevation
        FROM ${fullTableName}
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
        LIMIT 1;
        
        RETURN elevation;
      EXCEPTION
        WHEN OTHERS THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `);
    console.log('✅ 辅助函数已创建\n');

    console.log('✅ DEM 数据导入完成！\n');
    console.log('💡 使用示例:');
    console.log(`   SELECT get_elevation_from_dem(29.6544, 91.1322);  -- 拉萨坐标\n`);

  } catch (error) {
    console.error('\n❌ 导入失败:', error instanceof Error ? error.message : error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let tifPath = '';
  let dropExisting = false;
  let tableName = 'geo_dem_xizang';
  let srid = 4326;

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tif' && args[i + 1]) {
      tifPath = args[i + 1];
      i++;
    } else if (args[i] === '--table' && args[i + 1]) {
      tableName = args[i + 1];
      i++;
    } else if (args[i] === '--srid' && args[i + 1]) {
      srid = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--drop-existing') {
      dropExisting = true;
    }
  }

  if (!tifPath) {
    // 尝试默认路径
    const defaultPath = path.join(process.cwd(), 'data/geographic/dem/xizang/dem 地形.tif');
    if (fs.existsSync(defaultPath)) {
      tifPath = defaultPath;
      console.log(`📁 使用默认路径: ${tifPath}\n`);
    } else {
      console.error('❌ 错误: 未指定 TIF 文件路径');
      console.error('\n使用方法:');
      console.error('  npm run import:dem:xizang -- --tif <path-to-tif-file>');
      console.error('  npm run import:dem:xizang -- --tif <path> --drop-existing');
      console.error('\n示例:');
      console.error('  npm run import:dem:xizang -- --tif "data/geographic/dem/xizang/dem 地形.tif"');
      process.exit(1);
    }
  }

  try {
    await importDEMWithRaster2pgsql({ tifPath, tableName, dropExisting, srid });
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

