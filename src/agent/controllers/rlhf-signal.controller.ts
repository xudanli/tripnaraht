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
  Inject,
  UseGuards,
  Optional,
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
import type { RlhfTradeoffComparisonDwell } from '../services/rlhf-decision-context.types';
import { DecisionOutput } from '../interfaces/decision-node.interface';
import { DecisionKernelService } from '../../decision/kernel/decision-kernel.service';
import type { IDsoFeedbackPersistence } from '../../decision/kernel/dso-feedback-persistence.interface';
import { DSO_FEEDBACK_PERSISTENCE } from '../../decision/kernel/dso-feedback-persistence.interface';
import type { DecisionState, UserRepairResolutionLabel } from '../../decision/kernel/decision-state.types';
import { projectJepaZStateFromDecisionState } from '../services/jepa-z-state.projection';

/**
 * RLHF Signal API Controller
 *
 * 提供 RLHF 信号收集、质量评估、学习信号生成的 API 端点
 * 用户反馈 API 统一经 Kernel.recordUserFeedback（DECISION_OS_PATENT_GAP_IMPLEMENTATION_PLAN）
 */
@ApiTags('RLHF Signals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/rlhf')
export class RLHFSignalController {
  private readonly logger = new Logger(RLHFSignalController.name);

  constructor(
    private readonly rlhfService: RLHFSignalCollectorService,
    @Optional() private readonly decisionKernel?: DecisionKernelService,
    @Optional() @Inject(DSO_FEEDBACK_PERSISTENCE) private readonly dsoFeedbackPersistence?: IDsoFeedbackPersistence,
  ) {}

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

