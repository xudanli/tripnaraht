#!/usr/bin/env ts-node

/**
 * 将 OSM POI 数据导入到 PostGIS
 * 
 * 使用方法：
 *   ts-node scripts/import-osm-poi-to-postgis.ts [--input <path>] [--drop-existing]
 * 
 * 示例：
 *   ts-node scripts/import-osm-poi-to-postgis.ts --input data/geographic/poi/osm/svalbard/raw/poi.json
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface OSMPOI {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
  // 区域信息（可选，在抓取时添加）
  region_key?: string;
  region_name?: string;
  region_center?: { lat: number; lng: number };
}

/**
 * 创建原始 OSM POI 表
 */
async function createRawTable(dropExisting: boolean = false): Promise<void> {
  if (dropExisting) {
    try {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS poi_osm_raw CASCADE;`);
      console.log('✅ 已删除现有表: poi_osm_raw');
    } catch (error) {
      // 表可能不存在，忽略错误
    }
  }
  
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS poi_osm_raw (
      id SERIAL PRIMARY KEY,
      osm_type VARCHAR(10) NOT NULL,
      osm_id BIGINT NOT NULL,
      geom geometry(Point, 4326),
      tags jsonb NOT NULL,
      version INTEGER,
      timestamp TIMESTAMP,
      region_key VARCHAR(50),
      region_name VARCHAR(100),
      region_center jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(osm_type, osm_id)
    );
  `);
  
  // 创建索引
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS poi_osm_raw_geom_idx 
    ON poi_osm_raw USING GIST (geom);
  `);
  
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS poi_osm_raw_tags_idx 
    ON poi_osm_raw USING GIN (tags);
  `);
  
  console.log('✅ 已创建表: poi_osm_raw');
}

/**
 * 获取 POI 坐标
 */
function getPOICoordinates(poi: OSMPOI): { lat: number; lng: number } | null {
  if (poi.type === 'node' && poi.lat && poi.lon) {
    return { lat: poi.lat, lng: poi.lon };
  }
  if (poi.center) {
    return { lat: poi.center.lat, lng: poi.center.lon };
  }
  if (poi.lat && poi.lon) {
    return { lat: poi.lat, lng: poi.lon };
  }
  return null;
}

/**
 * 导入 OSM POI 数据
 */
async function importOSMPOI(inputPath: string, dropExisting: boolean = false): Promise<void> {
  console.log(`\n📥 导入 OSM POI 数据...`);
  console.log(`  输入文件: ${inputPath}`);
  
  if (!fs.existsSync(inputPath)) {
    throw new Error(`文件不存在: ${inputPath}`);
  }
  
  // 读取 JSON 文件
  const fileContent = fs.readFileSync(inputPath, 'utf-8');
  const pois: OSMPOI[] = JSON.parse(fileContent);
  
  console.log(`  读取到 ${pois.length} 个 POI\n`);
  
  // 创建表
  await createRawTable(dropExisting);
  
  // 批量插入
  const batchSize = 100;
  let imported = 0;
  let skipped = 0;
  
  for (let i = 0; i < pois.length; i += batchSize) {
    const batch = pois.slice(i, i + batchSize);
    
    for (const poi of batch) {
      const coords = getPOICoordinates(poi);
      
      if (!coords) {
        skipped++;
        continue;
      }
      
      try {
        // 提取版本和时间戳（如果有）
        const version = poi.tags['version'] ? parseInt(poi.tags['version']) : null;
        const timestamp = poi.tags['timestamp'] ? new Date(poi.tags['timestamp']) : null;
        
        // 提取区域信息
        const regionKey = (poi as any).region_key || null;
        const regionName = (poi as any).region_name || null;
        const regionCenter = (poi as any).region_center ? JSON.stringify((poi as any).region_center) : null;
        
        await prisma.$executeRawUnsafe(`
          INSERT INTO poi_osm_raw (osm_type, osm_id, geom, tags, version, timestamp, region_key, region_name, region_center)
          VALUES (
            '${poi.type}',
            ${poi.id},
            ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326),
            '${JSON.stringify(poi.tags).replace(/'/g, "''")}'::jsonb,
            ${version || 'NULL'},
            ${timestamp ? `'${timestamp.toISOString()}'` : 'NULL'},
            ${regionKey ? `'${regionKey}'` : 'NULL'},
            ${regionName ? `'${regionName.replace(/'/g, "''")}'` : 'NULL'},
            ${regionCenter ? `'${regionCenter.replace(/'/g, "''")}'::jsonb` : 'NULL'}
          )
          ON CONFLICT (osm_type, osm_id) DO UPDATE
          SET tags = EXCLUDED.tags,
              version = EXCLUDED.version,
              timestamp = EXCLUDED.timestamp,
              region_key = COALESCE(EXCLUDED.region_key, poi_osm_raw.region_key),
              region_name = COALESCE(EXCLUDED.region_name, poi_osm_raw.region_name),
              region_center = COALESCE(EXCLUDED.region_center, poi_osm_raw.region_center);
        `);
        
        imported++;
      } catch (error) {
        console.warn(`⚠️  跳过 POI ${poi.type}:${poi.id}:`, error instanceof Error ? error.message : error);
        skipped++;
      }
    }
    
    if ((i + batchSize) % 500 === 0 || i + batchSize >= pois.length) {
      console.log(`  已导入 ${imported} 条，跳过 ${skipped} 条...`);
    }
  }
  
  // 获取最终记录数
  const countResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM poi_osm_raw;`
  );
  const count = countResult[0]?.count ? Number(countResult[0].count) : 0;
  
  console.log(`\n✅ 导入完成: ${imported} 条新记录，${skipped} 条跳过`);
  console.log(`   总记录数: ${count} 条`);
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
  
  let inputPath = path.join(process.cwd(), 'data/geographic/poi/osm/svalbard/raw/poi.json');
  let dropExisting = false;
  
  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    } else if (arg === '--drop-existing') {
      dropExisting = true;
    }
  }
  
  console.log('🗺️  开始导入 OSM POI 数据到 PostGIS\n');
  console.log('配置:');
  console.log(`  输入文件: ${inputPath}`);
  console.log(`  删除现有表: ${dropExisting ? '是' : '否'}\n`);
  
  // 确保 PostGIS 扩展存在
  await ensurePostGISExtension();
  
  // 导入数据
  await importOSMPOI(inputPath, dropExisting);
  
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

