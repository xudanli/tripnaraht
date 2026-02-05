// src/agent/controllers/rlhf-signal.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  RLHFSignalCollectorService,
  BehaviorSignal,
  ExecutionSignal,
  FeedbackSignal,
  DecisionQualityAssessment,
  LearningSignal,
} from '../services/rlhf-signal-collector.service';
import { DecisionOutput } from '../interfaces/decision-node.interface';

/**
 * RLHF Signal API Controller
 * 
 * 提供 RLHF 信号收集、质量评估、学习信号生成的 API 端点
 */
@ApiTags('RLHF Signals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/rlhf')
export class RLHFSignalController {
  private readonly logger = new Logger(RLHFSignalController.name);

  constructor(private readonly rlhfService: RLHFSignalCollectorService) {}

  // ============================================================================
  // 行为信号 API
  // ============================================================================

  @Post('behavior')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录行为信号', description: '记录用户交互行为信号' })
  @ApiBody({
    description: '行为信号',
    schema: {
      type: 'object',
      properties: {
        trip_run_id: { type: 'string' },
        user_id: { type: 'string' },
        signal_type: { type: 'string', enum: ['VIEW', 'CLICK', 'HOVER', 'SCROLL', 'TIME_SPENT', 'EXPAND', 'COLLAPSE'] },
        target: {
          type: 'object',
          properties: {
            element_type: { type: 'string', enum: ['PLAN', 'OPTION', 'COMPARISON', 'RISK', 'TRADEOFF', 'DETAIL'] },
            element_id: { type: 'string' },
            element_context: { type: 'string' },
          },
        },
        metadata: {
          type: 'object',
          properties: {
            duration_ms: { type: 'number' },
            scroll_depth: { type: 'number' },
            viewport_visible: { type: 'boolean' },
          },
        },
      },
    },
  })
  recordBehaviorSignal(@Body() signal: Omit<BehaviorSignal, 'signal_id' | 'timestamp'>): BehaviorSignal {
    this.logger.debug(`[RLHF] Recording behavior: ${signal.signal_type}`);
    return this.rlhfService.recordBehaviorSignal(signal);
  }

