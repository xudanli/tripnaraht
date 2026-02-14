#!/usr/bin/env tsx
/**
 * 每日批量同步冰岛天气预报
 *
 * 用途: 定期从 Open-Meteo API 同步所有关键区域的天气预报
 * 时间: 每天 3 次 (06:00, 12:00, 18:00 UTC)
 * 使用: npx tsx scripts/cron/sync-weather-daily.ts
 *
 * 在生产环境中应通过 NestJS Cron 或类似的调度系统调用
 */

import { PrismaClient } from '@prisma/client';
import { IcelandWeatherRealtimeService } from '../../src/skills/world/services/iceland-weather-realtime.service';

const prisma = new PrismaClient();

/**
 * 主函数: 同步所有区域天气预报
 */
async function syncWeatherDaily() {
  console.log('🌤️  开始每日天气预报同步...\n');
  console.log(`📅 时间: ${new Date().toISOString()}`);

  const weatherService = new IcelandWeatherRealtimeService(prisma);

  try {
    // 1. 批量获取所有关键区域的天气预报
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('第 1 步: 查询 Open-Meteo API');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const allForecasts = await weatherService.getAllRegionsWeather();

    console.log(`\n   总计: ${allForecasts.size} 个区域成功获取\n`);

    // 2. 统计数据
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('第 2 步: 数据统计');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let hazardCount = 0;
    let warningCount = 0;
    const temperatureStats = {
      min: Infinity,
      max: -Infinity,
      avg: 0,
    };
    const windStats = {
      min: Infinity,
      max: -Infinity,
      avg: 0,
    };

    allForecasts.forEach((forecast, region) => {
      hazardCount += forecast.hazards.length;
      warningCount += forecast.warnings.length;

      if (forecast.temperature !== undefined) {
        temperatureStats.min = Math.min(temperatureStats.min, forecast.temperature);
        temperatureStats.max = Math.max(temperatureStats.max, forecast.temperature);
        temperatureStats.avg += forecast.temperature;
      }

      if (forecast.windSpeed !== undefined) {
        windStats.min = Math.min(windStats.min, forecast.windSpeed);
        windStats.max = Math.max(windStats.max, forecast.windSpeed);
        windStats.avg += forecast.windSpeed;
      }
    });

    temperatureStats.avg /= allForecasts.size;
    windStats.avg /= allForecasts.size;

    console.log(`   天气数据:`);
    console.log(`     - 温度范围: ${temperatureStats.min.toFixed(1)}°C ~ ${temperatureStats.max.toFixed(1)}°C`);
    console.log(`     - 平均温度: ${temperatureStats.avg.toFixed(1)}°C`);
    console.log(`     - 风速范围: ${windStats.min.toFixed(1)} ~ ${windStats.max.toFixed(1)} m/s`);
    console.log(`     - 平均风速: ${windStats.avg.toFixed(1)} m/s\n`);

    console.log(`   风险统计:`);
    console.log(`     - 总告警数: ${warningCount}`);
    console.log(`     - 总风险数: ${hazardCount}\n`);

    // 3. 高风险区域警告
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('第 3 步: 高风险区域检查');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const highRiskRegions: string[] = [];
    allForecasts.forEach((forecast, region) => {
      const hasHighRisk = forecast.hazards.some(h =>
        h.severity === 'high' || h.severity === 'very_high'
      );
      const hasWarnings = forecast.warnings.length > 0;

      if (hasHighRisk || hasWarnings) {
        highRiskRegions.push(region);
        console.log(`   ⚠️  ${forecast.regionName}:`);
        console.log(`     - 温度: ${forecast.temperature}°C`);
        console.log(`     - 风速: ${forecast.windSpeed?.toFixed(1)} m/s`);
        console.log(`     - 天气: ${forecast.conditions}`);

        if (hasWarnings) {
          console.log(`     - 告警: ${forecast.warnings.map(w => w.type).join(', ')}`);
        }
        if (hasHighRisk) {
          console.log(`     - 风险: ${forecast.hazards.filter(h => h.severity === 'high' || h.severity === 'very_high').map(h => h.type).join(', ')}`);
        }
        console.log();
      }
    });

    if (highRiskRegions.length === 0) {
      console.log(`   ✅ 无高风险区域\n`);
    }

    // 4. 清理 90 天前的旧数据
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('第 4 步: 清理旧数据');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.weatherForecastRealtime.deleteMany({
      where: {
        forecastTime: {
          lt: ninetyDaysAgo,
        },
      },
    });

    console.log(`   🗑️  清理 ${deleted.count} 条过期记录 (> 90 天)\n`);

    // 5. 生成报告
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 同步完成！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 同步统计:');
    console.log(`   - 区域数: ${allForecasts.size}`);
    console.log(`   - 高风险区域: ${highRiskRegions.length}`);
    console.log(`   - 总告警数: ${warningCount}`);
    console.log(`   - 总风险数: ${hazardCount}`);
    console.log(`   - 清理旧数据: ${deleted.count} 条\n`);

    console.log('🎯 下一步:');
    console.log('   1. 配置 Cron job (每天 3 次: 06:00, 12:00, 18:00 UTC)');
    console.log('   2. 设置监控告警 (高风险区域 > 3)');
    console.log('   3. 创建天气风险 Dashboard');
    console.log('   4. 集成到 Should-Exist Gate\n');

    return {
      success: allForecasts.size,
      highRiskRegions: highRiskRegions.length,
      warnings: warningCount,
      hazards: hazardCount,
      deletedRecords: deleted.count,
    };
  } catch (error) {
    console.error('\n❌ 同步失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行同步
syncWeatherDaily()
  .then(() => {
    console.log('✅ 同步任务完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 同步任务失败:', error);
    process.exit(1);
  });
