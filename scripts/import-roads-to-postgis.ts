#!/usr/bin/env ts-node

/**
 * 道路网络数据导入脚本
 * 
 * 将 Shapefile 格式的世界道路和铁路数据导入到 PostGIS 数据库
 * 
 * 使用方法：
 *   ts-node scripts/import-roads-to-postgis.ts [--roads <path>] [--railways <path>]
 * 
 * 示例：
 *   ts-node scripts/import-roads-to-postgis.ts --roads data/geographic/roads/roads/世界道路.shp
 */

import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import * as shapefile from 'shapefile';

const prisma = new PrismaClient();

interface ImportOptions {
  roadsPath?: string;
  railwaysPath?: string;
  srid?: number; // 目标坐标系，默认 4326
  dropExisting?: boolean; // 是否删除已存在的表
}

/**
 * 检查 Shapefile 必需文件是否存在
 */
function checkShapefileFiles(shpPath: string): boolean {
  const basePath = shpPath.replace(/\.shp$/, '');
  const requiredFiles = ['.shp', '.shx', '.dbf', '.prj'];
  
  for (const ext of requiredFiles) {
    const filePath = basePath + ext;
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 缺少必需文件: ${filePath}`);
      return false;
    }
  }
  
  return true;
}

/**
 * 获取 Shapefile 的坐标系（从 .prj 文件）
 */
function getShapefileSRID(shpPath: string): number | null {
  const prjPath = shpPath.replace(/\.shp$/, '.prj');
  
  if (!fs.existsSync(prjPath)) {
    console.warn(`⚠️  未找到 .prj 文件: ${prjPath}`);
    return null;
  }
  
  try {
    const prjContent = fs.readFileSync(prjPath, 'utf-8');
    
    // 尝试从 PRJ 文件中提取 EPSG 代码
    const epsgMatch = prjContent.match(/EPSG["\s]*["\s]*(\d+)/i);
    if (epsgMatch) {
      return parseInt(epsgMatch[1]);
    }
    
    console.warn(`⚠️  无法从 .prj 文件自动识别坐标系，将使用默认值或手动指定`);
    return null;
  } catch (error) {
    console.error(`❌ 读取 .prj 文件失败: ${prjPath}`, error);
    return null;
  }
}

/**
 * 将 GeoJSON 几何转换为 PostGIS WKT 格式
 */
function geometryToWKT(geom: any): string {
  if (!geom || !geom.type) {
    throw new Error('无效的几何对象');
  }

  switch (geom.type) {
    case 'Point':
      return `POINT(${geom.coordinates[0]} ${geom.coordinates[1]})`;
    case 'LineString':
      const lineCoords = geom.coordinates.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
      return `LINESTRING(${lineCoords})`;
    case 'Polygon':
      const rings = geom.coordinates.map((ring: number[][]) => {
        const coords = ring.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
        return `(${coords})`;
      }).join(', ');
      return `POLYGON(${rings})`;
    case 'MultiLineString':
      const lines = geom.coordinates.map((line: number[][]) => {
        const coords = line.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
        return `(${coords})`;
      }).join(', ');
      return `MULTILINESTRING(${lines})`;
    case 'MultiPolygon':
      const polygons = geom.coordinates.map((poly: number[][][]) => {
        const rings = poly.map((ring: number[][]) => {
          const coords = ring.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
          return `(${coords})`;
        }).join(', ');
        return `(${rings})`;
      }).join(', ');
      return `MULTIPOLYGON(${polygons})`;
    default:
      throw new Error(`不支持的几何类型: ${geom.type}`);
  }
}

/**
 * 使用 Node.js shapefile 库导入 Shapefile 到 PostGIS
 */
async function importShapefile(
  shpPath: string,
  tableName: string,
  srid: number = 4326,
  dropExisting: boolean = false
): Promise<void> {
  console.log(`\n📥 导入 ${tableName}...`);
  
  // 检查必需文件
  if (!checkShapefileFiles(shpPath)) {
    throw new Error(`Shapefile 文件不完整: ${shpPath}`);
  }
  
  // 获取源坐标系
  const sourceSRID = getShapefileSRID(shpPath);
  const actualSRID = sourceSRID || srid;
  
  if (sourceSRID && sourceSRID !== srid) {
    console.log(`ℹ️  检测到坐标系 EPSG:${sourceSRID}，将转换为 EPSG:${srid}`);
    console.log(`⚠️  注意：坐标系转换需要 proj4 库，当前使用源坐标系 ${actualSRID}`);
  } else if (!sourceSRID) {
    console.log(`⚠️  无法识别坐标系，将使用 EPSG:${srid}`);
  }
  
  // 如果设置了 dropExisting，先删除表
  if (dropExisting) {
    try {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
      console.log(`✅ 已删除现有表: ${tableName}`);
    } catch (error) {
      // 表可能不存在，忽略错误
    }
  }
  
  try {
    // 读取 Shapefile
    console.log(`📖 读取 Shapefile: ${shpPath}`);
    const source = await shapefile.open(shpPath);
    
    // 创建表（如果不存在）
    console.log(`📋 创建表: ${tableName}`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        gid SERIAL PRIMARY KEY,
        geom geometry,
        properties jsonb
      );
    `);
    
    // 批量插入数据
    const batchSize = 1000;
    let batch: Array<{ geom: string; properties: any }> = [];
    let totalCount = 0;
    let featureCount = 0;
    
    console.log(`📥 开始导入数据...`);
    
    let result = await source.read();
    while (!result.done) {
      const feature = result.value;
      
      if (feature && feature.geometry) {
        try {
          const wkt = geometryToWKT(feature.geometry);
          batch.push({
            geom: wkt,
            properties: feature.properties || {}
          });
          
          featureCount++;
          
          // 批量插入
          if (batch.length >= batchSize) {
            await insertBatch(tableName, batch, srid);
            totalCount += batch.length;
            console.log(`  已导入 ${totalCount} 条记录...`);
            batch = [];
          }
        } catch (error) {
          console.warn(`⚠️  跳过无效几何 (记录 ${featureCount}):`, error instanceof Error ? error.message : error);
        }
      }
      
      result = await source.read();
    }
    
    // 插入剩余数据
    if (batch.length > 0) {
      await insertBatch(tableName, batch, srid);
      totalCount += batch.length;
    }
    
    console.log(`✅ 已导入 ${totalCount} 条记录`);
    
    // 创建空间索引
    console.log(`📇 创建空间索引...`);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS ${tableName}_geom_idx 
        ON ${tableName} USING GIST (geom);
      `);
      console.log(`✅ 已创建空间索引: ${tableName}_geom_idx`);
    } catch (idxError) {
      console.log(`ℹ️  空间索引可能已存在`);
    }
    
    // 获取最终记录数
    const countResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM ${tableName};`
    );
    const count = countResult[0]?.count ? Number(countResult[0].count) : 0;
    
    console.log(`✅ 导入成功: ${tableName} (${count} 条记录)`);
    
  } catch (error) {
    console.error(`❌ 导入失败: ${tableName}`, error);
    if (error instanceof Error) {
      console.error(`错误详情: ${error.message}`);
      console.error(error.stack);
    }
    throw error;
  }
}