  @Post('behavior/plan-view')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录方案查看时间', description: '记录用户查看方案的时长' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        trip_run_id: { type: 'string' },
        plan_id: { type: 'string' },
        duration_ms: { type: 'number' },
      },
    },
  })
  recordPlanViewTime(@Body() body: { trip_run_id: string; plan_id: string; duration_ms: number }) {
    this.rlhfService.recordPlanViewTime(body.trip_run_id, body.plan_id, body.duration_ms);
    return { success: true, recorded: 'plan_view_time' };
  }

  @Post('behavior/detail')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录详情交互', description: '记录用户展开/收起详情的行为' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        trip_run_id: { type: 'string' },
        element_type: { type: 'string', enum: ['PLAN', 'OPTION', 'COMPARISON', 'RISK', 'TRADEOFF', 'DETAIL'] },
        element_id: { type: 'string' },
        action: { type: 'string', enum: ['EXPAND', 'COLLAPSE'] },
      },
    },
  })
  recordDetailInteraction(
    @Body() body: {
      trip_run_id: string;
      element_type: BehaviorSignal['target']['element_type'];
      element_id: string;
      action: 'EXPAND' | 'COLLAPSE';
    },
  ) {
    this.rlhfService.recordDetailInteraction(body.trip_run_id, body.element_type, body.element_id, body.action);
    return { success: true, recorded: 'detail_interaction' };
  }

  // ============================================================================
  // 执行信号 API
  // ============================================================================

  @Post('execution')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录执行信号', description: '记录行程执行信号' })
  @ApiBody({
    description: '执行信号',
    schema: {
      type: 'object',
      properties: {
        trip_run_id: { type: 'string' },
        signal_type: { type: 'string', enum: ['START', 'DEVIATION', 'SKIP', 'DELAY', 'EARLY', 'COMPLETE', 'ABORT'] },
        context: {
          type: 'object',
          properties: {
            planned_item_id: { type: 'string' },
            planned_time: { type: 'string' },
            actual_time: { type: 'string' },
            deviation_minutes: { type: 'number' },
            reason: { type: 'string' },
          },
        },
      },
    },
  })
  recordExecutionSignal(@Body() signal: Omit<ExecutionSignal, 'signal_id' | 'timestamp'>): ExecutionSignal {
    this.logger.debug(`[RLHF] Recording execution: ${signal.signal_type}`);
    return this.rlhfService.recordExecutionSignal(signal);
  }

  @Post('execution/deviation')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录行程偏差', description: '记录计划与实际执行的偏差' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        trip_run_id: { type: 'string' },
        planned_item_id: { type: 'string' },
        planned_time: { type: 'string', format: 'date-time' },
        actual_time: { type: 'string', format: 'date-time' },
        reason: { type: 'string' },
      },
    },
  })
  recordDeviation(
    @Body() body: {
      trip_run_id: string;
      planned_item_id: string;
      planned_time: string;
      actual_time: string;
      reason?: string;
    },
  ) {
    this.rlhfService.recordDeviation(
      body.trip_run_id,
      body.planned_item_id,
      body.planned_time,
      body.actual_time,
      body.reason,
    );
    return { success: true, recorded: 'deviation' };
  }

  @Post('execution/skip')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录跳过的活动', description: '记录用户跳过的计划活动' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        trip_run_id: { type: 'string' },
        planned_item_id: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  })
  recordSkippedActivity(@Body() body: { trip_run_id: string; planned_item_id: string; reason: string }) {
    this.rlhfService.recordSkippedActivity(body.trip_run_id, body.planned_item_id, body.reason);
    return { success: true, recorded: 'skipped_activity' };
  }

  // ============================================================================
  // 反馈信号 API
  // ============================================================================

  @Post('feedback')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录反馈信号', description: '记录用户显式反馈' })
  @ApiBody({
    description: '反馈信号',
    schema: {
      type: 'object',
      properties: {
        trip_run_id: { type: 'string' },
        user_id: { type: 'string' },
        decision_point_id: { type: 'string' },
        feedback_type: { type: 'string', enum: ['ACCEPT', 'REJECT', 'MODIFY', 'QUESTION', 'RATING', 'COMMENT'] },
        value: {
          type: 'object',
          properties: {
            rating: { type: 'number' },
            choice: { type: 'string' },
            modification: { type: 'object' },
            comment: { type: 'string' },
          },
        },
        context: { type: 'object' },
      },
    },
  })
  recordFeedbackSignal(@Body() signal: Omit<FeedbackSignal, 'signal_id' | 'timestamp'>): FeedbackSignal {
    this.logger.debug(`[RLHF] Recording feedback: ${signal.feedback_type}`);
    return this.rlhfService.recordFeedbackSignal(signal);
  }

  @Post('feedback/accept')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录接受推荐', description: '记录用户接受推荐方案' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        trip_run_id: { type: 'string' },
        decision_point_id: { type: 'string' },
        chosen_option_id: { type: 'string' },
      },
    },
  })
  recordAcceptance(@Body() body: { trip_run_id: string; decision_point_id: string; chosen_option_id: string }) {
    this.rlhfService.recordAcceptance(body.trip_run_id, body.decision_point_id, body.chosen_option_id);
    return { success: true, recorded: 'acceptance' };
  }

  @Post('feedback/reject')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录拒绝推荐', description: '记录用户拒绝推荐方案' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        trip_run_id: { type: 'string' },
        decision_point_id: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  })
  recordRejection(@Body() body: { trip_run_id: string; decision_point_id: string; reason?: string }) {
    this.rlhfService.recordRejection(body.trip_run_id, body.decision_point_id, body.reason);
    return { success: true, recorded: 'rejection' };
  }

  @Post('feedback/rating')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记录用户评分', description: '记录用户对决策的评分' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        trip_run_id: { type: 'string' },
        decision_point_id: { type: 'string' },
        rating: { type: 'number', minimum: 1, maximum: 5 },
        comment: { type: 'string' },
      },
    },
  })
  recordRating(
    @Body() body: { trip_run_id: string; decision_point_id: string; rating: number; comment?: string },
  ) {
    this.rlhfService.recordRating(body.trip_run_id, body.decision_point_id, body.rating, body.comment);
    return { success: true, recorded: 'rating' };
  }

  // ============================================================================
  // 质量评估 API
  // ============================================================================

  @Post('quality/:tripRunId/:decisionPointId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '评估决策质量', description: '评估指定决策点的质量' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  @ApiParam({ name: 'decisionPointId', description: '决策点 ID' })
  assessDecisionQuality(
    @Param('tripRunId') tripRunId: string,
    @Param('decisionPointId') decisionPointId: string,
    @Body() decisionOutput: DecisionOutput,
  ): DecisionQualityAssessment {
    this.logger.log(`[RLHF] Assessing quality for ${tripRunId}/${decisionPointId}`);
    return this.rlhfService.assessDecisionQuality(tripRunId, decisionPointId, decisionOutput);
  }

  // ============================================================================
  // 学习信号 API
  // ============================================================================

  @Get('learning/:tripRunId')
  @ApiOperation({ summary: '生成学习信号', description: '基于收集的信号生成学习信号' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  @ApiResponse({ status: 200, description: '返回学习信号列表' })
  generateLearningSignals(@Param('tripRunId') tripRunId: string): LearningSignal[] {
    this.logger.log(`[RLHF] Generating learning signals for ${tripRunId}`);
    return this.rlhfService.generateLearningSignals(tripRunId);
  }

  // ============================================================================
  // 摘要 API
  // ============================================================================

  @Get('summary/:tripRunId')
  @ApiOperation({ summary: '获取信号摘要', description: '获取行程的信号收集摘要' })
  @ApiParam({ name: 'tripRunId', description: '行程运行 ID' })
  getSignalSummary(@Param('tripRunId') tripRunId: string) {
    return this.rlhfService.getSignalSummary(tripRunId);
  }
}
