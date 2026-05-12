// src/agent/controllers/decision-replay.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  DecisionReplayService,
  DecisionSnapshot,
  DecisionTimeline,
  DecisionReplaySessionListItem,
  WhatIfInput,
  WhatIfResult,
} from '../services/decision-replay.service';
import { DecisionOutput } from '../interfaces/decision-node.interface';

/**
 * Decision Replay API Controller
 * 
 * 提供决策回放、时间线、What-If 模拟等 AI-Native 功能的 API 端点
 */
@ApiTags('Decision Replay')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/decision-replay')
export class DecisionReplayController {
  private readonly logger = new Logger(DecisionReplayController.name);

  constructor(private readonly replayService: DecisionReplayService) {}

  // ============================================================================
  // 会话列表（TripRun）
  // ============================================================================

  @Get('sessions')
  @ApiOperation({
    summary: '列出决策回放会话',
    description:
      '返回当前用户的 TripRun 记录；可选 trip_id 按行程筛选。兼容字段 sessions / items（内容相同）。' +
      '每条含可读字段：trip_display_name、trip_destination、user_query_preview、planning_phase、completed_at、status_label_zh、list_summary（推荐直接用作列表主文案）。',
  })
  @ApiQuery({ name: 'trip_id', required: false, description: '行程 ID（UUID）' })
  @ApiResponse({ status: 200, description: '会话列表' })
  async listSessions(
    @CurrentUser() user: CurrentUserPayload,
    @Query('trip_id') tripId?: string,
  ): Promise<{ sessions: DecisionReplaySessionListItem[]; items: DecisionReplaySessionListItem[] }> {
    if (!user?.userId) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    const items = await this.replayService.listSessionsForUser(user.userId, tripId);
    return { sessions: items, items };
  }

  // ============================================================================
  // 时间线 API
  // ============================================================================