/**
 * 批量插入数据到 PostGIS 表
 */
async function insertBatch(
  tableName: string,
  batch: Array<{ geom: string; properties: any }>,
  srid: number
): Promise<void> {
  if (batch.length === 0) return;
  
  // 逐条插入（虽然慢一些，但更安全）
  for (const item of batch) {
    try {
      // 转义单引号
      const safeWkt = item.geom.replace(/'/g, "''");
      const safeProps = JSON.stringify(item.properties).replace(/'/g, "''");
      
      await prisma.$executeRawUnsafe(`
        INSERT INTO ${tableName} (geom, properties)
        VALUES (
          ST_SetSRID(ST_GeomFromText('${safeWkt}', ${srid}), ${srid}),
          '${safeProps}'::jsonb
        )
      `);
    } catch (error) {
      // 跳过有问题的记录，继续处理
      console.warn(`⚠️  跳过记录:`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * 创建 PostGIS 扩展（如果不存在）
 */
async function ensurePostGISExtension(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis;`);
    console.log('✅ PostGIS 扩展已就绪');
  } catch (error) {
    console.error('❌ 无法创建 PostGIS 扩展', error);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  const options: ImportOptions = {
    srid: 4326,
    dropExisting: false,
  };
  
  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--roads' && args[i + 1]) {
      options.roadsPath = args[i + 1];
      i++;
    } else if (arg === '--railways' && args[i + 1]) {
      options.railwaysPath = args[i + 1];
      i++;
    } else if (arg === '--srid' && args[i + 1]) {
      options.srid = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--drop-existing') {
      options.dropExisting = true;
    }
  }
  
  // 如果没有指定路径，尝试从默认位置查找
  const defaultRoads = path.join(process.cwd(), 'data/geographic/roads/roads/世界道路.shp');
  const defaultRailways = path.join(process.cwd(), 'data/geographic/roads/railways/世界铁路.shp');
  
  if (!options.roadsPath && fs.existsSync(defaultRoads)) {
    options.roadsPath = defaultRoads;
  }
  if (!options.railwaysPath && fs.existsSync(defaultRailways)) {
    options.railwaysPath = defaultRailways;
  }
  
  console.log('🛣️  开始导入世界道路网络数据到 PostGIS\n');
  console.log('配置:');
  console.log(`  目标坐标系: EPSG:${options.srid}`);
  console.log(`  删除现有表: ${options.dropExisting ? '是' : '否'}`);
  console.log(`  道路数据: ${options.roadsPath || '未指定'}`);
  console.log(`  铁路数据: ${options.railwaysPath || '未指定'}\n`);
  
  // 确保 PostGIS 扩展存在
  await ensurePostGISExtension();
  
  // 导入道路数据
  if (options.roadsPath) {
    await importShapefile(
      options.roadsPath,
      'geo_roads',
      options.srid,
      options.dropExisting
    );
  } else {
    console.log('⏭️  跳过道路数据（未指定路径）');
  }
  
  // 导入铁路数据
  if (options.railwaysPath) {
    await importShapefile(
      options.railwaysPath,
      'geo_railways',
      options.srid,
      options.dropExisting
    );
  } else {
    console.log('⏭️  跳过铁路数据（未指定路径）');
  }
  
  console.log('\n✅ 导入完成！');
}

// 运行主函数
main()
  .catch((error) => {
    console.error('❌ 导入失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

