/**
 * Phase 2 数据飞轮管理 API
 *
 * 触发离线学习、查询飞轮状态
 */

import { Controller, Post, Get, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { FlywheelPipelineService } from './flywheel-pipeline.service';
import { FlywheelDecisionLogService } from './flywheel-decision-log.service';
import { FlywheelBehaviorLogService } from './flywheel-behavior-log.service';
import { FlywheelOutcomeService } from './flywheel-outcome.service';

@ApiTags('Admin - Flywheel')
@Controller('v2/admin/flywheel')
export class FlywheelAdminController {
  private readonly logger = new Logger(FlywheelAdminController.name);

  constructor(
    private readonly pipeline: FlywheelPipelineService,
    private readonly decisionLog: FlywheelDecisionLogService,
    private readonly behaviorLog: FlywheelBehaviorLogService,
    private readonly outcomeService: FlywheelOutcomeService,
  ) {}

  @Public()
  @Post('run-learning')
  @ApiOperation({
    summary: '触发离线学习',
    description:
      '对指定用户运行 Phase 2 离线学习管道。建议每周/每月执行。需要至少 10 条反馈，50–100 次旅行后效果更佳。',
  })
  @ApiQuery({ name: 'userId', required: true, description: '用户 ID' })
  @ApiResponse({ status: 200, description: '学习结果' })
  async runLearning(
    @Query('userId') userId: string,
  ): Promise<{
    success: boolean;
    samplesUsed: number;
    weightChanges?: Record<string, number>;
    newVersion?: string;
    message: string;
  }> {
    if (!userId?.trim()) {
      return {
        success: false,
        samplesUsed: 0,
        message: 'userId 必填',
      };
    }
    this.logger.log(`[Flywheel] 手动触发离线学习: userId=${userId}`);
    return this.pipeline.runOfflineLearning(userId.trim());
  }

  @Public()
  @Get('stats')
  @ApiOperation({
    summary: '飞轮数据统计',
    description: '查看指定用户各层数据量（用于判断是否达到学习门槛 50–100 次旅行）',
  })
  @ApiQuery({ name: 'userId', required: true, description: '用户 ID' })
  @ApiResponse({ status: 200, description: '统计信息' })
  async getStats(
    @Query('userId') userId: string,
  ): Promise<{
    decisionLogs: number;
    behaviorLogs: number;
    outcomes: number;
    message: string;
  }> {
    if (!userId?.trim()) {
      return {
        decisionLogs: 0,
        behaviorLogs: 0,
        outcomes: 0,
        message: 'userId 必填',
      };
    }
    const [decisions, behaviors, outcomes] = await Promise.all([
      this.decisionLog.getByUserId(userId, { limit: 10000 }).then((r) => r.length),
      this.behaviorLog.getForLearning(userId, undefined, 10000).then((r) => r.length),
      this.outcomeService.getByUserId(userId, { limit: 10000 }).then((r) => r.length),
    ]);
    return {
      decisionLogs: decisions,
      behaviorLogs: behaviors,
      outcomes: outcomes,
      message: `用户 ${userId} 的数据量。建议 50–100 次旅行后启动学习。`,
    };
  }
}