  @Get('timeline/:tripRunId')
  @ApiOperation({ summary: '获取决策时间线', description: '获取指定行程的完整决策时间线' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  @ApiResponse({ status: 200, description: '返回决策时间线' })
  @ApiResponse({ status: 404, description: '时间线不存在' })
  getTimeline(@Param('tripRunId') tripRunId: string): DecisionTimeline | { error: string } {
    const timeline = this.replayService.getTimeline(tripRunId);
    if (!timeline) {
      return { error: 'Timeline not found' };
    }
    return timeline;
  }

  @Get('timeline/:tripRunId/summary')
  @ApiOperation({ summary: '获取时间线摘要', description: '获取决策时间线的简化摘要' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  getTimelineSummary(@Param('tripRunId') tripRunId: string) {
    const summary = this.replayService.buildTimelineSummary(tripRunId);
    if (!summary) {
      return { error: 'Timeline not found' };
    }
    return summary;
  }

  // ============================================================================
  // 快照 API
  // ============================================================================

  @Get('snapshot/:tripRunId/:snapshotId')
  @ApiOperation({ summary: '获取决策快照', description: '获取指定的决策快照' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  @ApiParam({ name: 'snapshotId', description: '快照 ID' })
  getSnapshot(
    @Param('tripRunId') tripRunId: string,
    @Param('snapshotId') snapshotId: string,
  ): DecisionSnapshot | { error: string } {
    const snapshot = this.replayService.getSnapshot(tripRunId, snapshotId);
    if (!snapshot) {
      return { error: 'Snapshot not found' };
    }
    return snapshot;
  }

  @Get('snapshot/:tripRunId/latest')
  @ApiOperation({ summary: '获取最新快照', description: '获取最新的决策快照' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  getLatestSnapshot(@Param('tripRunId') tripRunId: string): DecisionSnapshot | { error: string } {
    const snapshot = this.replayService.getLatestSnapshot(tripRunId);
    if (!snapshot) {
      return { error: 'No snapshots found' };
    }
    return snapshot;
  }

  // ============================================================================
  // 回放 API
  // ============================================================================

  @Post('replay/:tripRunId/:snapshotId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '回放到指定快照', description: '将决策状态回放到指定的快照点' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  @ApiParam({ name: 'snapshotId', description: '目标快照 ID' })
  replayToSnapshot(
    @Param('tripRunId') tripRunId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    const result = this.replayService.replayToSnapshot(tripRunId, snapshotId);
    if (!result) {
      return { error: 'Failed to replay - snapshot not found' };
    }
    this.logger.log(`[DecisionReplay] Replayed to snapshot ${snapshotId}`);
    return result;
  }

  @Get('diff/:tripRunId')
  @ApiOperation({ summary: '获取快照差异', description: '比较两个快照之间的差异' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  @ApiQuery({ name: 'from', description: '起始快照 ID' })
  @ApiQuery({ name: 'to', description: '目标快照 ID' })
  getDiff(
    @Param('tripRunId') tripRunId: string,
    @Query('from') fromSnapshotId: string,
    @Query('to') toSnapshotId: string,
  ) {
    const diff = this.replayService.getDiffBetweenSnapshots(tripRunId, fromSnapshotId, toSnapshotId);
    if (!diff) {
      return { error: 'Failed to compute diff - snapshots not found' };
    }
    return diff;
  }

  // ============================================================================
  // What-If 模拟 API
  // ============================================================================

  @Post('what-if')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '执行 What-If 模拟', description: '模拟不同选择或偏好的影响' })
  @ApiBody({
    description: 'What-If 模拟输入',
    schema: {
      type: 'object',
      properties: {
        input: {
          type: 'object',
          properties: {
            base_snapshot_id: { type: 'string' },
            changes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['PREFERENCE_CHANGE', 'CONSTRAINT_CHANGE', 'OPTION_CHANGE', 'DATE_CHANGE'] },
                  field: { type: 'string' },
                  original_value: {},
                  new_value: {},
                },
              },
            },
          },
        },
        decision_output: { type: 'object' },
      },
    },
  })
  simulateWhatIf(
    @Body() body: { input: WhatIfInput; decision_output: DecisionOutput },
  ): WhatIfResult {
    this.logger.log(`[DecisionReplay] Simulating what-if from ${body.input.base_snapshot_id}`);
    return this.replayService.simulateWhatIf(body.input, body.decision_output);
  }

  @Post('counterfactual/:tripRunId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成反事实问题', description: '基于决策输出生成反事实问题' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  generateCounterfactualQuestions(
    @Param('tripRunId') tripRunId: string,
    @Body() decisionOutput: DecisionOutput,
  ) {
    const questions = this.replayService.generateCounterfactualQuestions(decisionOutput);
    return { trip_run_id: tripRunId, questions };
  }

  // ============================================================================
  // 决策风格 API
  // ============================================================================

  @Get('style/:userId')
  @ApiOperation({ summary: '获取用户决策风格', description: '获取用户的推断决策风格' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  getDecisionStyle(@Param('userId') userId: string) {
    const style = this.replayService.getDecisionStyle(userId);
    if (!style) {
      return { error: 'No style data for user' };
    }
    return style;
  }

  @Get('style/:userId/preferences')
  @ApiOperation({ summary: '推断用户偏好', description: '基于历史推断用户偏好' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  inferPreferences(@Param('userId') userId: string) {
    return this.replayService.inferPreferencesFromHistory(userId);
  }

  @Post('style/:userId/signal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '记录学习信号', description: '记录用户行为用于决策风格学习' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  @ApiBody({
    description: '学习信号',
    schema: {
      type: 'object',
      properties: {
        signal_type: { type: 'string', enum: ['ACCEPT', 'REJECT', 'MODIFY', 'QUESTION'] },
        context: { type: 'string' },
      },
    },
  })
  recordLearningSignal(
    @Param('userId') userId: string,
    @Body() body: { signal_type: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'QUESTION'; context: string },
  ) {
    this.replayService.recordLearningSignal(userId, body.signal_type, body.context);
    return { success: true, user_id: userId };
  }

  // ============================================================================
  // 用户判断点闭环 API
  // ============================================================================

  @Post('judgment/:tripRunId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交用户判断', description: '用户提交对判断点的回答，触发重新评估' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  @ApiBody({
    description: '用户判断',
    schema: {
      type: 'object',
      properties: {
        judgment_point_id: { type: 'string', description: '判断点 ID' },
        selected_option: { type: 'string', description: '用户选择的选项' },
        user_id: { type: 'string', description: '用户 ID' },
        context: { type: 'object', description: '附加上下文' },
      },
      required: ['judgment_point_id', 'selected_option'],
    },
  })
  applyUserJudgment(
    @Param('tripRunId') tripRunId: string,
    @Body() body: {
      judgment_point_id: string;
      selected_option: string;
      user_id?: string;
      context?: Record<string, any>;
    },
  ) {
    this.logger.log(`[DecisionReplay] Applying user judgment for ${tripRunId}: ${body.judgment_point_id} = ${body.selected_option}`);

    // 记录学习信号
    if (body.user_id) {
      this.replayService.recordLearningSignal(body.user_id, 'ACCEPT', `Judgment: ${body.judgment_point_id} = ${body.selected_option}`);
    }

    // 获取当前快照
    const latestSnapshot = this.replayService.getLatestSnapshot(tripRunId);
    if (!latestSnapshot) {
      return { error: 'No snapshot found for this trip run' };
    }

    // 返回需要的信息供重新评估
    return {
      success: true,
      trip_run_id: tripRunId,
      judgment_applied: {
        judgment_point_id: body.judgment_point_id,
        selected_option: body.selected_option,
      },
      current_snapshot_id: latestSnapshot.snapshot_id,
      message: 'User judgment recorded. Re-evaluation should be triggered by the orchestrator.',
      // 建议：调用方应使用此信息触发 ClaudeOrchestrator 的重新评估
      suggested_action: 'TRIGGER_REEVALUATION',
    };
  }

  @Get('judgment/:tripRunId/pending')
  @ApiOperation({ summary: '获取待处理的判断点', description: '获取用户需要回答的判断点列表' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  getPendingJudgments(@Param('tripRunId') tripRunId: string) {
    const latestSnapshot = this.replayService.getLatestSnapshot(tripRunId);
    if (!latestSnapshot || !latestSnapshot.decision_output) {
      return { pending_judgments: [], message: 'No decision output found' };
    }

    const judgmentRequired = latestSnapshot.decision_output.user_judgment_required || [];
    return {
      trip_run_id: tripRunId,
      pending_judgments: judgmentRequired,
      total: judgmentRequired.length,
      snapshot_id: latestSnapshot.snapshot_id,
    };
  }
}
