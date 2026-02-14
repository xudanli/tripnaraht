/**
 * NestJS Cron Job: 每日同步天气预报
 *
 * 用途: 定期从 Open-Meteo API 同步冰岛所有关键区域的天气预报
 * 时间: 每天 3 次 (06:00, 12:00, 18:00 UTC)
 *
 * 使用:
 * 1. 在 app.module.ts 中导入 ScheduleModule
 * 2. 添加 SyncWeatherCron 到 providers
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import { IcelandWeatherRealtimeService } from '../skills/world/services/iceland-weather-realtime.service';

@Injectable()
export class SyncWeatherCron {
  private readonly logger = new Logger('SyncWeatherCron');
  private readonly prisma: PrismaClient;
  private readonly weatherService: IcelandWeatherRealtimeService;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
    this.weatherService = new IcelandWeatherRealtimeService(this.prisma);
  }

  /**
   * 每天 06:00, 12:00, 18:00 UTC 执行
   */
  @Cron('0 6,12,18 * * *', {
    name: 'sync-weather-3times-daily',
    timeZone: 'UTC',
  })
  async handleDailySync() {
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('🌤️  开始天气预报同步 (每日 3 次)');
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      const result = await this.syncAllRegions();

      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.log('✅ 同步完成');
      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.log(`区域数: ${result.regionCount}`);
      this.logger.log(`高风险区域: ${result.highRiskCount}`);
      this.logger.log(`总告警数: ${result.warningCount}`);
      this.logger.log(`清理旧数据: ${result.deletedRecords} 条`);

      // 高风险告警
      if (result.highRiskCount >= 3) {
        this.logger.warn(`⚠️  高风险区域过多 (${result.highRiskCount})，建议查看详情`);
        // 这里可以触发告警通知（Slack/Email等）
      }
    } catch (error) {
      this.logger.error('❌ 同步失败', error);
      throw error;
    }
  }

  /**
   * 同步所有区域天气
   */
  private async syncAllRegions() {
    // 1. 获取所有区域天气
    this.logger.log('第 1 步: 查询 Open-Meteo API');

    const allForecasts = await this.weatherService.getAllRegionsWeather();

    this.logger.log(`成功获取 ${allForecasts.size} 个区域天气`);

    // 2. 统计风险
    let warningCount = 0;
    let highRiskCount = 0;

    allForecasts.forEach((forecast, region) => {
      warningCount += forecast.warnings.length;

      const hasHighRisk = forecast.hazards.some(
        h => h.severity === 'high' || h.severity === 'very_high'
      );
      const hasWarnings = forecast.warnings.length > 0;

      if (hasHighRisk || hasWarnings) {
        highRiskCount++;
        this.logger.warn(
          `⚠️  ${forecast.regionName}: ${forecast.temperature}°C, ${forecast.windSpeed?.toFixed(1)}m/s, ${forecast.conditions}`
        );
      }
    });

    // 3. 清理 90 天前的旧数据
    this.logger.log('第 2 步: 清理旧数据');

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const deleted = await this.prisma.weatherForecastRealtime.deleteMany({
      where: {
        forecastTime: {
          lt: ninetyDaysAgo,
        },
      },
    });

    this.logger.log(`清理 ${deleted.count} 条过期记录`);

    return {
      regionCount: allForecasts.size,
      highRiskCount,
      warningCount,
      deletedRecords: deleted.count,
    };
  }
}
