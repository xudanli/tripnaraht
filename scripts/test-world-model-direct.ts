#!/usr/bin/env npx tsx
/**
 * 直接测试世界模型构建（最小依赖）
 * 
 * 使用指定的行程ID测试核心功能
 */

import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

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
  log('世界模型构建完整流程测试（直接测试）', 'bright');
  log('='.repeat(80), 'cyan');
  log(`行程ID: ${tripId}`, 'yellow');
  console.log('');

  const prisma = new PrismaClient();

  try {
    // 1. 检查行程
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
    log(`   行程项数量: ${trip.TripDay?.reduce((sum, day) => sum + (day.ItineraryItem?.length || 0), 0) || 0}`, 'green');
    
    // 提取国家代码和季节
    const countryCode = trip.destination || 'IS';
    const season = trip.startDate ? new Date(trip.startDate).getMonth() + 1 : 7;
    log(`   国家代码: ${countryCode}`, 'green');
    log(`   季节: ${season}月`, 'green');
    console.log('');

    // 2. 检查RouteDirection
    log('步骤 2: 检查RouteDirection...', 'cyan');
    const routeDirectionId = (trip as any).routeDirectionId;
    
    let routeDirection = null;
    if (routeDirectionId) {
      // RouteDirection的uuid不是@unique，需要使用findFirst
      routeDirection = await prisma.routeDirection.findFirst({
        where: { uuid: routeDirectionId },
      });
    }
    
    if (!routeDirection) {
      // 尝试从国家代码查找
      const routeDirections = await prisma.routeDirection.findMany({
        where: {
          countryCode: countryCode,
          status: 'active',
        },
        take: 1,
      });
      routeDirection = routeDirections[0] || null;
    }
    
    if (routeDirection) {
      log(`✅ RouteDirection存在: ${routeDirection.nameCN || routeDirection.name}`, 'green');
      log(`   UUID: ${routeDirection.uuid}`, 'green');
      log(`   国家代码: ${routeDirection.countryCode}`, 'green');
      
      // 检查corridorGeom
      const corridorGeom = (routeDirection as any).corridorGeom;
      if (corridorGeom) {
        log(`   ✅ 有corridorGeom（可用于DEM证据生成）`, 'green');
      } else {
        log(`   ⚠️  没有corridorGeom`, 'yellow');
      }
    } else {
      log(`⚠️  RouteDirection不存在`, 'yellow');
    }
    console.log('');

    // 3. 检查数据文件
    log('步骤 3: 检查数据文件...', 'cyan');
    const dataBasePath = path.join(process.cwd(), 'data', 'physical-reality');
    
    // 特殊处理：冰岛使用iceland而不是is
    const countryName = countryCode.toUpperCase() === 'IS' ? 'iceland' : countryCode.toLowerCase();
    const roadStatusPath = path.join(dataBasePath, 'road-status', `${countryName}-road-status.json`);
    const weatherWindowsPath = path.join(dataBasePath, 'weather-windows', `${countryName}-weather-windows.json`);
    const ferrySchedulesPath = path.join(dataBasePath, 'ferry-schedules', `${countryName}-ferry-schedules.json`);
    
    if (fs.existsSync(roadStatusPath)) {
      log(`✅ 道路状态文件存在: ${roadStatusPath}`, 'green');
      const roadStatusData = JSON.parse(fs.readFileSync(roadStatusPath, 'utf-8'));
      log(`   道路数量: ${roadStatusData.roads?.length || 0}`, 'green');
    } else {
      log(`⚠️  道路状态文件不存在: ${roadStatusPath}`, 'yellow');
    }
    
    if (fs.existsSync(weatherWindowsPath)) {
      log(`✅ 天气窗口文件存在: ${weatherWindowsPath}`, 'green');
    } else {
      log(`⚠️  天气窗口文件不存在: ${weatherWindowsPath}`, 'yellow');
    }
    
    if (fs.existsSync(ferrySchedulesPath)) {
      log(`✅ 渡轮时刻表文件存在: ${ferrySchedulesPath}`, 'green');
    } else {
      log(`⚠️  渡轮时刻表文件不存在: ${ferrySchedulesPath}`, 'yellow');
    }
    console.log('');

    // 4. 检查DEM表
    log('步骤 4: 检查DEM表...', 'cyan');
    const demTables = ['geo_dem_iceland_20m', 'geo_dem_cities_merged', 'geo_dem_global'];
    const existingTables: string[] = [];
    
    for (const table of demTables) {
      const result = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = '${table}'
        );
      `) as Array<{ exists: boolean }>;
      
      if (result[0]?.exists) {
        log(`✅ ${table} 存在`, 'green');
        existingTables.push(table);
      } else {
        log(`⚠️  ${table} 不存在`, 'yellow');
      }
    }
    console.log('');

    // 5. 测试批量DEM查询（如果有RouteDirection和corridorGeom）
    if (routeDirection && (routeDirection as any).corridorGeom && existingTables.length > 0) {
      log('步骤 5: 测试批量DEM查询...', 'cyan');
      
      // 从corridorGeom提取坐标点（简化版）
      const corridorGeom = (routeDirection as any).corridorGeom;
      let testPoints: Array<{ lat: number; lng: number }> = [];
      
      // 尝试解析WKT格式
      if (typeof corridorGeom === 'string') {
        const wktMatch = corridorGeom.match(/LINESTRING\s*\(([^)]+)\)/i);
        if (wktMatch) {
          const coordsStr = wktMatch[1];
          const coordPairs = coordsStr.split(',').map((s: string) => s.trim());
          
          for (const pair of coordPairs.slice(0, 10)) { // 只测试前10个点
            const parts = pair.trim().split(/\s+/);
            if (parts.length >= 2) {
              const lng = parseFloat(parts[0]);
              const lat = parseFloat(parts[1]);
              if (!isNaN(lat) && !isNaN(lng)) {
                testPoints.push({ lat, lng });
              }
            }
          }
        }
      }
      
      if (testPoints.length > 0) {
        log(`   从corridorGeom提取了 ${testPoints.length} 个测试点`, 'green');
        
        // 测试批量查询
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
              FROM ${existingTables[0]}
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
        }
      } else {
        log(`⚠️  无法从corridorGeom提取坐标点`, 'yellow');
      }
      console.log('');
    }

    // 6. 总结
    log('='.repeat(80), 'cyan');
    log('测试总结', 'bright');
    log('='.repeat(80), 'cyan');
    log('✅ 基础检查完成', 'green');
    log(`   行程: ${trip.destination || '未知'} (${trip.TripDay?.length || 0}天)`, 'green');
    log(`   RouteDirection: ${routeDirection ? '存在' : '不存在'}`, routeDirection ? 'green' : 'yellow');
    log(`   DEM表: ${existingTables.length}/${demTables.length} 存在`, existingTables.length > 0 ? 'green' : 'yellow');
    log(`   数据文件: ${fs.existsSync(roadStatusPath) ? '存在' : '不存在'}`, fs.existsSync(roadStatusPath) ? 'green' : 'yellow');
    console.log('');
    
    log('📝 下一步:', 'cyan');
    log('   1. 运行完整的世界模型构建测试（需要NestJS应用）', 'yellow');
    log('   2. 或通过API测试: POST /api/world/buildContext', 'yellow');
    log('   3. 检查DEM证据生成和缓存机制', 'yellow');
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
