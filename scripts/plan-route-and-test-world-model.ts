#!/usr/bin/env tsx
/**
 * 路线规划 + 世界模型构建测试脚本
 * 
 * 1. 创建冰岛 F 路行程（包含路线点和坐标）
 * 2. 生成路线规划（包含实际的坐标点）
 * 3. 使用世界模型构建 API 验证 DEM 证据生成
 * 4. 展示完整的路线规划和 DEM 证据
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';

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

// 冰岛 F 路关键 POI（包含详细坐标）
const FROAD_ROUTE_POINTS = [
  { name: 'Reykjavik', lat: 64.1466, lng: -21.9426, day: 1 },
  { name: 'Þingvellir', lat: 64.2553, lng: -21.1150, day: 1 },
  { name: 'Geysir', lat: 64.3167, lng: -20.3000, day: 2 },
  { name: 'Gullfoss', lat: 64.3267, lng: -20.1200, day: 2 },
  { name: 'Landmannalaugar', lat: 63.9833, lng: -19.0667, day: 3 },
  { name: 'Vík', lat: 63.4194, lng: -19.0067, day: 4 },
  { name: 'Jökulsárlón', lat: 64.0489, lng: -16.1794, day: 5 },
  { name: 'Askja 火山', lat: 65.0333, lng: -16.7500, day: 6 },
  { name: 'Mývatn', lat: 65.6036, lng: -17.0000, day: 7 },
  { name: 'Akureyri', lat: 65.6836, lng: -18.1000, day: 8 },
];

/**
 * 查找或创建 Place
 */
async function findOrCreatePlace(poi: typeof FROAD_ROUTE_POINTS[0]) {
  const existing = await prisma.place.findFirst({
    where: {
      OR: [
        { nameCN: { contains: poi.name } },
        { nameEN: { contains: poi.name } },
      ],
    },
  });

  if (existing) {
    return existing;
  }

  let city = await prisma.city.findFirst({
    where: {
      countryCode: 'IS',
      nameEN: { contains: 'Reykjavik' },
    },
  });

  if (!city) {
    city = await prisma.city.create({
      data: {
        nameCN: '雷克雅未克',
        nameEN: 'Reykjavik',
        countryCode: 'IS',
        latitude: 64.1466,
        longitude: -21.9426,
      } as any,
    });
  }

  const now = new Date();
  const place = await prisma.place.create({
    data: {
      uuid: randomUUID(),
      nameCN: poi.name,
      nameEN: poi.name,
      category: 'ATTRACTION',
      cityId: city.id,
      updatedAt: now,
      metadata: {
        countryCode: 'IS',
        coordinates: { lat: poi.lat, lng: poi.lng },
        lat: poi.lat,
        lng: poi.lng,
      } as any,
    } as any,
  });

  await prisma.$executeRaw`
    UPDATE "Place"
    SET location = ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography
    WHERE id = ${place.id}
  `;

  return place;
}

/**
 * 查询 DEM 海拔
 */
async function getElevation(lat: number, lng: number): Promise<{ 
  elevation: number | null; 
  source: string;
  latency: number;
}> {
  const start = Date.now();
  let elevation: number | null = null;
  let source = 'none';

  const isInIcelandBounds = lat >= 63.3 && lat <= 66.5 && lng >= -24.5 && lng <= -13.5;

  if (isInIcelandBounds) {
    try {
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
      // 忽略错误
    }
  }

  const latency = Date.now() - start;
  return { elevation, source, latency };
}

/**
 * 计算路线段的 DEM 证据
 */
async function calculateDEMEvidence(
  points: Array<{ lat: number; lng: number; name: string }>
): Promise<{
  segmentId: string;
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

  // 计算距离（Haversine 公式）
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

  elevationProfile.push({
    distance: distances[distances.length - 1],
    elevation: elevations[elevations.length - 1],
    slope: 0,
  });

  // 计算滚动累计爬升（3天窗口）
  const totalDistance = distances[distances.length - 1];
  const avgDailyDistance = totalDistance / 8;
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

  // 计算疲劳指数
  const fatigueIndex = (cumulativeAscent / 1000) + (maxSlopePct / 10) + (totalDistance / 100000);

  return {
    segmentId: 'iceland_froad_full_route',
    elevationProfile,
    cumulativeAscent,
    maxSlopePct,
    rollingAscent3Days,
    fatigueIndex,
  };
}

