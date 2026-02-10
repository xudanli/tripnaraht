#!/usr/bin/env tsx
/**
 * 测试世界模型构建时使用冰岛 DEM 20m 数据
 * 
 * 此脚本模拟世界模型构建过程，验证 DEM 数据的使用
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

/**
 * 模拟 DEMElevationService.getElevation 的逻辑
 */
async function getElevation(lat: number, lng: number): Promise<{ 
  elevation: number | null; 
  source: string;
  latency: number;
}> {
  const start = Date.now();
  let elevation: number | null = null;
  let source = 'none';

  // 检查是否在冰岛范围内
  const isInIcelandBounds = lat >= 63.3 && lat <= 66.5 && lng >= -24.5 && lng <= -13.5;

  if (isInIcelandBounds) {
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
      }
    } catch (error: any) {
      if (!error.message?.includes('does not exist')) {
        console.warn(`冰岛DEM查询失败: ${error.message}`);
      }
    }
  }

  // 如果冰岛DEM查询失败，尝试其他表
  if (elevation === null) {
    try {
      const citiesResult: any = await prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
        FROM geo_dem_cities_merged
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);

      if (citiesResult?.[0]?.elevation !== null && citiesResult?.[0]?.elevation !== undefined) {
        elevation = parseFloat(citiesResult[0].elevation);
        source = 'geo_dem_cities_merged';
      }
    } catch (error: any) {
      // 忽略错误
    }
  }

  const latency = Date.now() - start;
  return { elevation, source, latency };
}

/**
 * 模拟路线海拔剖面生成（用于世界模型的 DEM 证据）
 */
async function generateElevationProfile(
  points: Array<{ lat: number; lng: number }>,
  samplingInterval: number = 100
): Promise<{
  elevationProfile: Array<{ distance: number; elevation: number; slope: number }>;
  cumulativeAscent: number;
  maxSlopePct: number;
  rollingAscent3Days: number;
  fatigueIndex: number;
}> {
  const elevations: number[] = [];
  const distances: number[] = [0];

  // 获取所有点的海拔
  for (const point of points) {
    const result = await getElevation(point.lat, point.lng);
    elevations.push(result.elevation || 0);
  }

  // 计算距离（简化版，使用 Haversine 公式）
  for (let i = 1; i < points.length; i++) {
    const lat1 = points[i - 1].lat * Math.PI / 180;
    const lat2 = points[i].lat * Math.PI / 180;
    const dLat = (points[i].lat - points[i - 1].lat) * Math.PI / 180;
    const dLng = (points[i].lng - points[i - 1].lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = 6371000 * c; // 地球半径（米）
    distances.push(distances[distances.length - 1] + distance);
  }

  // 生成详细海拔剖面
  const elevationProfile: Array<{ distance: number; elevation: number; slope: number }> = [];
  let cumulativeAscent = 0;
  let maxSlopePct = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const dist = distances[i + 1] - distances[i];
    const elevDiff = elevations[i + 1] - elevations[i];
    const slope = dist > 0 ? (elevDiff / dist) * 100 : 0;

    if (elevDiff > 0) {
      cumulativeAscent += elevDiff;
    }

    maxSlopePct = Math.max(maxSlopePct, Math.abs(slope));

    elevationProfile.push({
      distance: distances[i],
      elevation: elevations[i],
      slope,
    });
  }

  // 添加最后一个点
  elevationProfile.push({
    distance: distances[distances.length - 1],
    elevation: elevations[elevations.length - 1],
    slope: 0,
  });

  // 计算滚动累计爬升（3天窗口）
  const totalDistance = distances[distances.length - 1];
  const avgDailyDistance = totalDistance / 8; // 假设8天行程
  const rollingWindow = avgDailyDistance * 3;
  let rollingAscent3Days = 0;

  for (let i = 0; i < elevationProfile.length - 1; i++) {
    const windowStart = elevationProfile[i].distance;
    const windowEnd = windowStart + rollingWindow;
    let windowAscent = 0;

    for (let j = i; j < elevationProfile.length - 1 && elevationProfile[j].distance < windowEnd; j++) {
      const elevDiff = elevationProfile[j + 1].elevation - elevationProfile[j].elevation;
      if (elevDiff > 0) {
        windowAscent += elevDiff;
      }
    }

    rollingAscent3Days = Math.max(rollingAscent3Days, windowAscent);
  }

  // 计算疲劳指数（简化版）
  const fatigueIndex = (cumulativeAscent / 1000) + (maxSlopePct / 10) + (totalDistance / 100000);

  return {
    elevationProfile,
    cumulativeAscent,
    maxSlopePct,
    rollingAscent3Days,
    fatigueIndex,
  };
}

