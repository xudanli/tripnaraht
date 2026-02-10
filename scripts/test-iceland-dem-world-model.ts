#!/usr/bin/env tsx
/**
 * 测试冰岛 DEM 20m 数据和世界模型构建
 * 
 * 1. 测试 DEM 查询（使用新的 20m 精度数据）
 * 2. 构建世界模型
 * 3. 验证 DEM 证据生成
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 冰岛测试坐标
const ICELAND_TEST_COORDINATES = [
  { name: '雷克雅未克', lat: 64.1466, lng: -21.9426 },
  { name: 'Landmannalaugar', lat: 63.9833, lng: -19.0667 },
  { name: 'Askja 火山', lat: 65.0333, lng: -16.75 },
  { name: 'Þingvellir', lat: 64.2553, lng: -21.1150 },
  { name: 'Vík', lat: 63.4194, lng: -19.0067 },
  { name: 'Akureyri', lat: 65.6836, lng: -18.1000 },
];

/**
 * 查询 DEM 海拔（直接查询 PostGIS）
 */
async function queryDEMElevation(lat: number, lng: number): Promise<{ 
  elevation: number | null; 
  latency: number;
  source: string;
}> {
  const start = Date.now();
  let elevation: number | null = null;
  let source = 'none';

  try {
    // 1. 优先查询冰岛 20m DEM（使用 ISN2016 坐标系）
    const icelandResult: any = await prisma.$queryRawUnsafe(`
      SELECT 
        ST_Value(
          rast, 
          ST_Transform(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), 5327)
        ) as elevation
      FROM geo_dem_iceland_20m 
      WHERE ST_Intersects(
        rast, 
        ST_Transform(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), 5327)
      )
      LIMIT 1;
    `);

    if (icelandResult?.[0]?.elevation !== null && icelandResult?.[0]?.elevation !== undefined) {
      elevation = parseFloat(icelandResult[0].elevation);
      source = 'geo_dem_iceland_20m';
    } else {
      // 2. 后备：查询 geo_dem_cities_merged
      const citiesResult: any = await prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
        FROM geo_dem_cities_merged
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);

      if (citiesResult?.[0]?.elevation !== null && citiesResult?.[0]?.elevation !== undefined) {
        elevation = parseFloat(citiesResult[0].elevation);
        source = 'geo_dem_cities_merged';
      } else {
        // 3. 最终后备：查询 geo_dem_global
        const globalResult: any = await prisma.$queryRawUnsafe(`
          SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
          FROM geo_dem_global
          WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
          LIMIT 1;
        `);

        if (globalResult?.[0]?.elevation !== null && globalResult?.[0]?.elevation !== undefined) {
          elevation = parseFloat(globalResult[0].elevation);
          source = 'geo_dem_global';
        }
      }
    }
  } catch (error: any) {
    if (!error.message?.includes('does not exist')) {
      console.warn(`查询DEM失败 (${lat}, ${lng}):`, error.message);
    }
  }

  const latency = Date.now() - start;
  return { elevation, latency, source };
}

