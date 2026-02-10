#!/usr/bin/env tsx
/**
 * 直接测试冰岛 DEM 数据覆盖情况（不依赖 NestJS）
 * 
 * 直接查询 PostGIS 数据库检查 DEM 数据
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 冰岛主要地点坐标
const ICELAND_TEST_COORDINATES = [
  { name: '雷克雅未克 (Reykjavik)', lat: 64.1466, lng: -21.9426 },
  { name: '冰岛中心', lat: 64.5, lng: -18.5 },
  { name: 'Landmannalaugar', lat: 63.9833, lng: -19.0667 },
  { name: 'Askja 火山', lat: 65.0333, lng: -16.75 },
  { name: 'Þingvellir', lat: 64.2553, lng: -21.1150 },
  { name: 'Vík', lat: 63.4194, lng: -19.0067 },
  { name: 'Akureyri', lat: 65.6836, lng: -18.1000 },
  { name: 'Selfoss', lat: 63.9330, lng: -21.0023 },
  { name: 'F208 起点', lat: 63.9330, lng: -21.0023 },
  { name: 'F208 终点', lat: 63.9833, lng: -19.0667 },
  { name: 'F26 起点', lat: 64.2500, lng: -20.3000 },
  { name: 'F26 终点', lat: 63.9330, lng: -19.0000 },
];

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkDEMTableExists(tableName: string): Promise<boolean> {
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

async function queryDEMElevation(lat: number, lng: number): Promise<{ elevation: number | null; latency: number; source?: string }> {
  const start = Date.now();
  let elevation: number | null = null;
  let source: string | undefined;

  // 1. 优先查询 geo_dem_cities_merged
  try {
    const result: any = await prisma.$queryRawUnsafe(`
      SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))::INTEGER as elevation
      FROM geo_dem_cities_merged
      WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
      LIMIT 1;
    `);
    
    if (result?.[0]?.elevation !== null && result?.[0]?.elevation !== undefined) {
      elevation = parseInt(result[0].elevation);
      source = 'geo_dem_cities_merged';
    }
  } catch (error: any) {
    if (!error.message?.includes('does not exist')) {
      // 忽略表不存在的错误
    }
  }

  // 2. 如果城市表查询失败，查询 geo_dem_global
  if (elevation === null) {
    try {
      const result: any = await prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))::INTEGER as elevation
        FROM geo_dem_global
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);
      
      if (result?.[0]?.elevation !== null && result?.[0]?.elevation !== undefined) {
        elevation = parseInt(result[0].elevation);
        source = 'geo_dem_global';
      }
    } catch (error: any) {
      if (!error.message?.includes('does not exist')) {
        // 忽略表不存在的错误
      }
    }
  }

  const latency = Date.now() - start;
  return { elevation, latency, source };
}

async function main() {
  log('========================================', 'blue');
  log('冰岛 DEM 数据覆盖测试', 'blue');
  log('========================================', 'blue');
  console.log('');

  try {
    // 1. 检查 DEM 表是否存在
    log('步骤 1: 检查 DEM 表是否存在...', 'cyan');
    const tables = [
      'geo_dem_cities_merged',
      'geo_dem_global',
      'geo_dem_xizang',
    ];

    const tableStatus: Record<string, boolean> = {};
    for (const table of tables) {
      const exists = await checkDEMTableExists(table);
      tableStatus[table] = exists;
      log(`  ${exists ? '✅' : '❌'} ${table}: ${exists ? '存在' : '不存在'}`, exists ? 'green' : 'red');
    }
    console.log('');

    const hasDEMData = Object.values(tableStatus).some(v => v);
    if (!hasDEMData) {
      log('❌ 没有找到任何 DEM 数据表', 'red');
      console.log('');
      log('建议:', 'yellow');
      console.log('  1. 检查数据库连接');
      console.log('  2. 确认 DEM 数据已导入');
      console.log('  3. 检查表名是否正确');
      console.log('');
      return;
    }

    // 2. 测试冰岛坐标点的 DEM 查询
    log('步骤 2: 测试冰岛坐标点的 DEM 查询...', 'cyan');
    console.log(`测试 ${ICELAND_TEST_COORDINATES.length} 个坐标点\n`);

    const results: Array<{
      name: string;
      lat: number;
      lng: number;
      elevation: number | null;
      success: boolean;
      latency: number;
      source?: string;
    }> = [];

    for (const coord of ICELAND_TEST_COORDINATES) {
      const { elevation, latency, source } = await queryDEMElevation(coord.lat, coord.lng);
      const success = elevation !== null;

      results.push({
        name: coord.name,
        lat: coord.lat,
        lng: coord.lng,
        elevation,
        success,
        latency,
        source,
      });

      if (success) {
        log(`  ✅ ${coord.name}`, 'green');
        console.log(`     坐标: (${coord.lat}, ${coord.lng})`);
        console.log(`     海拔: ${elevation}m`);
        console.log(`     数据源: ${source || 'unknown'}`);
        console.log(`     延迟: ${latency}ms`);
      } else {
        log(`  ❌ ${coord.name}`, 'red');
        console.log(`     坐标: (${coord.lat}, ${coord.lng})`);
        console.log(`     结果: 查询失败（返回 null）`);
        console.log(`     延迟: ${latency}ms`);
      }
      console.log('');
    }

    // 3. 统计结果
    log('步骤 3: 统计结果...', 'cyan');
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const successRate = (successCount / results.length) * 100;
    const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;
    const successfulLatencies = results.filter(r => r.success).map(r => r.latency);
    const p50 = successfulLatencies.length > 0
      ? successfulLatencies.sort((a, b) => a - b)[Math.floor(successfulLatencies.length * 0.5)]
      : 0;
    const p95 = successfulLatencies.length > 0
      ? successfulLatencies.sort((a, b) => a - b)[Math.floor(successfulLatencies.length * 0.95)]
      : 0;

    console.log(`总测试点数: ${results.length}`);
    console.log(`成功查询: ${successCount} (${successRate.toFixed(1)}%)`);
    console.log(`失败查询: ${failCount}`);
    console.log(`平均延迟: ${avgLatency.toFixed(0)}ms`);
    if (successfulLatencies.length > 0) {
      console.log(`P50 延迟: ${p50}ms`);
      console.log(`P95 延迟: ${p95}ms`);
    }
    console.log('');

    // 4. 数据源统计
    const sourceStats: Record<string, number> = {};
    results.filter(r => r.success && r.source).forEach(r => {
      sourceStats[r.source!] = (sourceStats[r.source!] || 0) + 1;
    });
    if (Object.keys(sourceStats).length > 0) {
      log('步骤 4: 数据源统计...', 'cyan');
      Object.entries(sourceStats).forEach(([source, count]) => {
        console.log(`  ${source}: ${count} 个点`);
      });
      console.log('');
    }

    // 5. 失败点分析
    if (failCount > 0) {
      log('步骤 5: 失败点分析...', 'cyan');
      const failedPoints = results.filter(r => !r.success);
      console.log(`失败的点:\n`);
      failedPoints.forEach(point => {
        console.log(`  - ${point.name}`);
        console.log(`    坐标: (${point.lat}, ${point.lng})`);
      });
      console.log('');
    }

    // 6. 海拔范围分析
    const elevations = results.filter(r => r.success && r.elevation !== null).map(r => r.elevation!);
    if (elevations.length > 0) {
      log('步骤 6: 海拔范围分析...', 'cyan');
      const minElev = Math.min(...elevations);
      const maxElev = Math.max(...elevations);
      const avgElev = elevations.reduce((sum, e) => sum + e, 0) / elevations.length;
      console.log(`最低海拔: ${minElev}m`);
      console.log(`最高海拔: ${maxElev}m`);
      console.log(`平均海拔: ${avgElev.toFixed(1)}m`);
      console.log('');
    }

    // 7. 生成 JSON 摘要
    log('步骤 7: 生成 JSON 摘要...', 'cyan');
    const minElev = elevations.length > 0 ? Math.min(...elevations) : null;
    const maxElev = elevations.length > 0 ? Math.max(...elevations) : null;
    const avgElev = elevations.length > 0 ? elevations.reduce((sum, e) => sum + e, 0) / elevations.length : null;
    
    const summary = {
      timestamp: new Date().toISOString(),
      countryCode: 'IS',
      countryName: 'Iceland',
      demTables: tableStatus,
      testResults: {
        totalPoints: results.length,
        successCount,
        failCount,
        successRate: parseFloat(successRate.toFixed(2)),
        performance: {
          avgLatency: parseFloat(avgLatency.toFixed(0)),
          p50Latency: p50,
          p95Latency: p95,
        },
        elevationRange: elevations.length > 0 ? {
          min: minElev,
          max: maxElev,
          avg: parseFloat(avgElev!.toFixed(1)),
        } : null,
        dataSources: sourceStats,
      },
      results: results.map(r => ({
        name: r.name,
        coordinates: { lat: r.lat, lng: r.lng },
        elevation: r.elevation,
        success: r.success,
        latency: r.latency,
        source: r.source,
      })),
      recommendations: [
        ...(successRate < 50 ? [{
          issue: 'DEM数据覆盖率低',
          impact: 'HIGH',
          recommendation: '需要补充冰岛的DEM数据（建议使用SRTM或ASTER GDEM）',
          priority: 'P0',
        }] : []),
        ...(successRate >= 50 && successRate < 90 ? [{
          issue: 'DEM数据覆盖不完整',
          impact: 'MEDIUM',
          recommendation: '部分区域缺少DEM数据，建议补充缺失区域的DEM数据',
          priority: 'P1',
        }] : []),
        ...(avgLatency > 1000 ? [{
          issue: 'DEM查询性能较差',
          impact: 'MEDIUM',
          recommendation: '优化DEM查询性能，考虑添加缓存或优化PostGIS查询',
          priority: 'P2',
        }] : []),
      ],
    };

    console.log(JSON.stringify(summary, null, 2));
    console.log('');

    // 8. 总结
    log('========================================', 'blue');
    if (successRate >= 90) {
      log('✅ 冰岛 DEM 数据覆盖良好', 'green');
    } else if (successRate >= 50) {
      log('⚠️ 冰岛 DEM 数据覆盖不完整', 'yellow');
    } else {
      log('❌ 冰岛 DEM 数据覆盖不足', 'red');
    }
    log('========================================', 'blue');

  } catch (error: any) {
    log(`❌ 测试失败: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