async function main() {
  log('========================================', 'blue');
  log('路线规划 + 世界模型构建测试', 'blue');
  log('========================================', 'blue');
  console.log('');

  try {
    // 步骤 1: 创建行程
    log('步骤 1: 创建冰岛 F 路行程...', 'cyan');
    const startDate = DateTime.now().plus({ days: 1 }).startOf('day');
    const endDate = startDate.plus({ days: 7 });

    const now = new Date();
    const trip = await prisma.trip.create({
      data: {
        id: `trip-iceland-froad-${Date.now()}`,
        destination: '冰岛 F 路环线',
        startDate: startDate.toJSDate(),
        endDate: endDate.toJSDate(),
        status: 'PLANNING',
        updatedAt: now,
        metadata: {
          countryCode: 'IS',
          routeType: 'F_ROAD',
          season: 7,
        } as any,
      } as any,
    });

    log(`  ✅ 行程创建成功: ${trip.id}`, 'green');
    console.log(`  开始日期: ${startDate.toFormat('yyyy-MM-dd')}`);
    console.log(`  结束日期: ${endDate.toFormat('yyyy-MM-dd')}`);
    console.log('');

    // 步骤 2: 创建行程天和行程项
    log('步骤 2: 创建行程天和行程项...', 'cyan');
    const tripDays = [];
    const routePoints: Array<{ lat: number; lng: number; name: string }> = [];

    for (let dayIndex = 0; dayIndex < 8; dayIndex++) {
      const dayDate = startDate.plus({ days: dayIndex });
      const dayPoints = FROAD_ROUTE_POINTS.filter(p => p.day === dayIndex + 1);

      const tripDay = await prisma.tripDay.create({
        data: {
          id: randomUUID(),
          tripId: trip.id,
          date: dayDate.toJSDate(),
        } as any,
      });

      tripDays.push(tripDay);

      for (let i = 0; i < dayPoints.length; i++) {
        const poi = dayPoints[i];
        const place = await findOrCreatePlace(poi);

        const startHour = 9 + i * 2;
        const startTime = dayDate.set({ hour: startHour, minute: 0 }).toJSDate();
        const endTime = dayDate.set({ hour: startHour + 2, minute: 0 }).toJSDate();

        await prisma.itineraryItem.create({
          data: {
            id: randomUUID(),
            tripDayId: tripDay.id,
            placeId: place.id,
            type: 'ACTIVITY',
            startTime: startTime,
            endTime: endTime,
            order: i + 1,
            note: `${poi.name} - 冰岛 F 路行程点`,
          } as any,
        });

        routePoints.push({ lat: poi.lat, lng: poi.lng, name: poi.name });
      }

      log(`  ✅ 第 ${dayIndex + 1} 天: ${dayPoints.length} 个行程项`, 'green');
    }
    console.log('');

    // 步骤 3: 查询路线点的 DEM 数据
    log('步骤 3: 查询路线点 DEM 数据...', 'cyan');
    const demResults = [];
    for (const point of routePoints) {
      const result = await getElevation(point.lat, point.lng);
      demResults.push({ ...point, ...result });
      
      const status = result.elevation !== null ? '✅' : '❌';
      log(`  ${status} ${point.name}: ${result.elevation !== null ? result.elevation.toFixed(1) + 'm' : 'N/A'} (${result.source})`, 
          result.elevation !== null ? 'green' : 'red');
    }
    console.log('');

    // 步骤 4: 计算 DEM 证据
    log('步骤 4: 计算路线 DEM 证据...', 'cyan');
    const demEvidence = await calculateDEMEvidence(routePoints);

    log(`  ✅ 累计爬升: ${demEvidence.cumulativeAscent.toFixed(1)}m`, 'green');
    log(`  ✅ 最大坡度: ${demEvidence.maxSlopePct.toFixed(2)}%`, 'green');
    log(`  ✅ 3天滚动累计爬升: ${demEvidence.rollingAscent3Days.toFixed(1)}m`, 'green');
    log(`  ✅ 疲劳指数: ${demEvidence.fatigueIndex.toFixed(2)}`, 'green');
    log(`  ✅ 海拔剖面点数: ${demEvidence.elevationProfile.length}`, 'green');
    console.log('');

    // 步骤 5: 测试世界模型构建 API
    log('步骤 5: 测试世界模型构建 API...', 'cyan');
    log('  提示: 使用以下命令测试世界模型 API:', 'yellow');
    console.log('');
    console.log(`  curl -X POST http://localhost:3000/api/world/buildContext \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"tripId": "${trip.id}"}' | \\`);
    console.log(`    python3 scripts/format-world-model-output.py`);
    console.log('');

    // 步骤 6: 生成完整报告
    log('步骤 6: 生成完整报告...', 'cyan');
    const report = {
      timestamp: new Date().toISOString(),
      trip: {
        id: trip.id,
        destination: trip.destination,
        startDate: startDate.toFormat('yyyy-MM-dd'),
        endDate: endDate.toFormat('yyyy-MM-dd'),
        days: tripDays.length,
        totalPoints: routePoints.length,
      },
      demData: {
        iceland20mUsage: demResults.filter(r => r.source === 'geo_dem_iceland_20m').length / demResults.length,
        successRate: demResults.filter(r => r.elevation !== null).length / demResults.length,
        avgLatency: demResults.reduce((sum, r) => sum + r.latency, 0) / demResults.length,
      },
      demEvidence: {
        segmentId: demEvidence.segmentId,
        cumulativeAscent: demEvidence.cumulativeAscent,
        maxSlopePct: demEvidence.maxSlopePct,
        rollingAscent3Days: demEvidence.rollingAscent3Days,
        fatigueIndex: demEvidence.fatigueIndex,
        elevationProfilePoints: demEvidence.elevationProfile.length,
      },
      routePoints: demResults.map(r => ({
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        elevation: r.elevation,
        source: r.source,
      })),
      elevationProfile: demEvidence.elevationProfile.map((p, i) => ({
        index: i,
        distance: p.distance,
        elevation: p.elevation,
        slope: p.slope,
      })),
    };

    console.log(JSON.stringify(report, null, 2));
    console.log('');

    // 步骤 7: 总结
    log('========================================', 'blue');
    log('✅ 路线规划完成', 'green');
    log(`✅ 行程 ID: ${trip.id}`, 'green');
    log(`✅ 路线点数: ${routePoints.length}`, 'green');
    log(`✅ DEM 证据已生成`, 'green');
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