  @Post('behavior/tradeoff-dwell')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '记录两难/方案对比停留',
    description: '记录用户在两个候选（如省钱 vs 省时）之间的对比视图停留毫秒，供 RLHF 与专利两难叙事对齐',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['trip_run_id', 'option_a_id', 'option_b_id', 'dwell_ms'],
      properties: {
        trip_run_id: { type: 'string' },
        user_id: { type: 'string' },
        option_a_id: { type: 'string' },
        option_b_id: { type: 'string' },
        dwell_ms: { type: 'number' },
        resolved_to: { type: 'string', enum: ['A', 'B', 'NONE'] },
        tradeoff_axis: { type: 'string', example: 'cost_vs_time' },
        decision_point_id: { type: 'string' },
      },
    },
  })
  recordTradeoffDwell(
    @Body()
    body: {
      trip_run_id: string;
      user_id?: string;
      option_a_id: string;
      option_b_id: string;
      dwell_ms: number;
      resolved_to?: 'A' | 'B' | 'NONE';
      tradeoff_axis?: string;
      decision_point_id?: string;
    },
  ): BehaviorSignal {
    const dwell: RlhfTradeoffComparisonDwell = {
      schemaVersion: 1,
      option_a_id: body.option_a_id,
      option_b_id: body.option_b_id,
      dwell_ms: body.dwell_ms,
      resolved_to: body.resolved_to,
      tradeoff_axis: body.tradeoff_axis,
      decision_point_id: body.decision_point_id,
    };
    return this.rlhfService.recordTradeoffComparisonDwell(body.trip_run_id, dwell, body.user_id);
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
  async recordExecutionSignal(
    @Body() signal: Omit<ExecutionSignal, 'signal_id' | 'timestamp'>,
  ): Promise<ExecutionSignal> {
    this.logger.debug(`[RLHF] Recording execution: ${signal.signal_type}`);
    const saved = this.rlhfService.recordExecutionSignal(signal);

    // world_error/user_drift 可训练闭环增强：把执行偏差信号回灌到 DSO
    if (saved?.trip_run_id) {
      await this.backfillExecutionObservationToDso(saved.trip_run_id, saved.signal_type, saved.context, {
        requestId: saved.signal_id,
        traceId: saved.signal_id,
      });
    }

    return saved;
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
  async recordDeviation(
    @Body() body: {
      trip_run_id: string;
      planned_item_id: string;
      planned_time: string;
      actual_time: string;
      reason?: string;
    },
  ) {
    // 先写入 RLHF DB（现有行为不变）
    this.rlhfService.recordDeviation(
      body.trip_run_id,
      body.planned_item_id,
      body.planned_time,
      body.actual_time,
      body.reason,
    );

    // 可训练闭环：把“执行偏差”回灌到 DSO，使得后续 JEPA world_error 有可变的真实风险口径
    if (this.dsoFeedbackPersistence) {
      const plannedMs = new Date(body.planned_time).getTime();
      const actualMs = new Date(body.actual_time).getTime();
      if (!Number.isNaN(plannedMs) && !Number.isNaN(actualMs)) {
        const deviationMinutes = Math.round((actualMs - plannedMs) / 60000);
        const absDev = Math.abs(deviationMinutes);

        const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
        const weatherRisk = clamp01(absDev / 120); // 120min 作为归一化上界假设

        // failureRiskLevel 仅支持 LOW/MEDIUM/HIGH：用偏差强度映射
        const failureRiskLevel: DecisionState['environmentState']['failureRiskLevel'] =
          absDev < 10 ? 'LOW' : absDev < 30 ? 'MEDIUM' : 'HIGH';

        const dso = await this.dsoFeedbackPersistence.getDso(body.trip_run_id);
        if (dso) {
          const now = new Date().toISOString();

          dso.environmentState = {
            ...(dso.environmentState ?? {}),
            weatherRisk,
            failureRiskLevel,
          };

          const zAfterExecutionObservation = projectJepaZStateFromDecisionState(dso);
          dso.history = [
            ...(dso.history ?? []),
            {
              type: 'jepa_z_state_after_execution_observation',
              summary: `after execution deviation (deviation_minutes=${deviationMinutes})`,
              at: now,
              next: zAfterExecutionObservation,
              meta: {
                request_id: `deviation:${body.planned_item_id}`,
                trace_id: `deviation:${body.trip_run_id}:${body.planned_item_id}`,
                version: dso.systemState?.version,
                signal_type: 'DEVIATION',
              },
            },
          ];

          await this.dsoFeedbackPersistence.persistDso(body.trip_run_id, dso);
        }
      }
    }
    return { success: true, recorded: 'deviation' };
  }

  /**
   * world_error 回灌口（同类 execution 信号）
   * 将执行偏差信号映射为“更真实”的世界观测，写入 DSO.environmentState + history 快照。
   */
  private async backfillExecutionObservationToDso(
    tripRunId: string,
    signalType: ExecutionSignal['signal_type'],
    context?: ExecutionSignal['context'],
    audit?: { requestId?: string; traceId?: string },
  ): Promise<void> {
    if (!this.dsoFeedbackPersistence) return;

    // START/DEVIATION：DEVIATION 走独立的 execution/deviation 精准接口，START 不构成“执行后观测”
    if (signalType === 'START' || signalType === 'DEVIATION') return;

    try {
      const dso = await this.dsoFeedbackPersistence.getDso(tripRunId);
      if (!dso) return;

      const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

      const plannedMs = typeof context?.planned_time === 'string' ? new Date(context.planned_time).getTime() : NaN;
      const actualMs = typeof context?.actual_time === 'string' ? new Date(context.actual_time).getTime() : NaN;
      const hasBothTimes = !Number.isNaN(plannedMs) && !Number.isNaN(actualMs);

      const deviationMinutesFromContext: number | null =
        typeof context?.deviation_minutes === 'number' && !Number.isNaN(context.deviation_minutes)
          ? Math.round(context.deviation_minutes)
          : hasBothTimes
            ? Math.round((actualMs - plannedMs) / 60000)
            : null;

      const absDev = typeof deviationMinutesFromContext === 'number' ? Math.abs(deviationMinutesFromContext) : null;

      // 默认映射：如果没有偏差分钟数，就用 signalType 级别给一个保守值
      let weatherRisk = 0.2;
      let failureRiskLevel: DecisionState['environmentState']['failureRiskLevel'] = 'LOW';

      if (signalType === 'COMPLETE') {
        weatherRisk = 0.15;
        failureRiskLevel = 'LOW';
      } else if (signalType === 'DELAY') {
        weatherRisk = typeof absDev === 'number' ? clamp01(absDev / 120) : 0.45;
        failureRiskLevel = typeof absDev === 'number' ? (absDev < 10 ? 'LOW' : absDev < 30 ? 'MEDIUM' : 'HIGH') : 'MEDIUM';
      } else if (signalType === 'EARLY') {
        weatherRisk = typeof absDev === 'number' ? clamp01(absDev / 120) : 0.35;
        failureRiskLevel = typeof absDev === 'number' ? (absDev < 10 ? 'LOW' : absDev < 30 ? 'MEDIUM' : 'HIGH') : 'MEDIUM';
      } else if (signalType === 'SKIP') {
        // skip 通常意味着“执行偏离/可达性/用户意愿”混合：先用中高风险近似
        weatherRisk = typeof absDev === 'number' ? clamp01(absDev / 90) : 0.6;
        failureRiskLevel = typeof absDev === 'number' ? (absDev < 10 ? 'LOW' : absDev < 30 ? 'MEDIUM' : 'HIGH') : 'HIGH';
      } else if (signalType === 'ABORT') {
        weatherRisk = typeof absDev === 'number' ? clamp01(absDev / 60) : 0.8;
        failureRiskLevel = 'HIGH';
      }

      const now = new Date().toISOString();
      dso.environmentState = {
        ...(dso.environmentState ?? {}),
        weatherRisk,
        failureRiskLevel,
      };

      const zAfterExecutionObservation = projectJepaZStateFromDecisionState(dso);
      dso.history = [
        ...(dso.history ?? []),
        {
          type: 'jepa_z_state_after_execution_observation',
          summary: `after execution signal=${signalType}${typeof absDev === 'number' ? `, absDev=${absDev}m` : ''}`,
          at: now,
          next: zAfterExecutionObservation,
          meta: {
            request_id: audit?.requestId,
            trace_id: audit?.traceId,
            version: dso.systemState?.version,
            signal_type: signalType,
          },
        },
      ];

      await this.dsoFeedbackPersistence.persistDso(tripRunId, dso);
    } catch {
      // 回灌失败不影响主链路；只是增强可训练性
    }
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

  @Post('decision/user-repair-resolution')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '记录 REPAIR/效用补偿澄清选择',
    description:
      '与 DSO.verification.escalationPlan.correlationId 对齐；payload 由客户端回传 correlation_id + user_repair_resolution。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['trip_run_id', 'correlation_id', 'user_repair_resolution'],
      properties: {
        trip_run_id: { type: 'string' },
        correlation_id: { type: 'string' },
        user_repair_resolution: {
          type: 'string',
          enum: ['ACCEPTED_AUTO_REPAIR', 'RELAXED_CONSTRAINTS', 'PROCEED_REGARDLESS', 'ABANDONED'],
        },
        /** 先知卡回传 INTAKE；REPAIR 效用补偿等可省略（默认 REPAIR） */
        phase: { type: 'string', enum: ['INTAKE', 'REPAIR'] },
        user_id: { type: 'string' },
      },
    },
  })
  async recordUserRepairResolution(
    @Body()
    body: {
      trip_run_id: string;
      correlation_id: string;
      user_repair_resolution: string;
      phase?: 'INTAKE' | 'REPAIR';
      user_id?: string;
    },
  ) {
    if (!this.decisionKernel) {
      this.logger.warn('[RLHF] recordUserRepairResolution: DecisionKernel 未注入');
      return { success: false, error: 'decision_kernel_unavailable' };
    }
    const out = await this.decisionKernel.recordUserRepairResolution({
      tripRunId: body.trip_run_id,
      correlationId: body.correlation_id,
      resolution: body.user_repair_resolution as UserRepairResolutionLabel,
      userId: body.user_id,
      feedbackPhase: body.phase,
    });
    return { success: out.ok, deduped: out.deduped, persisted: out.persisted };
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
  recordAcceptance(@Body() body: { trip_run_id: string; decision_point_id: string; chosen_option_id: string; user_id?: string }) {
    if (this.decisionKernel) {
      this.decisionKernel.recordUserFeedback({
        tripRunId: body.trip_run_id,
        userId: body.user_id ?? '',
        decisionPointId: body.decision_point_id,
        feedbackType: 'ACCEPT',
        value: { choice: body.chosen_option_id },
      }).catch((e) => this.logger.warn(`[RLHF] Kernel.recordUserFeedback: ${(e as Error)?.message}`));
    } else {
      this.rlhfService.recordAcceptance(body.trip_run_id, body.decision_point_id, body.chosen_option_id);
    }
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
  recordRejection(@Body() body: { trip_run_id: string; decision_point_id: string; reason?: string; user_id?: string }) {
    if (this.decisionKernel) {
      this.decisionKernel.recordUserFeedback({
        tripRunId: body.trip_run_id,
        userId: body.user_id ?? '',
        decisionPointId: body.decision_point_id,
        feedbackType: 'REJECT',
        value: { comment: body.reason },
      }).catch((e) => this.logger.warn(`[RLHF] Kernel.recordUserFeedback: ${(e as Error)?.message}`));
    } else {
      this.rlhfService.recordRejection(body.trip_run_id, body.decision_point_id, body.reason);
    }
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
    @Body() body: { trip_run_id: string; decision_point_id: string; rating: number; comment?: string; user_id?: string },
  ) {
    if (this.decisionKernel) {
      this.decisionKernel.recordUserFeedback({
        tripRunId: body.trip_run_id,
        userId: body.user_id ?? '',
        decisionPointId: body.decision_point_id,
        feedbackType: 'RATING',
        value: { rating: body.rating, comment: body.comment },
      }).catch((e) => this.logger.warn(`[RLHF] Kernel.recordUserFeedback: ${(e as Error)?.message}`));
    } else {
      this.rlhfService.recordRating(body.trip_run_id, body.decision_point_id, body.rating, body.comment);
    }
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