async function main() {
  log('========================================', 'blue');
  log('测试冰岛 DEM 20m 数据和世界模型构建', 'blue');
  log('========================================', 'blue');
  console.log('');

  try {
    // 1. 检查 DEM 表
    log('步骤 1: 检查 DEM 表...', 'cyan');
    const icelandTableExists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'geo_dem_iceland_20m'
      );
    `) as Array<{ exists: boolean }>;

    let tileCount = 0;
    if (icelandTableExists[0]?.exists) {
      const tileCountResult: any = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM geo_dem_iceland_20m;
      `);
      tileCount = parseInt(tileCountResult[0]?.count || '0');
      log(`✅ geo_dem_iceland_20m 表存在，瓦片数: ${tileCount}`, 'green');
    } else {
      log('⚠️  geo_dem_iceland_20m 表不存在', 'yellow');
    }
    console.log('');

    // 2. 测试 DEM 查询
    log('步骤 2: 测试 DEM 查询...', 'cyan');
    const demResults = [];
    for (const coord of ICELAND_TEST_COORDINATES) {
      const result = await queryDEMElevation(coord.lat, coord.lng);
      demResults.push({ ...coord, ...result });
      
      const status = result.elevation !== null ? '✅' : '❌';
      const sourceColor = result.source === 'geo_dem_iceland_20m' ? 'green' : 
                         result.source === 'geo_dem_cities_merged' ? 'yellow' :
                         result.source === 'geo_dem_global' ? 'yellow' : 'red';
      
      log(`  ${status} ${coord.name}: ${result.elevation !== null ? result.elevation.toFixed(1) + 'm' : 'N/A'} (${result.latency}ms, ${result.source})`, 
          result.elevation !== null ? sourceColor : 'red');
    }
    console.log('');

    // 3. 统计结果
    const successCount = demResults.filter(r => r.elevation !== null).length;
    const iceland20mCount = demResults.filter(r => r.source === 'geo_dem_iceland_20m').length;
    const avgLatency = demResults.reduce((sum, r) => sum + r.latency, 0) / demResults.length;
    const elevations = demResults.filter(r => r.elevation !== null).map(r => r.elevation!);
    
    log('步骤 3: 统计结果...', 'cyan');
    console.log(`  成功率: ${successCount}/${ICELAND_TEST_COORDINATES.length} (${(successCount / ICELAND_TEST_COORDINATES.length * 100).toFixed(1)}%)`);
    console.log(`  使用冰岛20m DEM: ${iceland20mCount}/${successCount} (${iceland20mCount > 0 ? (iceland20mCount / successCount * 100).toFixed(1) + '%' : '0%'})`);
    console.log(`  平均延迟: ${avgLatency.toFixed(1)}ms`);
    
    if (elevations.length > 0) {
      const minElev = Math.min(...elevations);
      const maxElev = Math.max(...elevations);
      const avgElev = elevations.reduce((sum, e) => sum + e, 0) / elevations.length;
      console.log(`  海拔范围: ${minElev.toFixed(1)}m - ${maxElev.toFixed(1)}m`);
      console.log(`  平均海拔: ${avgElev.toFixed(1)}m`);
    }
    console.log('');

    // 4. 测试世界模型构建（通过 API）
    log('步骤 4: 测试世界模型构建...', 'cyan');
    log('  提示: 使用以下命令测试世界模型 API:', 'yellow');
    console.log('');
    console.log('  curl -X POST http://localhost:3000/api/world/buildContext \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"countryCode": "IS", "season": 7, "duration": 8, "partyProfile": {"fitness": "high", "pace": "moderate", "riskTolerance": "high"}}\' | \\');
    console.log('    python3 scripts/format-world-model-output.py');
    console.log('');

    // 5. 生成 JSON 摘要
    log('步骤 5: 生成测试摘要...', 'cyan');
    const summary = {
      timestamp: new Date().toISOString(),
      demTable: {
        exists: icelandTableExists[0]?.exists || false,
        tileCount: icelandTableExists[0]?.exists ? tileCount[0]?.count : 0,
      },
      testResults: {
        totalPoints: ICELAND_TEST_COORDINATES.length,
        successCount,
        successRate: successCount / ICELAND_TEST_COORDINATES.length,
        iceland20mCount,
        iceland20mRate: iceland20mCount / successCount || 0,
        avgLatency,
        elevationRange: elevations.length > 0 ? {
          min: Math.min(...elevations),
          max: Math.max(...elevations),
          avg: elevations.reduce((sum, e) => sum + e, 0) / elevations.length,
        } : null,
      },
      coordinates: demResults.map(r => ({
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        elevation: r.elevation,
        source: r.source,
        latency: r.latency,
      })),
    };

    console.log(JSON.stringify(summary, null, 2));
    console.log('');

    // 6. 总结
    log('========================================', 'blue');
    if (iceland20mCount > 0) {
      log('✅ 冰岛 DEM 20m 数据工作正常', 'green');
    } else {
      log('⚠️  冰岛 DEM 20m 数据未使用（可能查询失败）', 'yellow');
    }
    log('========================================', 'blue');
    console.log('');

  } catch (error: any) {
    log(`❌ 测试失败: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
