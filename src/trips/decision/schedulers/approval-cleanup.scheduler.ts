// src/trips/decision/schedulers/approval-cleanup.scheduler.ts
/**
 * Approval Cleanup Scheduler
 * 
 * 定期清理过期的审批请求
 */

// src/trips/decision/schedulers/approval-cleanup.scheduler.ts
/**
 * Approval Cleanup Scheduler
 * 
 * 定期清理过期的审批请求
 * 
 * 注意：如果项目使用了 @nestjs/schedule，取消下面的注释以启用定时任务
 * 否则，可以在 TasksModule 或其他地方手动调用 cleanupExpiredRequests()
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApprovalService } from '../services/approval.service';

@Injectable()
export class ApprovalCleanupScheduler implements OnModuleInit {
  private readonly logger = new Logger(ApprovalCleanupScheduler.name);

  constructor(
    private readonly approvalService: ApprovalService,
  ) {}

  onModuleInit() {
    this.logger.log('ApprovalCleanupScheduler 已启动（每 5 分钟清理一次过期审批请求）');
  }

  /**
   * 每 5 分钟清理一次过期的审批请求
   * 
   * 注意：需要确保 ScheduleModule 已在 TasksModule 中注册
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCleanup() {
    try {
      const count = await this.approvalService.cleanupExpiredRequests();
      if (count > 0) {
        this.logger.log(`清理了 ${count} 个过期的审批请求`);
      }
      return count;
    } catch (error: any) {
      this.logger.error(`清理过期审批请求失败: ${error.message}`, error.stack);
    }
  }
}
