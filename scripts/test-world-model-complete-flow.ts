#!/usr/bin/env npx tsx
/**
 * 测试世界模型构建完整流程
 * 
 * 使用指定的行程ID测试所有改进功能：
 * - DEM证据生成（三级降级策略）
 * - RouteDirection加载
 * - 错误处理
 * - 数据验证
 * - 缓存机制
 * - 批量DEM查询
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WorldBuildContextSkill } from '../src/skills/world/world-build-context.skill';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/common/cache/cache.service';

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
  log('世界模型构建完整流程测试', 'bright');
  log('='.repeat(80), 'cyan');
  log(`行程ID: ${tripId}`, 'yellow');
  console.log('');

  let app;
  try {
    // 初始化NestJS应用
    log('步骤 1: 初始化应用...', 'cyan');
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    log('✅ 应用初始化成功', 'green');
    console.log('');

    // 获取服务
    const worldBuildContextSkill = app.get(WorldBuildContextSkill);
    const prisma = app.get(PrismaService);
    const cacheService = app.get(CacheService);

    // 检查行程是否存在
    log('步骤 2: 检查行程...', 'cyan');
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
    console.log('');

    // 测试1: 首次构建（应该从数据库查询）
    log('步骤 3: 测试首次构建（无缓存）...', 'cyan');
    const startTime1 = Date.now();
    const result1 = await worldBuildContextSkill.execute({
      tripId,
    });
    const duration1 = Date.now() - startTime1;
    
    log(`✅ 首次构建完成 (耗时: ${duration1}ms)`, 'green');
    log(`   DEM证据数量: ${result1.world.physical.demEvidence.length}`, 'green');
    log(`   缺失数据: ${Object.keys(result1.missingPieces).length > 0 ? Object.keys(result1.missingPieces).join(', ') : '无'}`, 'green');
    console.log('');

    // 检查DEM证据
    if (result1.world.physical.demEvidence.length > 0) {
      const demEvidence = result1.world.physical.demEvidence[0];
      log('DEM证据详情:', 'cyan');
      log(`   Segment ID: ${demEvidence.segmentId}`, 'green');
      log(`   累计爬升: ${demEvidence.cumulativeAscent.toFixed(1)}m`, 'green');
      log(`   最大坡度: ${demEvidence.maxSlopePct.toFixed(2)}%`, 'green');
      log(`   疲劳指数: ${demEvidence.fatigueIndex.toFixed(1)}`, 'green');
      log(`   说明: ${demEvidence.explanation}`, 'green');
      console.log('');
    }

    // 测试2: 第二次构建（应该从缓存获取）
    log('步骤 4: 测试第二次构建（缓存命中）...', 'cyan');
    const startTime2 = Date.now();
    const result2 = await worldBuildContextSkill.execute({
      tripId,
    });
    const duration2 = Date.now() - startTime2;
    
    log(`✅ 第二次构建完成 (耗时: ${duration2}ms)`, 'green');
    
    if (duration2 < duration1 * 0.5) {
      log(`   ⚡ 性能提升: ${((1 - duration2 / duration1) * 100).toFixed(1)}% (缓存生效)`, 'green');
    } else {
      log(`   ⚠️  缓存可能未生效或性能提升不明显`, 'yellow');
    }
    console.log('');

    // 测试3: 验证数据完整性
    log('步骤 5: 验证数据完整性...', 'cyan');
    
    // 验证PhysicalRealityModel
    const { validatePhysicalRealityModel } = await import('../src/trips/decision/models/physical-reality.model');
    const physicalValidation = validatePhysicalRealityModel(result1.world.physical);
    
    if (physicalValidation.valid) {
      log('✅ PhysicalRealityModel 验证通过', 'green');
    } else {
      log(`⚠️  PhysicalRealityModel 验证失败: ${physicalValidation.missingFields.join(', ')}`, 'yellow');
    }

    // 验证HumanCapabilityModel
    if (result1.world.human) {
      log('✅ HumanCapabilityModel 存在', 'green');
      log(`   最大日爬升: ${result1.world.human.maxDailyAscentM}m`, 'green');
      log(`   偏好节奏: ${result1.world.human.preferredPace}`, 'green');
    } else {
      log('⚠️  HumanCapabilityModel 缺失', 'yellow');
    }

    // 验证RouteDirection
    if (result1.world.routeDirection) {
      log('✅ RouteDirection 存在', 'green');
      log(`   路线名称: ${result1.world.routeDirection.nameCN || result1.world.routeDirection.name}`, 'green');
      log(`   国家代码: ${result1.world.routeDirection.countryCode}`, 'green');
    } else {
      log('⚠️  RouteDirection 缺失', 'yellow');
    }
    console.log('');

    // 测试4: 测试批量DEM查询性能
    log('步骤 6: 测试批量DEM查询性能...', 'cyan');
    
    if (trip.TripDay && trip.TripDay.length > 0) {
      const allPoints: Array<{ lat: number; lng: number }> = [];
      
      for (const day of trip.TripDay) {
        if (day.ItineraryItem) {
          for (const item of day.ItineraryItem) {
            if (item.Place && item.Place.location) {
              const location = item.Place.location as any;
              if (location.coordinates && location.coordinates.length >= 2) {
                allPoints.push({
                  lat: location.coordinates[1],
                  lng: location.coordinates[0],
                });
              }
            }
          }
        }
      }

      if (allPoints.length > 0) {
        log(`   提取了 ${allPoints.length} 个坐标点`, 'green');
        
        const { DEMElevationService } = await import('../src/trips/dem/services/dem-elevation.service');
        const demElevationService = app.get(DEMElevationService);
        
        // 测试批量查询
        const batchStartTime = Date.now();
        const elevations = await demElevationService.getElevations(allPoints);
        const batchDuration = Date.now() - batchStartTime;
        
        const successCount = elevations.filter(e => e !== null).length;
        log(`✅ 批量查询完成 (耗时: ${batchDuration}ms)`, 'green');
        log(`   成功查询: ${successCount}/${allPoints.length}`, 'green');
        log(`   平均每个点: ${(batchDuration / allPoints.length).toFixed(2)}ms`, 'green');
        
        // 对比：逐个查询（如果点数不太多）
        if (allPoints.length <= 20) {
          log('   对比：逐个查询...', 'cyan');
          const individualStartTime = Date.now();
          const individualElevations = await Promise.all(
            allPoints.map(p => demElevationService.getElevation(p.lat, p.lng))
          );
          const individualDuration = Date.now() - individualStartTime;
          
          log(`   逐个查询完成 (耗时: ${individualDuration}ms)`, 'green');
          if (batchDuration < individualDuration) {
            log(`   ⚡ 批量查询性能提升: ${((1 - batchDuration / individualDuration) * 100).toFixed(1)}%`, 'green');
          }
        }
      } else {
        log('⚠️  没有找到坐标点', 'yellow');
      }
    } else {
      log('⚠️  行程没有天数数据', 'yellow');
    }
    console.log('');

    // 测试5: 测试错误处理
    log('步骤 7: 测试错误处理...', 'cyan');
    
    try {
      await worldBuildContextSkill.execute({
        countryCode: 'XX', // 无效的国家代码
        season: 1,
      });
      log('⚠️  应该抛出错误但没有', 'yellow');
    } catch (error: any) {
      if (error.name === 'WorldModelError') {
        log('✅ 错误处理正确（WorldModelError）', 'green');
        log(`   错误级别: ${error.severity}`, 'green');
        log(`   错误消息: ${error.message}`, 'green');
      } else {
        log(`⚠️  错误类型: ${error.name}`, 'yellow');
        log(`   错误消息: ${error.message}`, 'yellow');
      }
    }
    console.log('');

    // 总结
    log('='.repeat(80), 'cyan');
    log('测试总结', 'bright');
    log('='.repeat(80), 'cyan');
    log('✅ 所有测试完成', 'green');
    log(`   首次构建耗时: ${duration1}ms`, 'green');
    log(`   第二次构建耗时: ${duration2}ms`, 'green');
    log(`   DEM证据: ${result1.world.physical.demEvidence.length} 条`, 'green');
    log(`   数据完整性: ${physicalValidation.valid ? '通过' : '部分缺失'}`, physicalValidation.valid ? 'green' : 'yellow');
    console.log('');

  } catch (error: any) {
    log(`❌ 测试失败: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main().catch(console.error);
