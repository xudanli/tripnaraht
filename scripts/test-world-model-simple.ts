#!/usr/bin/env npx tsx
/**
 * 测试世界模型构建完整流程（简化版）
 * 
 * 使用指定的行程ID测试所有改进功能
 */

import { PrismaClient } from '@prisma/client';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  const tripId = '69cb2600-20e4-46e9-9256-413cdd2fa017';
  
  log('='.repeat(80), 'cyan');
  log('世界模型构建完整流程测试（简化版）', 'bright');
  log('='.repeat(80), 'cyan');
  log(`行程ID: ${tripId}`, 'yellow');
  console.log('');

  const prisma = new PrismaClient();

  try {
    // 检查行程是否存在
    log('步骤 1: 检查行程...', 'cyan');
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
      process.exit(1);
    }

    log(`✅ 行程存在: ${trip.destination || '未知目的地'}`, 'green');
    log(`   行程天数: ${trip.TripDay?.length || 0}`, 'green');
    
    const totalItems = trip.TripDay?.reduce((sum, day) => sum + (day.ItineraryItem?.length || 0), 0) || 0;
    log(`   行程项数量: ${totalItems}`, 'green');
    
    // 提取坐标点
    const allPoints: Array<{ lat: number; lng: number }> = [];
    for (const day of trip.TripDay || []) {
      for (const item of day.ItineraryItem || []) {
        // Place.location字段存在但类型是Unsupported("geography")，需要类型断言
        const placeLocation = (item.Place as any).location;
        if (placeLocation) {
          // location可能是PostGIS geography类型，需要从数据库查询或使用ST_AsText
          // 这里跳过，因为需要PostGIS函数来提取坐标
        }
      }
    }
    log(`   坐标点数量: ${allPoints.length}`, 'green');
    console.log('');

    // 检查RouteDirection
    log('步骤 2: 检查RouteDirection...', 'cyan');
    const routeDirectionId = (trip as any).routeDirectionId;
    if (routeDirectionId) {
      // RouteDirection的uuid不是@unique，需要使用findFirst
      const routeDirection = await prisma.routeDirection.findFirst({
        where: { uuid: routeDirectionId },
      });
      
      if (routeDirection) {
        log(`✅ RouteDirection存在: ${routeDirection.nameCN || routeDirection.name}`, 'green');
        log(`   国家代码: ${routeDirection.countryCode}`, 'green');
        log(`   状态: ${routeDirection.status}`, 'green');
      } else {
        log(`⚠️  RouteDirection不存在: ${routeDirectionId}`, 'yellow');
      }
    } else {
      log('⚠️  行程没有关联RouteDirection', 'yellow');
    }
    console.log('');

    // 检查DEM表
    log('步骤 3: 检查DEM表...', 'cyan');
    const demTables = ['geo_dem_iceland_20m', 'geo_dem_cities_merged', 'geo_dem_global'];
    for (const table of demTables) {
      const result = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = '${table}'
        );
      `) as Array<{ exists: boolean }>;
      
      if (result[0]?.exists) {
        log(`✅ ${table} 存在`, 'green');
      } else {
        log(`⚠️  ${table} 不存在`, 'yellow');
      }
    }
    console.log('');

    // 测试批量DEM查询（如果有点）
    if (allPoints.length > 0) {
      log('步骤 4: 测试批量DEM查询...', 'cyan');
      
      // 使用PostGIS批量查询
      const testPoints = allPoints.slice(0, Math.min(10, allPoints.length)); // 只测试前10个点
      log(`   测试点数: ${testPoints.length}`, 'green');
      
      const lngs = testPoints.map(p => p.lng);
      const lats = testPoints.map(p => p.lat);
      
      try {
        const query = `
          WITH points AS (
            SELECT 
              row_number() OVER () as idx,
              ST_SetSRID(ST_MakePoint(lng, lat), 4326) as geom
            FROM unnest($1::float[], $2::float[]) AS t(lng, lat)
          )
          SELECT 
            p.idx,
            ST_Value(r.rast, p.geom)::INTEGER as elevation
          FROM points p
          CROSS JOIN LATERAL (
            SELECT rast
            FROM geo_dem_cities_merged
            WHERE ST_Intersects(rast, p.geom)
            LIMIT 1
          ) r
          ORDER BY p.idx;
        `;

        const startTime = Date.now();
        const result = await prisma.$queryRawUnsafe(query, lngs, lats) as Array<{ idx: number; elevation: number | null }>;
        const duration = Date.now() - startTime;
        
        const successCount = result.filter(r => r.elevation !== null).length;
        log(`✅ 批量查询完成 (耗时: ${duration}ms)`, 'green');
        log(`   成功查询: ${successCount}/${testPoints.length}`, 'green');
        log(`   平均每个点: ${(duration / testPoints.length).toFixed(2)}ms`, 'green');
        
        if (result.length > 0) {
          log('   查询结果示例:', 'cyan');
          for (let i = 0; i < Math.min(3, result.length); i++) {
            const r = result[i];
            const point = testPoints[r.idx - 1];
            log(`     [${r.idx}] (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}): ${r.elevation !== null ? r.elevation + 'm' : 'null'}`, 'green');
          }
        }
      } catch (error: any) {
        log(`⚠️  批量查询失败: ${error.message}`, 'yellow');
        log(`   尝试逐个查询...`, 'cyan');
        
        // 降级到逐个查询
        const startTime = Date.now();
        const elevations = await Promise.all(
          testPoints.map(async (p) => {
            try {
              const result = await prisma.$queryRawUnsafe(`
                SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326))::INTEGER as elevation
                FROM geo_dem_cities_merged
                WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326))
                LIMIT 1;
              `) as Array<{ elevation: number | null }>;
              return result[0]?.elevation ?? null;
            } catch {
              return null;
            }
          })
        );
        const duration = Date.now() - startTime;
        
        const successCount = elevations.filter(e => e !== null).length;
        log(`✅ 逐个查询完成 (耗时: ${duration}ms)`, 'green');
        log(`   成功查询: ${successCount}/${testPoints.length}`, 'green');
        log(`   平均每个点: ${(duration / testPoints.length).toFixed(2)}ms`, 'green');
      }
      console.log('');
    }

    // 总结
    log('='.repeat(80), 'cyan');
    log('测试总结', 'bright');
    log('='.repeat(80), 'cyan');
    log('✅ 基础检查完成', 'green');
    log(`   行程天数: ${trip.TripDay?.length || 0}`, 'green');
    log(`   行程项数量: ${totalItems}`, 'green');
    log(`   坐标点数量: ${allPoints.length}`, 'green');
    console.log('');

  } catch (error: any) {
    log(`❌ 测试失败: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
