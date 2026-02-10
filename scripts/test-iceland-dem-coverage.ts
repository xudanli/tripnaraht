#!/usr/bin/env tsx
/**
 * 测试冰岛 DEM 数据覆盖情况
 * 
 * 检查冰岛主要地点的 DEM 数据可用性
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DEMElevationService } from '../src/trips/dem/services/dem-elevation.service';

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

async function main() {
  log('========================================', 'blue');
  log('冰岛 DEM 数据覆盖测试', 'blue');
  log('========================================', 'blue');
  console.log('');

  const app = await NestFactory.createApplicationContext(AppModule);
  const demService = app.get(DEMElevationService);

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
      const exists = await demService.checkDEMTableExists(table);
      tableStatus[table] = exists;
      log(`  ${exists ? '✅' : '❌'} ${table}: ${exists ? '存在' : '不存在'}`, exists ? 'green' : 'red');
    }
    console.log('');

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
    }> = [];

    for (const coord of ICELAND_TEST_COORDINATES) {
      const startTime = Date.now();
      try {
        const elevation = await demService.getElevation(coord.lat, coord.lng);
        const latency = Date.now() - startTime;
        const success = elevation !== null;

        results.push({
          name: coord.name,
          lat: coord.lat,
          lng: coord.lng,
          elevation,
          success,
          latency,
        });

        if (success) {
          log(`  ✅ ${coord.name}`, 'green');
          console.log(`     坐标: (${coord.lat}, ${coord.lng})`);
          console.log(`     海拔: ${elevation}m`);
          console.log(`     延迟: ${latency}ms`);
        } else {
          log(`  ❌ ${coord.name}`, 'red');
          console.log(`     坐标: (${coord.lat}, ${coord.lng})`);
          console.log(`     结果: 查询失败（返回 null）`);
          console.log(`     延迟: ${latency}ms`);
        }
        console.log('');
      } catch (error: any) {
        const latency = Date.now() - startTime;
        log(`  ❌ ${coord.name}`, 'red');
        console.log(`     坐标: (${coord.lat}, ${coord.lng})`);
        console.log(`     错误: ${error.message}`);
        console.log(`     延迟: ${latency}ms`);
        console.log('');

        results.push({
          name: coord.name,
          lat: coord.lat,
          lng: coord.lng,
          elevation: null,
          success: false,
          latency,
        });
      }
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

    // 4. 失败点分析
    if (failCount > 0) {
      log('步骤 4: 失败点分析...', 'cyan');
      const failedPoints = results.filter(r => !r.success);
      console.log(`失败的点:\n`);
      failedPoints.forEach(point => {
        console.log(`  - ${point.name}`);
        console.log(`    坐标: (${point.lat}, ${point.lng})`);
      });
      console.log('');
    }

    // 5. 海拔范围分析
    const elevations = results.filter(r => r.success && r.elevation !== null).map(r => r.elevation!);
    let minElev: number | null = null;
    let maxElev: number | null = null;
    let avgElev: number | null = null;
    
    if (elevations.length > 0) {
      log('步骤 5: 海拔范围分析...', 'cyan');
      minElev = Math.min(...elevations);
      maxElev = Math.max(...elevations);
      avgElev = elevations.reduce((sum, e) => sum + e, 0) / elevations.length;
      console.log(`最低海拔: ${minElev}m`);
      console.log(`最高海拔: ${maxElev}m`);
      console.log(`平均海拔: ${avgElev.toFixed(1)}m`);
      console.log('');
    }

    // 6. 生成 JSON 摘要
    log('步骤 6: 生成 JSON 摘要...', 'cyan');
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
        elevationRange: elevations.length > 0 && minElev !== null && maxElev !== null && avgElev !== null ? {
          min: minElev,
          max: maxElev,
          avg: parseFloat(avgElev.toFixed(1)),
        } : null,
      },
      results: results.map(r => ({
        name: r.name,
        coordinates: { lat: r.lat, lng: r.lng },
        elevation: r.elevation,
        success: r.success,
        latency: r.latency,
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

    // 7. 总结
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
    await app.close();
  }
}

main().catch(console.error);
