/**
 * 世界模型异步推送调度器
 *
 * 专利实施例：多代理并发实测 - WeatherAgent 等通过外部调度调用 pushEnvironmentDelta
 * 定期对活跃行程拉取天气并推送至 DSO.environmentState，与 RESEARCH 同步拉取形成双路径
 *
 * 执行频率：每 6 小时（与业务高峰期错开）
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import { DSO_FEEDBACK_PERSISTENCE } from '../../../decision/kernel/dso-feedback-persistence.interface';
import type { IDsoFeedbackPersistence } from '../../../decision/kernel/dso-feedback-persistence.interface';
import { WeatherAgentService } from '../../../agent/services/domain-agents/weather-agent.service';

/** 国家/目的地代码 → 默认坐标（首都或中心） */
const DESTINATION_COORDS: Record<string, { lat: number; lng: number }> = {
  IS: { lat: 64.15, lng: -21.95 },   // 雷克雅未克
  JP: { lat: 35.68, lng: 139.69 },   // 东京
  CN: { lat: 39.9, lng: 116.4 },    // 北京
  US: { lat: 40.71, lng: -74.0 },   // 纽约
  NZ: { lat: -36.85, lng: 174.76 }, // 奥克兰
  AU: { lat: -33.87, lng: 151.21 }, // 悉尼
  TH: { lat: 13.76, lng: 100.5 },   // 曼谷
  SG: { lat: 1.35, lng: 103.82 },   // 新加坡
  NO: { lat: 59.91, lng: 10.75 },   // 奥斯陆
};

@Injectable()
export class WorldModelPushScheduler {
  private readonly logger = new Logger(WorldModelPushScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisionKernel: DecisionKernelService,
    @Optional() @Inject(DSO_FEEDBACK_PERSISTENCE) private readonly feedbackPersistence?: IDsoFeedbackPersistence,
    @Optional() private readonly weatherAgent?: WeatherAgentService,
  ) {}

  /**
   * 每 6 小时执行：对近期活跃行程推送天气数据到 DSO
   */
  @Cron(CronExpression.EVERY_6_HOURS, {
    name: 'world-model-push-weather',
    timeZone: 'UTC',
  })
  async pushWeatherToActiveTrips(): Promise<void> {
    if (!this.feedbackPersistence || !this.weatherAgent) {
      this.logger.debug('[WorldModelPush] 缺少 feedbackPersistence 或 weatherAgent，跳过');
      return;
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trips = await this.prisma.trip.findMany({
      where: {
        status: 'PLANNING',
        updatedAt: { gte: since },
        metadata: { path: ['dso'], not: null },
      },
      select: { id: true },
      take: 20,
    });

    if (trips.length === 0) return;

    this.logger.debug(`[WorldModelPush] 处理 ${trips.length} 个活跃行程`);
    let pushed = 0;

    for (const trip of trips) {
      try {
        const dso = await this.feedbackPersistence.getDso(trip.id);
        if (!dso?.userIntent?.destination || !dso.userIntent.dateRange) continue;

        const coords = this.resolveCoords(dso.userIntent.destination);
        if (!coords) continue;

        const { startDate, endDate } = dso.userIntent.dateRange;
        const forecast = await this.weatherAgent.getForecast(
          coords,
          { start: startDate, end: endDate },
        );

        const riskMap: Record<string, number> = {
          EXCELLENT: 0,
          GOOD: 0.2,
          FAIR: 0.5,
          POOR: 0.8,
          DANGEROUS: 1,
        };
        const firstSuitability = forecast.forecasts?.[0]?.travel_suitability ?? 'FAIR';
        const weatherRisk = riskMap[firstSuitability] ?? 0.5;

        await this.decisionKernel.pushEnvironmentDelta(
          trip.id,
          {
            weatherRisk,
            _weatherUpdateAt: new Date().toISOString(),
          },
          'world_model_push',
        );
        pushed++;
      } catch (e: unknown) {
        this.logger.warn(`[WorldModelPush] trip=${trip.id} 失败: ${(e as Error)?.message}`);
      }
    }

    if (pushed > 0) {
      this.logger.log(`[WorldModelPush] 完成，推送 ${pushed}/${trips.length} 个行程`);
    }
  }

  private resolveCoords(
    dest: string | { lat: number; lng: number },
  ): { lat: number; lng: number } | null {
    if (typeof dest === 'object' && dest?.lat != null && dest?.lng != null) {
      return { lat: dest.lat, lng: dest.lng };
    }
    const code = (typeof dest === 'string' ? dest : '').toUpperCase().slice(0, 2);
    return DESTINATION_COORDS[code] ?? null;
  }
}
