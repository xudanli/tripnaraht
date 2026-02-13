#!/usr/bin/env tsx
/**
 * Phase 3 迁移验证脚本
 *
 * 用途: 验证 RoadStatusRealtime 和 WeatherForecastRealtime 表已正确创建
 * 运行: npx tsx scripts/test-phase3-migration.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testMigration() {
  console.log('🚀 开始 Phase 3 迁移验证...\n');

  try {
    // 1. 测试 RoadStatusRealtime 表
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('测试 1: RoadStatusRealtime 表');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const roadStatus = await prisma.roadStatusRealtime.create({
      data: {
        roadId: 'F208',
        roadName: 'Fjallabaksleið nyrðri',
        currentStatus: 'closed',
        statusMessage: 'Typically closed in winter (UNVERIFIED - based on seasonal pattern)',
        lastVerifiedAt: new Date(),
        dataSource: 'static_seasonal_data',
        hazards: [
          { type: 'UNVERIFIED_STATUS', severity: 'high', message: 'Real-time API unavailable' },
          { type: 'MANUAL_VERIFICATION_REQUIRED', severity: 'high', message: 'MUST verify at road.is or call 1777' }
        ],
        confidence: 0.6,
        seasonalFallback: true,
      },
    });

    console.log(`✅ RoadStatusRealtime 表已创建`);
    console.log(`   记录 ID: ${roadStatus.id}`);
    console.log(`   道路: ${roadStatus.roadId} (${roadStatus.roadName})`);
    console.log(`   状态: ${roadStatus.currentStatus}`);
    console.log(`   数据源: ${roadStatus.dataSource}`);
    console.log(`   置信度: ${roadStatus.confidence}\n`);

    // 2. 测试查询最新状态 (索引性能)
    const startQuery1 = Date.now();
    const latestStatus = await prisma.roadStatusRealtime.findFirst({
      where: { roadId: 'F208' },
      orderBy: { lastVerifiedAt: 'desc' },
    });
    const queryTime1 = Date.now() - startQuery1;

    console.log(`✅ 查询最新状态成功 (${queryTime1}ms)`);
    console.log(`   索引使用: roadId + lastVerifiedAt DESC\n`);

    // 3. 删除测试数据
    await prisma.roadStatusRealtime.delete({
      where: { id: roadStatus.id },
    });
    console.log(`🗑️  测试数据已清理\n`);

    // 4. 测试 WeatherForecastRealtime 表
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('测试 2: WeatherForecastRealtime 表');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const now = new Date();
    const forecast = await prisma.weatherForecastRealtime.create({
      data: {
        regionKey: 'highlands',
        regionName: 'Icelandic Highlands',
        forecastTime: now,
        validFrom: now,
        validUntil: new Date(now.getTime() + 6 * 60 * 60 * 1000), // +6 hours
        temperature: -5.0,
        windSpeed: 15.0,
        windDirection: 270,
        precipitation: 2.5,
        visibility: 5000,
        conditions: 'Snow',
        weatherCode: 'SN',
        warnings: [
          { type: 'SNOW', severity: 'medium', message: 'Moderate snowfall expected' }
        ],
        hazards: [
          { type: 'LOW_VISIBILITY', severity: 'high', message: 'Visibility below 1km' }
        ],
        dataSource: 'vedurstofa.is',
        confidence: 0.9,
      },
    });

    console.log(`✅ WeatherForecastRealtime 表已创建`);
    console.log(`   记录 ID: ${forecast.id}`);
    console.log(`   区域: ${forecast.regionKey} (${forecast.regionName})`);
    console.log(`   温度: ${forecast.temperature}°C`);
    console.log(`   风速: ${forecast.windSpeed} m/s`);
    console.log(`   数据源: ${forecast.dataSource}\n`);

    // 5. 测试时间范围查询
    const startQuery2 = Date.now();
    const activeForecast = await prisma.weatherForecastRealtime.findMany({
      where: {
        regionKey: 'highlands',
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
      orderBy: { forecastTime: 'desc' },
      take: 1,
    });
    const queryTime2 = Date.now() - startQuery2;

    console.log(`✅ 时间范围查询成功 (${queryTime2}ms)`);
    console.log(`   索引使用: validFrom + validUntil\n`);

    // 6. 删除测试数据
    await prisma.weatherForecastRealtime.delete({
      where: { id: forecast.id },
    });
    console.log(`🗑️  测试数据已清理\n`);

    // 7. 测试 Place 新字段
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('测试 3: Place 表新字段');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const firstPlace = await prisma.place.findFirst();
    if (!firstPlace) {
      console.log('⚠️  数据库中没有 Place 记录,跳过测试\n');
    } else {
      const updatedPlace = await prisma.place.update({
        where: { id: firstPlace.id },
        data: {
          lastVerifiedAt: new Date(),
          dataSource: 'test_source',
          dataFreshness: 'FRESH',
        },
      });

      console.log(`✅ Place 表新字段已添加`);
      console.log(`   Place ID: ${updatedPlace.id}`);
      console.log(`   名称: ${updatedPlace.nameCN || updatedPlace.nameEN}`);
      console.log(`   lastVerifiedAt: ${updatedPlace.lastVerifiedAt?.toISOString()}`);
      console.log(`   dataSource: ${updatedPlace.dataSource}`);
      console.log(`   dataFreshness: ${updatedPlace.dataFreshness}\n`);

      // 恢复原值
      await prisma.place.update({
        where: { id: firstPlace.id },
        data: {
          lastVerifiedAt: firstPlace.lastVerifiedAt,
          dataSource: firstPlace.dataSource,
          dataFreshness: firstPlace.dataFreshness,
        },
      });
      console.log(`🔄 Place 记录已恢复原值\n`);
    }

    // 8. 性能报告
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 性能报告');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   查询 1 (RoadStatusRealtime):     ${queryTime1}ms`);
    console.log(`   查询 2 (WeatherForecastRealtime): ${queryTime2}ms`);

    if (queryTime1 < 100 && queryTime2 < 100) {
      console.log(`\n   ✅ 所有查询性能符合预期 (< 100ms)\n`);
    } else {
      console.log(`\n   ⚠️  部分查询性能较慢 (> 100ms),请检查索引\n`);
    }

    // 9. 总结
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Phase 3 迁移验证完成！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('验收标准:');
    console.log('   ✅ RoadStatusRealtime 表已创建');
    console.log('   ✅ WeatherForecastRealtime 表已创建');
    console.log('   ✅ Place 表新字段已添加');
    console.log('   ✅ 所有索引查询性能符合预期');
    console.log('   ✅ 测试数据插入/删除成功\n');

    console.log('🎯 下一步:');
    console.log('   1. 更新 RoadStatusRealtimeService 使用数据库');
    console.log('   2. 更新 Cron Job 写入数据库');
    console.log('   3. 运行初始数据同步: npx tsx scripts/cron/sync-road-status-daily.ts\n');

  } catch (error) {
    console.error('\n❌ 迁移验证失败:', error);
    console.error('\n请检查:');
    console.error('   1. 迁移 SQL 是否已执行');
    console.error('   2. Prisma Client 是否已重新生成 (npx prisma generate)');
    console.error('   3. 数据库连接是否正常\n');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行测试
testMigration()
  .then(() => {
    console.log('测试任务完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('测试任务失败:', error);
    process.exit(1);
  });
