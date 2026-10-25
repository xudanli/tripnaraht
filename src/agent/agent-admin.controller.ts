// src/agent/agent-admin.controller.ts
/**
 * Agent Admin Controller
 * 
 * 后台管理 Agent 运行（TripRun）和尝试（TripAttempt）的接口
 */

import { Controller, Get, Post, Param, Query, Body, Logger, Optional, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiHeader,
  ApiBody,
} from '@nestjs/swagger';
import { AdminStrictAuthGuard } from '../admin/guards/admin-strict-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { AgentRunAdminService } from './services/agent-run-admin.service';
import { AgentRunReplayAdminService } from './services/agent-run-replay-admin.service';
import { RuntimeReplayPersistenceService } from './services/runtime-replay-persistence.service';
import { RecordTripRunFeedbackDto } from './dto/record-trip-run-feedback.dto';
import { RecordTripRunBenchmarkDto } from './dto/record-trip-run-benchmark.dto';

@ApiTags('agent-admin')
@Controller('agent/admin')
export class AgentAdminController {
  private readonly logger = new Logger(AgentAdminController.name);

  constructor(
    private readonly agentRunAdminService: AgentRunAdminService,
    @Optional() private readonly agentRunReplayAdminService?: AgentRunReplayAdminService,
    @Optional() private readonly runtimeReplayPersistence?: RuntimeReplayPersistenceService,
  ) {}