async function main() {
  log('========================================', 'blue');
  log('测试世界模型构建 - 使用冰岛 DEM 20m 数据', 'blue');
  log('========================================', 'blue');
  console.log('');

  try {
    // 模拟冰岛 F 路路线（简化版）
    const icelandFroadRoute = [
      { name: '起点: Reykjavik', lat: 64.1466, lng: -21.9426 },
      { name: 'Þingvellir', lat: 64.2553, lng: -21.1150 },
      { name: 'Landmannalaugar', lat: 63.9833, lng: -19.0667 },
      { name: 'Askja 火山', lat: 65.0333, lng: -16.75 },
      { name: 'Akureyri', lat: 65.6836, lng: -18.1000 },
    ];

    log('步骤 1: 测试路线点 DEM 查询...', 'cyan');
    const routeElevations = [];
    for (const point of icelandFroadRoute) {
      const result = await getElevation(point.lat, point.lng);
      routeElevations.push({ ...point, ...result });
      
      const status = result.elevation !== null ? '✅' : '❌';
      const sourceColor = result.source === 'geo_dem_iceland_20m' ? 'green' : 'yellow';
      
      log(`  ${status} ${point.name}: ${result.elevation !== null ? result.elevation.toFixed(1) + 'm' : 'N/A'} (${result.source}, ${result.latency}ms)`, 
          result.elevation !== null ? sourceColor : 'red');
    }
    console.log('');

    // 统计
    const iceland20mCount = routeElevations.filter(r => r.source === 'geo_dem_iceland_20m').length;
    const successCount = routeElevations.filter(r => r.elevation !== null).length;
    
    log('步骤 2: 生成路线海拔剖面（DEM 证据）...', 'cyan');
    const demEvidence = await generateElevationProfile(
      icelandFroadRoute.map(p => ({ lat: p.lat, lng: p.lng }))
    );

    log(`  ✅ 累计爬升: ${demEvidence.cumulativeAscent.toFixed(1)}m`, 'green');
    log(`  ✅ 最大坡度: ${demEvidence.maxSlopePct.toFixed(2)}%`, 'green');
    log(`  ✅ 3天滚动累计爬升: ${demEvidence.rollingAscent3Days.toFixed(1)}m`, 'green');
    log(`  ✅ 疲劳指数: ${demEvidence.fatigueIndex.toFixed(2)}`, 'green');
    log(`  ✅ 海拔剖面点数: ${demEvidence.elevationProfile.length}`, 'green');
    console.log('');

    // 显示海拔剖面摘要
    log('步骤 3: 海拔剖面摘要...', 'cyan');
    const profileSample = [
      demEvidence.elevationProfile[0],
      demEvidence.elevationProfile[Math.floor(demEvidence.elevationProfile.length / 2)],
      demEvidence.elevationProfile[demEvidence.elevationProfile.length - 1],
    ];
    
    for (const point of profileSample) {
      log(`  距离 ${point.distance.toFixed(0)}m: 海拔 ${point.elevation.toFixed(1)}m, 坡度 ${point.slope.toFixed(2)}%`, 'cyan');
    }
    console.log('');

    // 生成 JSON 摘要
    log('步骤 4: 生成测试摘要...', 'cyan');
    const summary = {
      timestamp: new Date().toISOString(),
      testType: 'world_model_dem_integration',
      countryCode: 'IS',
      demData: {
        iceland20mTable: 'geo_dem_iceland_20m',
        usageRate: iceland20mCount / successCount,
        successRate: successCount / icelandFroadRoute.length,
      },
      route: {
        points: routeElevations.length,
        totalDistance: demEvidence.elevationProfile[demEvidence.elevationProfile.length - 1].distance,
      },
      demEvidence: {
        cumulativeAscent: demEvidence.cumulativeAscent,
        maxSlopePct: demEvidence.maxSlopePct,
        rollingAscent3Days: demEvidence.rollingAscent3Days,
        fatigueIndex: demEvidence.fatigueIndex,
        elevationProfilePoints: demEvidence.elevationProfile.length,
      },
      routePoints: routeElevations.map(r => ({
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

    // 总结
    log('========================================', 'blue');
    if (iceland20mCount === successCount && successCount === icelandFroadRoute.length) {
      log('✅ 世界模型构建测试成功', 'green');
      log('✅ 所有路线点都使用了冰岛 DEM 20m 数据', 'green');
      log('✅ DEM 证据生成正常', 'green');
    } else {
      log('⚠️  部分测试点未使用冰岛 DEM 20m 数据', 'yellow');
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
