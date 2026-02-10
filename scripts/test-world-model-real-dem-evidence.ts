#!/usr/bin/env tsx
/**
 * 测试世界模型从实际行程路线生成真实 DEM 证据
 * 
 * 直接测试 WorldBuildContextSkill 的逻辑，验证：
 * 1. 能否从 ItineraryItem 提取坐标
 * 2. 能否生成真实的 DEM 证据（而非占位符）
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

async function testExtractRoutePoints(tripId: string) {
  log('========================================', 'blue');
  log('测试从行程提取路线点坐标', 'blue');
  log('========================================', 'blue');
  console.log('');

  try {
    // 1. 查询 Trip（包含 ItineraryItem 和 Place）
    log('步骤 1: 查询行程数据...', 'cyan');
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
          orderBy: {
            date: 'asc',
          },
        },
      },
    });

    if (!trip) {
      log(`❌ 行程不存在: ${tripId}`, 'red');
      return;
    }

    log(`✅ 找到行程: ${trip.destination}`, 'green');
    log(`   行程天数: ${trip.TripDay.length}`, 'green');
    console.log('');

    // 2. 提取路线点坐标
    log('步骤 2: 提取路线点坐标...', 'cyan');
    const routePoints: Array<{ lat: number; lng: number; name: string }> = [];
    let totalItems = 0;

    for (const day of trip.TripDay) {
      if (day.ItineraryItem && day.ItineraryItem.length > 0) {
        for (const item of day.ItineraryItem) {
          totalItems++;
          let lat: number | null = null;
          let lng: number | null = null;
          let name = '未知地点';

          // 优先从 Place.location 获取坐标
          if (item.Place?.id) {
            try {
              const locationResult: any = await prisma.$queryRawUnsafe(`
                SELECT 
                  ST_Y(location::geometry) as lat, 
                  ST_X(location::geometry) as lng
                FROM "Place"
                WHERE id = ${item.Place.id} AND location IS NOT NULL
              `);
              if (locationResult?.[0] && locationResult[0].lat && locationResult[0].lng) {
                lat = parseFloat(locationResult[0].lat);
                lng = parseFloat(locationResult[0].lng);
              }
            } catch (error: any) {
              // 忽略错误，尝试其他方法
            }
          }

          // 如果从 location 获取失败，尝试从 metadata
          if (!lat || !lng) {
            const itemMetadata = (item as any).metadata as any;
            const placeMetadata = item.Place?.metadata as any;
            const coords = itemMetadata?.coordinates || placeMetadata?.coordinates;
            if (coords && typeof coords === 'object' && 'lat' in coords && 'lng' in coords) {
              lat = coords.lat;
              lng = coords.lng;
            }
          }

          // 获取名称
          if (item.Place) {
            name = item.Place.nameCN || item.Place.nameEN || '未知地点';
          }

          if (lat && lng) {
            routePoints.push({ lat, lng, name });
            log(`  ✅ ${name}: (${lat.toFixed(4)}, ${lng.toFixed(4)})`, 'green');
          } else {
            log(`  ⚠️  ${name}: 无法获取坐标`, 'yellow');
          }
        }
      }
    }

    console.log('');
    log(`步骤 3: 统计结果...`, 'cyan');
    log(`  总行程项数: ${totalItems}`, 'green');
    log(`  成功提取坐标: ${routePoints.length}`, routePoints.length >= 2 ? 'green' : 'yellow');
    log(`  提取成功率: ${((routePoints.length / totalItems) * 100).toFixed(1)}%`, 'green');
    console.log('');

    // 3. 验证是否足够生成 DEM 证据
    if (routePoints.length >= 2) {
      log('✅ 路线点足够，可以生成 DEM 证据', 'green');
      console.log('');
      
      // 4. 模拟 DEM 证据生成（查询海拔）
      log('步骤 4: 查询路线点 DEM 数据...', 'cyan');
      const demResults = [];
      for (const point of routePoints) {
        const isInIcelandBounds = point.lat >= 63.3 && point.lat <= 66.5 && 
                                  point.lng >= -24.5 && point.lng <= -13.5;
        
        if (isInIcelandBounds) {
          try {
            const icelandResult: any = await prisma.$queryRawUnsafe(`
              SELECT 
                ST_Value(
                  rast, 
                  ST_Transform(ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326), 5327)
                ) as elevation
              FROM geo_dem_iceland_20m 
              WHERE ST_Intersects(
                rast, 
                ST_Transform(ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326), 5327)
              )
              LIMIT 1;
            `);

            if (icelandResult?.[0]?.elevation !== null && icelandResult?.[0]?.elevation !== undefined) {
              const elevation = parseFloat(icelandResult[0].elevation);
              demResults.push({ ...point, elevation, source: 'geo_dem_iceland_20m' });
              log(`  ✅ ${point.name}: ${elevation.toFixed(1)}m`, 'green');
            }
          } catch (error: any) {
            log(`  ⚠️  ${point.name}: DEM 查询失败`, 'yellow');
          }
        }
      }

      console.log('');
      log('步骤 5: DEM 证据生成验证...', 'cyan');
      if (demResults.length >= 2) {
        // 计算累计爬升
        let cumulativeAscent = 0;
        let maxSlopePct = 0;
        const elevations = demResults.map(r => r.elevation);

        for (let i = 1; i < elevations.length; i++) {
          const elevDiff = elevations[i] - elevations[i - 1];
          if (elevDiff > 0) {
            cumulativeAscent += elevDiff;
          }
          
          // 计算距离（简化版）
          const lat1 = demResults[i - 1].lat * Math.PI / 180;
          const lat2 = demResults[i].lat * Math.PI / 180;
          const dLat = (demResults[i].lat - demResults[i - 1].lat) * Math.PI / 180;
          const dLng = (demResults[i].lng - demResults[i - 1].lng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = 6371000 * c;
          
          if (distance > 0) {
            const slope = (elevDiff / distance) * 100;
            maxSlopePct = Math.max(maxSlopePct, Math.abs(slope));
          }
        }

        log(`  ✅ 累计爬升: ${cumulativeAscent.toFixed(1)}m`, 'green');
        log(`  ✅ 最大坡度: ${maxSlopePct.toFixed(2)}%`, 'green');
        log(`  ✅ 海拔范围: ${Math.min(...elevations).toFixed(1)}m - ${Math.max(...elevations).toFixed(1)}m`, 'green');
        log(`  ✅ DEM 证据可以生成（非占位符）`, 'green');
      } else {
        log(`  ⚠️  DEM 查询点不足，无法生成完整证据`, 'yellow');
      }
    } else {
      log('❌ 路线点不足（需要至少 2 个），将使用占位符 DEM 证据', 'red');
    }

    console.log('');
    log('========================================', 'blue');
    log('✅ 测试完成', 'green');
    log('========================================', 'blue');
    console.log('');

  } catch (error: any) {
    log(`❌ 测试失败: ${error.message}`, 'red');
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  // 获取最新的冰岛 F 路行程 ID
  const latestTrip = await prisma.trip.findFirst({
    where: {
      destination: { contains: '冰岛 F 路' },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!latestTrip) {
    log('❌ 未找到冰岛 F 路行程，请先运行路线规划脚本', 'red');
    process.exit(1);
  }

  await testExtractRoutePoints(latestTrip.id);
}

main().catch(console.error);
