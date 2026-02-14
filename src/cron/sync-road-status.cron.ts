/**
 * NestJS Cron Job: 每日同步 F-road 状态
 *
 * 用途: 定期从 road.is API 同步所有 F-road 的实时状态到数据库
 * 时间: 每天 6:00 UTC (冰岛时间约凌晨 6:00-7:00)
 *
 * 使用:
 * 1. 在 app.module.ts 中导入 ScheduleModule
 * 2. 添加 SyncRoadStatusCron 到 providers
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class SyncRoadStatusCron {
  private readonly logger = new Logger('SyncRoadStatusCron');
  private readonly prisma: PrismaClient;

  private readonly F_ROADS = [
    'F208', 'F26', 'F225', 'F35', 'F910', 'F550', 'F88', 'F862',
    'F206', 'F232', 'F210', 'F228', 'F261', 'F337', 'F821', 'F902',
    'F985', 'F233', 'F347', 'F578', 'F622', 'F980',
  ];

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * 每天 6:00 UTC 执行
   */
  @Cron('0 6 * * *', {
    name: 'sync-road-status-daily',
    timeZone: 'UTC',
  })
  async handleDailySync() {
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('🚀 开始每日 F-road 状态同步');
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      const result = await this.syncAllRoads();

      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.log('✅ 同步完成');
      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.log(`API 成功: ${result.apiSuccess}/${this.F_ROADS.length}`);
      this.logger.log(`数据库写入: ${result.dbSuccess}/${result.totalRecords}`);
      this.logger.log(`清理旧数据: ${result.deletedRecords} 条`);
    } catch (error) {
      this.logger.error('❌ 同步失败', error);
      // 这里可以添加告警逻辑，例如发送邮件或 Slack 通知
      throw error;
    }
  }

  /**
   * 同步所有 F-road 状态
   */
  private async syncAllRoads() {
    const API_URL = 'https://api.road.is/api/condition';
    let apiSuccess = 0;
    let apiFailed = 0;
    const statuses: any[] = [];

    // 1. 批量查询 API (并发控制: 5 个/批次)
    this.logger.log('第 1 步: 查询 road.is API');

    const batchSize = 5;
    for (let i = 0; i < this.F_ROADS.length; i += batchSize) {
      const batch = this.F_ROADS.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(roadId => this.queryRoadStatus(API_URL, roadId))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          apiSuccess++;
          statuses.push(result.value);
        } else {
          apiFailed++;
        }
      });

      // 批次间延迟
      if (i + batchSize < this.F_ROADS.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.logger.log(`API 查询完成: ${apiSuccess}/${this.F_ROADS.length} 成功`);

    // 2. 如果 API 完全失败，使用降级方案
    if (statuses.length === 0) {
      this.logger.warn('⚠️  API 完全不可用，使用降级方案');
      statuses.push(...this.generateFallbackStatuses());
    }

    // 3. 写入数据库
    this.logger.log('第 2 步: 写入数据库');

    let dbSuccess = 0;
    let dbFailed = 0;

    for (const status of statuses) {
      try {
        await this.prisma.roadStatusRealtime.create({
          data: {
            roadId: status.roadId,
            roadName: status.roadName || null,
            currentStatus: status.currentStatus,
            statusMessage: status.statusMessage || null,
            lastVerifiedAt: status.lastVerifiedAt,
            dataSource: status.dataSource,
            apiResponse: status.apiResponse,
            hazards: status.hazards,
            confidence: status.dataSource === 'road.is_api' ? 0.9 : 0.6,
            seasonalFallback: status.dataSource === 'static_seasonal_data',
          },
        });
        dbSuccess++;
      } catch (error) {
        dbFailed++;
        this.logger.error(`写入失败 ${status.roadId}:`, error);
      }
    }

    this.logger.log(`数据库写入完成: ${dbSuccess}/${statuses.length} 成功`);

    // 4. 清理 90 天前的数据
    this.logger.log('第 3 步: 清理旧数据');

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const deleted = await this.prisma.roadStatusRealtime.deleteMany({
      where: {
        lastVerifiedAt: {
          lt: ninetyDaysAgo,
        },
      },
    });

    this.logger.log(`清理完成: ${deleted.count} 条旧记录已删除`);

    return {
      apiSuccess,
      apiFailed,
      totalRecords: statuses.length,
      dbSuccess,
      dbFailed,
      deletedRecords: deleted.count,
    };
  }

  /**
   * 查询单条 F-road 状态
   */
  private async queryRoadStatus(apiUrl: string, roadId: string): Promise<any | null> {
    try {
      const response = await axios.get(apiUrl, {
        params: { road: roadId },
        timeout: 5000,
      });

      if (response.status !== 200 || !response.data?.results || response.data.results.length === 0) {
        return null;
      }

      const apiData = response.data.results[0];

      return {
        roadId: apiData.road_number,
        roadName: apiData.road_name,
        currentStatus: this.normalizeStatus(apiData.status),
        statusMessage: apiData.status_text_en || apiData.status_text,
        lastVerifiedAt: new Date(apiData.last_updated),
        dataSource: 'road.is_api',
        apiResponse: apiData,
        hazards: (apiData.warnings || []).map((w: any) => ({
          type: w.type,
          severity: w.severity,
          message: w.message,
        })),
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * 规范化状态值
   */
  private normalizeStatus(status: string): 'open' | 'closed' | 'limited' | 'unknown' {
    const normalized = status.toLowerCase().trim();
    if (normalized === 'open') return 'open';
    if (normalized === 'closed') return 'closed';
    if (normalized === 'limited') return 'limited';
    return 'unknown';
  }

  /**
   * 生成降级方案的道路状态
   */
  private generateFallbackStatuses(): any[] {
    const currentMonth = new Date().getMonth() + 1;
    const isSummer = currentMonth >= 6 && currentMonth <= 9;

    return this.F_ROADS.map(roadId => ({
      roadId,
      currentStatus: isSummer ? 'limited' : 'closed',
      statusMessage: isSummer
        ? 'Typically open in summer (UNVERIFIED - based on seasonal pattern)'
        : 'Typically closed in winter (UNVERIFIED - based on seasonal pattern)',
      lastVerifiedAt: new Date(),
      dataSource: 'static_seasonal_data',
      apiResponse: null,
      hazards: [
        {
          type: 'UNVERIFIED_STATUS',
          severity: 'high',
          message: 'Real-time API unavailable. Status based on seasonal patterns only.',
        },
        {
          type: 'MANUAL_VERIFICATION_REQUIRED',
          severity: 'high',
          message: 'MUST verify at road.is or call 1777 before travel.',
        },
      ],
    }));
  }
}