  @Public()
  @Get('runs/stats')
  @ApiOperation({
    summary: '获取 Agent 运行统计（管理接口）',
    description: '获取 TripRun 的统计信息，包括按状态、阶段的统计。',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'planningPhase', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: '成功返回运行统计',
    type: ApiSuccessResponseDto,
  })
  async getRunStats(@Query() query: any) {
    try {
      const stats = await this.agentRunAdminService.getRunStats({
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        planningPhase: query.planningPhase,
      });
      return successResponse(stats);
    } catch (error: any) {
      this.logger.error(`获取运行统计失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('evaluation/failure-patterns')
  @ApiOperation({
    summary: 'Outcome→Evaluation：失败模式聚合',
    description:
      '从 TripRun outcome/failure 推导 SAFETY_MISJUDGMENT 等 pattern，驱动 Policy/Prompt 改进。不扩 observability_v1。',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'patternId', required: false, type: String })
  @ApiQuery({ name: 'minCount', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFailurePatterns(@Query() query: any) {
    try {
      const data = await this.agentRunAdminService.getFailurePatterns({
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        patternId: query.patternId,
        minCount: query.minCount ? parseInt(query.minCount, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });
      return successResponse(data);
    } catch (error: any) {
      this.logger.error(`失败模式聚合失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('metrics/policy')
  @ApiOperation({
    summary: 'Agent / Tool / Memory Policy Metrics',
    description: '聚合成功率、采纳率、工具 changedDecision、记忆 helpful/wrong。',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPolicyMetrics(@Query() query: any) {
    try {
      const data = await this.agentRunAdminService.getPolicyMetrics({
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });
      return successResponse(data);
    } catch (error: any) {
      this.logger.error(`Policy metrics 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('performance')
  @ApiOperation({
    summary: '获取 Agent 性能分析（管理接口）',
    description: '获取 Agent 运行的性能分析，包括平均耗时、P50/P95/P99等指标。',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: '成功返回性能分析',
    type: ApiSuccessResponseDto,
  })
  async getPerformance(@Query() query: any) {
    try {
      const performance = await this.agentRunAdminService.getPerformanceAnalysis({
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
      });
      return successResponse(performance);
    } catch (error: any) {
      this.logger.error(`获取性能分析失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('runs')
  @ApiOperation({
    summary: '获取 Agent 运行列表（管理接口）',
    description: '获取 TripRun 列表，支持分页、筛选、排序。',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED'] })
  @ApiQuery({ name: 'planningPhase', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({
    status: 200,
    description: '成功返回运行列表',
    type: ApiSuccessResponseDto,
  })
  async getRuns(@Query() query: any) {
    try {
      const result = await this.agentRunAdminService.getRuns({
        tripId: query.tripId,
        userId: query.userId,
        status: query.status,
        planningPhase: query.planningPhase,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`获取运行列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('runs/compare')
  @ApiOperation({
    summary: '对比两个已有 TripRun 的决策差分',
  })
  @ApiQuery({ name: 'sourceRunId', required: true })
  @ApiQuery({ name: 'targetRunId', required: true })
  async compareRuns(
    @Query('sourceRunId') sourceRunId: string,
    @Query('targetRunId') targetRunId: string,
  ) {
    try {
      if (!sourceRunId?.trim() || !targetRunId?.trim()) {
        return errorResponse(ErrorCode.BAD_REQUEST, 'sourceRunId and targetRunId required');
      }
      const result = await this.agentRunAdminService.compareRuns(sourceRunId, targetRunId);
      if (!result) {
        return errorResponse(ErrorCode.NOT_FOUND, 'one or both runs not found');
      }
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`Compare runs 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('runs/:id')
  @ApiOperation({
    summary: '获取 Agent 运行详情（管理接口）',
    description: '获取单个 TripRun 的详细信息，包含所有关联的 TripAttempt。',
  })
  @ApiParam({ name: 'id', description: 'TripRun ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回运行详情',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '运行不存在',
    type: ApiErrorResponseDto,
  })
  async getRunDetail(@Param('id') id: string) {
    try {
      const run = await this.agentRunAdminService.getRunById(id);
      if (!run) {
        return errorResponse(ErrorCode.NOT_FOUND, `运行 ${id} 不存在`);
      }
      return successResponse(run);
    } catch (error: any) {
      this.logger.error(`获取运行详情失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('attempts')
  @ApiOperation({
    summary: '获取 Attempt 列表（管理接口）',
    description: '获取 TripAttempt 列表，支持分页、筛选。',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tripRunId', required: false, type: String })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'] })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({
    status: 200,
    description: '成功返回 Attempt 列表',
    type: ApiSuccessResponseDto,
  })
  async getAttempts(@Query() query: any) {
    try {
      const result = await this.agentRunAdminService.getAttempts({
        tripRunId: query.tripRunId,
        tripId: query.tripId,
        userId: query.userId,
        status: query.status,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`获取 Attempt 列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('attempts/:id')
  @ApiOperation({
    summary: '获取 Attempt 详情（管理接口）',
    description: '获取单个 TripAttempt 的详细信息。',
  })
  @ApiParam({ name: 'id', description: 'TripAttempt ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回 Attempt 详情',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Attempt 不存在',
    type: ApiErrorResponseDto,
  })
  async getAttemptDetail(@Param('id') id: string) {
    try {
      const attempt = await this.agentRunAdminService.getAttemptById(id);
      if (!attempt) {
        return errorResponse(ErrorCode.NOT_FOUND, `Attempt ${id} 不存在`);
      }
      return successResponse(attempt);
    } catch (error: any) {
      this.logger.error(`获取 Attempt 详情失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /** @Public：跳过全局 JwtAuthGuard；实际鉴权由 AdminStrictAuthGuard（JWT 管理员或 ADMIN_GOD_API_KEY）。 */
  @Public()
  @UseGuards(AdminStrictAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-admin-god-key',
    required: false,
    description: 'Optional when ADMIN_GOD_API_KEY is set',
  })
  @Get('runtime-replay-anchors/by-snapshot/:snapshotId')
  @ApiOperation({
    summary: '按 snapshot_id 获取单条 P3 replay 锚点（管理接口）',
    description:
      '与 observability.runtime_replay_persistence.snapshot_id 一致；唯一索引查询。',
  })
  @ApiParam({ name: 'snapshotId', description: '64 字符 hex snapshot_id' })
  @ApiResponse({ status: 200, description: '单条锚点', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: '不存在', type: ApiErrorResponseDto })
  async getRuntimeReplayAnchorBySnapshot(@Param('snapshotId') snapshotId: string) {
    try {
      const s = typeof snapshotId === 'string' ? snapshotId.trim() : '';
      if (!s) {
        return errorResponse(ErrorCode.BAD_REQUEST, 'snapshotId is required');
      }
      const anchor = await this.runtimeReplayPersistence?.findAnchorBySnapshotId(s);
      if (!anchor) {
        return errorResponse(ErrorCode.NOT_FOUND, `replay anchor not found for snapshot_id=${s}`);
      }
      return successResponse({ anchor });
    } catch (error: any) {
      this.logger.error(`查询 replay 锚点失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @UseGuards(AdminStrictAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-admin-god-key',
    required: false,
    description: 'Optional when ADMIN_GOD_API_KEY is set',
  })
  @Get('runtime-replay-anchors')
  @ApiOperation({
    summary: '按 query_id 列出 P3 runtime replay 锚点（管理接口）',
    description:
      'query_id 与 route_and_run 的 request_id 对齐；用于与 observability.runtime_replay_persistence 对账。',
  })
  @ApiQuery({ name: 'query_id', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: '锚点列表', type: ApiSuccessResponseDto })
  async listRuntimeReplayAnchors(@Query('query_id') queryId: string, @Query('limit') limitRaw?: string) {
    try {
      const q = typeof queryId === 'string' ? queryId.trim() : '';
      if (!q) {
        return errorResponse(ErrorCode.BAD_REQUEST, 'query_id is required');
      }
      const parsed = limitRaw !== undefined && limitRaw !== '' ? parseInt(String(limitRaw), 10) : 50;
      const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
      const anchors = (await this.runtimeReplayPersistence?.listAnchorsByQueryId(q, limit)) ?? [];
      return successResponse({ anchors });
    } catch (error: any) {
      this.logger.error(`列出 replay 锚点失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('runs/:id/feedback')
  @ApiOperation({
    summary: '写入 Agent Run 用户反馈 / 行为（管理/客户端）',
    description:
      '写入 TripRun.metadata.observability_v1.feedback / behavior，并旁路镜像到 rlhf_*_signals。用于评分、是否接受、是否改路线等闭环。',
  })
  @ApiParam({ name: 'id', description: 'TripRun ID' })
  @ApiBody({ type: RecordTripRunFeedbackDto })
  @ApiResponse({ status: 200, description: '写入成功', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: '运行不存在', type: ApiErrorResponseDto })
  async recordRunFeedback(@Param('id') id: string, @Body() body: RecordTripRunFeedbackDto) {
    try {
      const hasOutcome = typeof body.outcomeEvent === 'string' && !!body.outcomeEvent;
      const hasFeedback =
        body.rating != null ||
        typeof body.accepted === 'boolean' ||
        typeof body.modified === 'boolean' ||
        typeof body.userCorrection === 'string' ||
        typeof body.comment === 'string';
      const hasBehavior =
        body.behavior &&
        (typeof body.behavior.clickedRecommend === 'boolean' ||
          typeof body.behavior.regenerated === 'boolean' ||
          typeof body.behavior.editedRoute === 'boolean' ||
          typeof body.behavior.abandoned === 'boolean');

      if (!hasFeedback && !hasBehavior && !hasOutcome) {
        return errorResponse(
          ErrorCode.BAD_REQUEST,
          'outcomeEvent, feedback, or behavior fields required',
        );
      }

      const result = await this.agentRunAdminService.recordRunFeedback(id, {
        feedback: hasFeedback
          ? {
              rating: body.rating ?? null,
              accepted: body.accepted ?? null,
              modified: body.modified ?? null,
              userCorrection: body.userCorrection ?? body.comment ?? null,
              comment: body.comment ?? null,
              source: body.source ?? 'admin_api',
            }
          : null,
        behavior: hasBehavior
          ? {
              clickedRecommend: body.behavior?.clickedRecommend ?? null,
              regenerated: body.behavior?.regenerated ?? null,
              editedRoute: body.behavior?.editedRoute ?? null,
              abandoned: body.behavior?.abandoned ?? null,
              source: body.source ?? 'admin_api',
            }
          : null,
        outcomeEvent: hasOutcome
          ? {
              event: body.outcomeEvent!,
              detail: body.outcomeDetail ?? null,
              dayIndex: body.dayIndex ?? null,
              source: body.source ?? 'admin_api',
            }
          : null,
        source: body.source ?? 'admin_api',
        decisionPointId: body.decisionPointId ?? null,
        context: body.context ?? null,
      });

      if (!result) {
        return errorResponse(ErrorCode.NOT_FOUND, `运行 ${id} 不存在`);
      }
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`写入运行反馈失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('runs/:id/benchmark')
  @ApiOperation({
    summary: '写入 Agent Run Golden Set / Benchmark 结果',
    description:
      '供 eval harness / CI 回写：taskId、pass、score、failedDimension → observability_v1.benchmark。',
  })
  @ApiParam({ name: 'id', description: 'TripRun ID' })
  @ApiBody({ type: RecordTripRunBenchmarkDto })
  @ApiResponse({ status: 200, description: '写入成功', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: '运行不存在', type: ApiErrorResponseDto })
  async recordRunBenchmark(@Param('id') id: string, @Body() body: RecordTripRunBenchmarkDto) {
    try {
      const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
      if (!taskId) {
        return errorResponse(ErrorCode.BAD_REQUEST, 'taskId is required');
      }
      const result = await this.agentRunAdminService.recordRunBenchmark(id, {
        taskId,
        pass: body.pass ?? null,
        score: body.score ?? null,
        failedDimension: body.failedDimension ?? [],
      });
      if (!result) {
        return errorResponse(ErrorCode.NOT_FOUND, `运行 ${id} 不存在`);
      }
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`写入运行 benchmark 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('runs/:id/replay')
  @ApiOperation({
    summary: 'Decision Replay：克隆上下文重跑并对比',
    description:
      '默认 reexecute 调用 route_and_run；或 mode=compare_only + compareToRunId 对比两个已有 Run。返回 Safety/Preference 等差分。',
  })
  @ApiParam({ name: 'id', description: '源 TripRun ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['reexecute', 'compare_only'] },
        compareToRunId: { type: 'string' },
        messageOverride: { type: 'string' },
        dryRun: { type: 'boolean' },
      },
    },
  })
  async replayRun(
    @Param('id') id: string,
    @Body()
    body?: {
      mode?: 'reexecute' | 'compare_only';
      compareToRunId?: string;
      messageOverride?: string;
      dryRun?: boolean;
    },
  ) {
    try {
      if (!this.agentRunReplayAdminService) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'replay service unavailable');
      }
      const result = await this.agentRunReplayAdminService.replayRun(id, body);
      if (!result) {
        return errorResponse(ErrorCode.NOT_FOUND, `运行 ${id} 不存在`);
      }
      if ((result as any).error && !(result as any).compare) {
        return errorResponse(ErrorCode.BAD_REQUEST, String((result as any).error));
      }
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`Decision replay 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('runs/:id/cancel')
  @ApiOperation({
    summary: '取消运行（管理接口）',
    description: '取消指定的 TripRun，将其状态设置为 FAILED。',
  })
  @ApiParam({ name: 'id', description: 'TripRun ID' })
  @ApiResponse({
    status: 200,
    description: '成功取消运行',
    type: ApiSuccessResponseDto,
  })
  async cancelRun(@Param('id') id: string) {
    try {
      const success = await this.agentRunAdminService.cancelRun(id);
      if (!success) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, '取消运行失败');
      }
      return successResponse({ cancelled: true, runId: id });
    } catch (error: any) {
      this.logger.error(`取消运行失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

}
