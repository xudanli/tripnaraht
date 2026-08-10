// src/agent/agent.controller.ts
import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, Logger, Optional, Headers, Res, Req, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiOkResponse, ApiExtraModels } from '@nestjs/swagger';
import { AgentService } from './services/agent.service';
import { HotspotRegistryService } from '../skills/world/services/hotspot-registry.service';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from './dto/route-and-run.dto';
import {
  RouteAndRunTaskInitResponseDto,
  RouteAndRunTaskStatusResponseDto,
} from './dto/route-and-run-task.dto';
import {
  LedgerHealingMetricsDto,
  LedgerHealingObservabilityDto,
  LedgerHealingStepDto,
  LEDGER_HEALING_ICELAND_SUCCESS_EXAMPLE,
} from './dto/ledger-healing-observability.dto';
import { ReplayFromTraceRequestDto } from './dto/replay-from-trace.dto';
import { buildTravelOntologyStateFromOrchestrator } from '../decision/kernel/travel-ontology.mapper';
import { Public } from '../auth/decorators/public.decorator';
import { ConfirmNegotiationResponseDto, NegotiationResolutionDto } from './dto/confirm-negotiation.dto';
import { RevisionTimelineResponseDto } from './dto/itinerary-revision-timeline.dto';
import { TripRobustnessDashboardResponseDto } from './dto/trip-robustness-dashboard.dto';
import { ItineraryRollbackRequestDto, ItineraryRollbackResponseDto } from './dto/itinerary-rollback.dto';
import {
  ApplyBookingCartActionRequestDto,
  ApplyBookingCartActionResponseDto,
} from './dto/booking-cart-checkout.dto';
import {
  ApplyOpenWorldVerificationRequestDto,
  ApplyOpenWorldVerificationResponseDto,
} from './dto/open-world-verification.dto';
import { LogDecisionRequestDto, LogDecisionResponseDto } from './dto/log-decision.dto';
import {
  SelectTravelDecisionRequestDto,
  SelectTravelDecisionResponseDto,
} from './dto/select-travel-decision.dto';
import {
  ConflictStrategyOptionsRequestDto,
  ConflictStrategyOptionsResponseDto,
} from './dto/conflict-strategy-options.dto';
import { ActionExecutionService } from './services/action-execution.service';
import { PhysicalActionPlanEnricherService } from '../domain/spatial/physical-action-plan-enricher.service';
import { RouteAndRunTaskStreamService } from './services/route-and-run-task-stream.service';
import { normalizeRouteAndRunRequestMessage, resolveRouteAndRunUserMessage } from './utils/resolve-route-and-run-message.util';
import { attachOtelTraceContextToRouteAndRunRequest } from '../harness/tracing/harness-otel-correlation.util';
import { EXPOSED_AGENT_TRANSPORT_MODES } from '../common/constants/travel-mode-scope.constants';

/**
 * Agent Controller
 * 
 * 统一入口：POST /agent/route_and_run
 * 
 * COALA 骨架 + ReAct 思维流的双系统架构：
 * - System 1（快）：API/CRUD/简单查询（< 3s）
 * - System 2（慢）：ReAct 循环 + 工具 + 规划（< 60s）
 */
@ApiTags('agent')
@ApiExtraModels(LedgerHealingObservabilityDto, LedgerHealingStepDto, LedgerHealingMetricsDto)
@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);
  private static readonly CONSTRAINTS_META_VERSION = '2026-05-01';
  private static readonly TRANSPORT_MODES_META = EXPOSED_AGENT_TRANSPORT_MODES;

  constructor(
    private readonly agentService: AgentService,
    @Optional() private readonly hotspotRegistry?: HotspotRegistryService,
    @Optional() private readonly actionExecution?: ActionExecutionService,
    @Optional() private readonly physicalActionPlanEnricher?: PhysicalActionPlanEnricherService,
    @Optional() private readonly routeAndRunTaskStream?: RouteAndRunTaskStreamService,
  ) {}

  /**
   * 统一出口：当编排产出的 `action_plan` 含 `physical_domain` 时，追加 Action PREVIEW（含 suggestive healing），不阻塞编排主路径。
   */
  private async maybeAttachActionExecutionPreview(
    request: RouteAndRunRequestDto,
    response: RouteAndRunResponseDto,
  ): Promise<void> {
    if (!this.actionExecution) return;
    const tripId = request.trip_id?.trim();
    const payload = response.result?.payload as Record<string, unknown> | undefined;
    if (!tripId || !payload) return;

    if (this.physicalActionPlanEnricher) {
      try {
        await this.physicalActionPlanEnricher.enrichRouteAndRunPayload(payload);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[route_and_run] PhysicalActionPlanEnricher failed (non-blocking): ${msg}`);
      }
    }

    const orch = payload.orchestrationResult as { itinerary?: { action_plan?: unknown[] } } | undefined;
    const actionPlan = orch?.itinerary?.action_plan;
    if (!Array.isArray(actionPlan) || actionPlan.length === 0) return;

    const hasPhysical = actionPlan.some((a: unknown) => {
      if (!a || typeof a !== 'object') return false;
      const ai = (a as Record<string, unknown>).action_input;
      if (!ai || typeof ai !== 'object') return false;
      const pd = (ai as Record<string, unknown>).physical_domain;
      if (!pd || typeof pd !== 'object') return false;
      const seg = (pd as Record<string, unknown>).segment_id;
      const ent = (pd as Record<string, unknown>).enter_at;
      return typeof seg === 'string' && seg.trim() && typeof ent === 'string' && ent.trim();
    });
    if (!hasPhysical) return;

    try {
      const preview = await this.actionExecution.preview({
        request_id: `${request.request_id}-physical_gate`,
        trip_id: tripId,
        execution_mode: request.options?.execution_mode ?? 'ADVICE_ONLY',
        action_plan: actionPlan as any,
      });
      payload.actionExecutionPreview = {
        status: preview.status,
        message: preview.message,
        action_previews: preview.action_previews,
        accepted_actions: preview.accepted_actions,
        requires_confirmation_count: preview.requires_confirmation_count,
        high_risk_count: preview.high_risk_count,
      };
      this.appendPhysicalHealingNarrative(response);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[route_and_run] actionExecutionPreview failed: ${msg}`);
    }
  }

  /**
   * 将物理门 + 建议型自愈摘要追加到 `answer_text`，使对话主文案与结构化 `actionExecutionPreview` 对齐。
   */
  private appendPhysicalHealingNarrative(response: RouteAndRunResponseDto): void {
    const payload = response.result?.payload as Record<string, unknown> | undefined;
    const aep = payload?.actionExecutionPreview as Record<string, unknown> | undefined;
    const previews = aep?.action_previews;
    if (!Array.isArray(previews) || previews.length === 0) return;

    const blocked = previews.filter((p: unknown) => (p as { status?: string })?.status === 'blocked');
    if (blocked.length === 0) return;

    const withSuggestion = blocked.filter((p: unknown) => {
      const x = p as {
        physical_validator_interrupt_mode?: string;
        suggested_healing_options?: unknown[];
      };
      return (
        x.physical_validator_interrupt_mode === 'INTERRUPT_WITH_SUGGESTION' &&
        Array.isArray(x.suggested_healing_options) &&
        x.suggested_healing_options.length > 0
      );
    });

    const lines: string[] = [];
    if (withSuggestion.length > 0) {
      lines.push('');
      lines.push(
        '**【物理门 · 建议型修复】** 当前草案在路段可通行性上未通过复核；系统已生成可一键重预览的调整方案（结构化字段见 `result.payload.actionExecutionPreview`）：',
      );
      for (const p of withSuggestion.slice(0, 3)) {
        const opts = (p as { suggested_healing_options?: Array<{ summary?: string }> }).suggested_healing_options ?? [];
        for (const o of opts.slice(0, 2)) {
          if (o?.summary && String(o.summary).trim()) lines.push(`- ${String(o.summary).trim()}`);
        }
      }
      lines.push('采纳方式：选择界面上的修复项，或使用返回的 `healed_action_input` 再次发起预览（契约：`PREVIEW_WITH_HEALED_INPUT_V1`）。');
    } else {
      lines.push('');
      lines.push(
        '**【物理门】** 当前草案存在路段或时空约束拦截；详见 `result.payload.actionExecutionPreview.action_previews` 中的违规项并调整行程。',
      );
    }

    const base = String(response.result?.answer_text ?? '').trimEnd();
    response.result.answer_text = base ? `${base}\n${lines.join('\n')}` : lines.join('\n').trim();
  }

  @Public()
  @Get('route_and_run/constraints-meta')
  @Get('meta/transport-modes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取约束字段元数据（transport modes）',
    description:
      '为前端约束输入表单提供稳定的枚举元数据（preferred/forbidden modes、中英标签、别名、字段 schema、版本号）。',
  })
  @ApiResponse({
    status: 200,
    description: '约束元数据',
  })
  getConstraintsMeta() {
    return {
      version: AgentController.CONSTRAINTS_META_VERSION,
      transport_modes: AgentController.TRANSPORT_MODES_META,
      fields: {
        preferred_modes: { type: 'array', items: 'transport_modes' },
        forbidden_modes: { type: 'array', items: 'transport_modes' },
        max_wind_speed_tolerance_mps: { type: 'number', min: 0, max: 80 },
      },
    };
  }

  /**
   * 策略冲突「决策对话」：解释冲突机制 + 2–3 个对齐选项（基于 MultiAgent 协作快照）
   */
  @Public()
  @Post('strategy/conflict_options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '策略冲突选项（UI 决策对话）',
    description:
      '在 PlanningWorkbench 已写入 MAC 状态后，按 trip_id 读取冲突摘要并返回规则生成的对齐策略卡片。',
  })
  @ApiResponse({ status: 200, type: ConflictStrategyOptionsResponseDto })
  async getConflictStrategyOptions(
    @Body() body: ConflictStrategyOptionsRequestDto,
  ): Promise<ConflictStrategyOptionsResponseDto> {
    return this.agentService.getConflictStrategyOptions(body.trip_id);
  }

  @Public() // 暂时设为公开路由，用于测试（生产环境可能需要认证）
  @Post('route_and_run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '智能体统一入口 - 路由并执行',
    description: `
智能体统一入口。**行程规划产品脊柱**为 Claude 图状态机（\`CLAUDE_SM\`），不是 ReAct 主循环：

INTAKE → STATE_UPDATE → RESEARCH → POI_SELECTION → GATE_EVAL → CONTEXT_BUILD
→ PLAN_GEN → OPTIMIZE → VERIFY ⇄ REPAIR → NARRATE → FEEDBACK → HALLUCINATION → END

**入口分流（仍存在，但不替代主链）**：
- 硬规则短路：支付/退款/浏览器 → 需 consent
- 明确 CRUD / 事实查询 → System 1 快路径（API / RAG）
- 规划/多约束 / 已绑定 trip 改排 → 状态机主链（默认 \`execution_mode=ADVICE_ONLY\`）

**主链裁决**：
- Main REPAIR ≤ 3；RETURN_TO_RESEARCH ≤ 1
- GATE BLOCK 禁止进入 PLAN_GEN；VERIFY 只裁决可交付，不写库
- 瑕疵草案仅显式 \`allow_flawed_draft_narrate=true\`；\`delivery_verdict=FLAWED_DRAFT\` 禁止 AUTO 写回

**三人格（门控投影）**：Abu / Dr.Dre / Neptune → \`gate_result.guardian_results\` / \`explain.guardian_personas\`

**权威写回**不在本接口默认路径；见 Confirm / Apply / Execute / Commit 各产品走廊。

**返回**：route · result（含 \`trusted_delivery_v1.delivery_verdict\`）· explain · observability
    `.trim(),
  })
  @ApiBody({
    type: RouteAndRunRequestDto,
    description: '智能体请求参数',
    examples: {
      '简单查询': {
        value: {
          request_id: 'req-001',
          user_id: 'user-123',
          message: '推荐新宿拉面',
        },
      },
      '规划请求': {
        value: {
          request_id: 'req-002',
          user_id: 'user-123',
          message: '规划5天东京游，包含浅草寺、东京塔、新宿',
          options: {
            max_seconds: 60,
            max_steps: 8,
          },
        },
      },
      '条件分支': {
        value: {
          request_id: 'req-003',
          user_id: 'user-123',
          message: '如果赶不上日落就改去横滨',
          options: {
            max_seconds: 30,
            max_steps: 5,
          },
        },
      },
    },
  })
  @ApiOkResponse({
    description: '成功返回路由和执行结果',
    type: RouteAndRunResponseDto,
    content: {
      'application/json': {
        examples: {
          observability_ledger_healing_iceland: {
            summary: 'observability.ledger_healing（冰岛南岸 staging · 成功自愈）',
            description:
              '与 `fixtures/agent/ledger-healing-iceland-success.observability.json` 对齐；`steps[].action` 为内核 trace 原文。',
            value: {
              observability: {
                layers: ['ledger_reconcile_blocking_start', 'ledger_reconcile_converged'],
                ledger_healing: LEDGER_HEALING_ICELAND_SUCCESS_EXAMPLE,
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description:
      '已委托后台 Durable Task（`options.async_mode=AUTO|FORCE` 且 `async_task.is_async_delegated=true`）；轮询 `GET /agent/task/status/:taskId`',
    type: RouteAndRunResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数无效',
  })
  @ApiResponse({
    status: 500,
    description: '服务器内部错误',
  })
  async routeAndRun(
    @Body() request: RouteAndRunRequestDto,
    @Headers('x-client-profile') xClientProfile?: string,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: import('express').Response,
  ): Promise<RouteAndRunResponseDto> {
    attachOtelTraceContextToRouteAndRunRequest(request, req?.headers);
    const headerProfile = xClientProfile?.trim();
    if (headerProfile) {
      request.meta = { ...(request.meta ?? {}), client_profile: request.meta?.client_profile ?? headerProfile };
    }
    normalizeRouteAndRunRequestMessage(request);
    if (!resolveRouteAndRunUserMessage(request).trim()) {
      throw new BadRequestException(
        'message 不能为空；请传 message 或在 conversation_context.recent_messages 中提供用户话术',
      );
    }
    // Hotspot observation (metrics-driven v0): record station pairing usage for PT warmup scheduler.
    const pair = (request as any)?.emergency_constraints?.pt_station_pair;
    if (this.hotspotRegistry && pair?.station_a && pair?.station_b) {
      this.hotspotRegistry.observeRequest({
        provider: 'stub_gtfs',
        station_a: String(pair.station_a),
        station_b: String(pair.station_b),
        weight: 1,
      });
    }
    const response = await this.agentService.routeAndRun(request);
    if (response.async_task?.is_async_delegated === true && res) {
      res.status(HttpStatus.ACCEPTED);
    }
    await this.maybeAttachActionExecutionPreview(request, response);

    const actionPlan =
      response.result?.payload?.orchestrationResult?.itinerary?.action_plan || [];

    // Action 闭环默认输出：在统一出口补齐，避免侵入 AgentService 的多分支返回逻辑。
    // ITINERARY_ADJUST 走廊自动落库时由 assembler 预填 actionExecution，此处不覆盖。
    if (!response.result?.payload?.actionExecution) {
      const pendingActions = actionPlan.map((action: any) => ({
        action_id: action.action_id,
        action_type: action.action_type,
        target_type: action.target_type,
        requires_confirmation: action.requires_confirmation,
        risk_level: action.risk_level,
      }));
      response.result.payload.actionExecution = {
        mode: request.options?.execution_mode || 'ADVICE_ONLY',
        status: request.options?.execution_mode && request.options.execution_mode !== 'ADVICE_ONLY'
          ? 'PENDING_CONFIRM'
          : 'NOT_STARTED',
        requires_confirmation_count: pendingActions.filter((a) => a.requires_confirmation).length,
        pendingActions,
      };
    } else if (
      response.result.payload.actionExecution.pendingActions &&
      response.result.payload.actionExecution.pendingActions.length === 0 &&
      actionPlan.length > 0
    ) {
      response.result.payload.actionExecution.pendingActions = actionPlan.map((action: any) => ({
        action_id: action.action_id,
        action_type: action.action_type,
        target_type: action.target_type,
        requires_confirmation: action.requires_confirmation,
        risk_level: action.risk_level,
      }));
    }
    const pendingActions = response.result.payload.actionExecution.pendingActions || [];
    response.result.payload.actionExecution.requires_confirmation_count = pendingActions.filter(
      (a) => a.requires_confirmation,
    ).length;

    if (
      !response.result.payload.travelOntologyState &&
      response.result.payload.orchestrationResult?.state
    ) {
      const derived = buildTravelOntologyStateFromOrchestrator(
        response.result.payload.orchestrationResult.state,
      );
      if (derived) {
        response.result.payload.travelOntologyState = derived;
      }
    }

    return response;
  }

  @Public()
  @Post('route_and_run/async')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: '智能体统一入口（异步）— 秒回 task_id，后台执行完整编排',
    description: `
与同步 \`POST /agent/route_and_run\` 相同请求体，但立即返回 \`task_id\` 与初始进度。
前端请轮询 \`GET /agent/task/status/:taskId\`（建议 1.5–2s 间隔）；\`status=SUCCESS\` 时 \`data\` 为完整 \`RouteAndRunResponseDto\`。

进度字段：\`current_phase\`（OrchestrationStep）、\`progress_percentage\`、\`message\`。
    `.trim(),
  })
  @ApiBody({ type: RouteAndRunRequestDto })
  @ApiResponse({ status: 202, type: RouteAndRunTaskInitResponseDto })
  async routeAndRunAsync(
    @Body() request: RouteAndRunRequestDto,
    @Headers('x-client-profile') xClientProfile?: string,
  ): Promise<RouteAndRunTaskInitResponseDto> {
    const headerProfile = xClientProfile?.trim();
    if (headerProfile) {
      request.meta = { ...(request.meta ?? {}), client_profile: request.meta?.client_profile ?? headerProfile };
    }
    return this.agentService.routeAndRunAsync(request);
  }

  @Public()
  @Get('task/status/:taskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '查询 route_and_run 异步任务进度与最终结果',
    description: '从 Redis/内存读取 `task_progress:{taskId}`；终态 SUCCESS 时 data 含完整编排响应。',
  })
  @ApiResponse({ status: 200, type: RouteAndRunTaskStatusResponseDto })
  @ApiResponse({ status: 404, description: '任务不存在或已过期' })
  async getRouteAndRunTaskStatus(
    @Param('taskId') taskId: string,
  ): Promise<RouteAndRunTaskStatusResponseDto> {
    return this.agentService.getRouteAndRunTaskStatus(taskId);
  }

  @Public()
  @Post('task/resume/:taskId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'P2：显式触发异步任务 Worker 续跑',
    description:
      '当 `task_lease_v1.lease_status=STALE` 且仍有 resume 预算时，用 `durable_trip_run_id` + request_snapshot 重新入队。轮询 status 也会在 STALE 时自动尝试 resume。',
  })
  @ApiResponse({ status: 202, description: '已调度续跑' })
  @ApiResponse({ status: 404, description: '任务不存在' })
  async resumeRouteAndRunTask(@Param('taskId') taskId: string) {
    return this.agentService.resumeRouteAndRunTask(taskId);
  }

  @Public()
  @Get('task/stream/:taskId')
  @ApiOperation({
    summary: 'route_and_run 异步任务进度（SSE）',
    description: `
与 \`GET /agent/task/status/:taskId\` 同源数据；按编排阶段推送 \`event: message\`，终态 \`RESULT\`/\`ERROR\` 后发送 \`event: end\`。

前端用法：\`POST /agent/route_and_run/async\` 取得 \`task_id\` 后 \`new EventSource('/api/agent/task/stream/' + taskId)\`。

与轮询可并存；终态 \`RESULT\` 的 \`data\` 字段与 status 接口一致。
    `.trim(),
  })
  @ApiResponse({ status: 200, description: 'text/event-stream' })
  @ApiResponse({ status: 404, description: '任务不存在或已过期' })
  async getRouteAndRunTaskStream(
    @Param('taskId') taskId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.routeAndRunTaskStream) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        success: false,
        error: { code: 'SSE_UNAVAILABLE', message: 'Task stream service is not configured' },
      });
      return;
    }
    await this.routeAndRunTaskStream.streamTask(taskId, req, res);
  }

  @Public()
  @Post('replay_from_trace')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '从 §16 执行轨迹重放（产品接口）',
    description:
      '仅通过 `route_and_run` 主链重入：装载 Redis 冻结记忆、合并 replay profile，不暴露 ReplayExecutionKernel 为 HTTP 路径。自动启用 `orchestration_replay_strict_seal`（禁止编排 mode fallback、禁止 routeContext enricher、`execution_model_allow_upgrade=false`）。可选 `expected_change_impact_descriptor_v1`：注入 CID 并比对响应 trace（语义回归）。',
  })
  @ApiBody({ type: ReplayFromTraceRequestDto })
  @ApiResponse({ status: 200, type: RouteAndRunResponseDto })
  @ApiResponse({ status: 400, description: 'trace_id 与 trace 不一致或参数无效' })
  @ApiResponse({ status: 404, description: '无对应记忆快照' })
  @ApiResponse({ status: 503, description: '快照持久化未配置' })
  async replayFromTrace(@Body() body: ReplayFromTraceRequestDto): Promise<RouteAndRunResponseDto> {
    const response = await this.agentService.replayFromTrace(body);
    const syntheticRequest: RouteAndRunRequestDto = {
      request_id: response.request_id,
      user_id: body.user_id ?? 'anonymous',
      trip_id: body.trip_id,
      message: body.message ?? '(replay_from_trace)',
    };
    await this.maybeAttachActionExecutionPreview(syntheticRequest, response);
    return response;
  }

  @Public()
  @Post('confirm_negotiation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '确认协商结果并回灌行程',
    description: '客户端必须回传 expected_negotiation_hash 作为乐观锁，防止确认过期方案。',
  })
  @ApiBody({ type: NegotiationResolutionDto })
  @ApiResponse({ status: 200, type: ConfirmNegotiationResponseDto })
  @ApiResponse({ status: 409, description: '协商已过期或不匹配，需要重新协商' })
  async confirmNegotiation(@Body() input: NegotiationResolutionDto): Promise<ConfirmNegotiationResponseDto> {
    return await this.agentService.confirmNegotiation(input);
  }

  @Public()
  @Post('decisions/:decisionId/select')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '选择旅行决策方案（Decision Support Commit）',
    description:
      '将 option 写入 TravelDecisionProblem → trip.metadata.travelDecisionCommitments + travelDecisionContract；' +
      '并镜像冰岛自驾车型/节奏字段。不静默改行程；若返回 draft_bridge_message，请再用 route_and_run 生成调整草案。',
  })
  @ApiBody({ type: SelectTravelDecisionRequestDto })
  @ApiResponse({ status: 200, type: SelectTravelDecisionResponseDto })
  async selectTravelDecision(
    @Param('decisionId') decisionId: string,
    @Body() body: SelectTravelDecisionRequestDto,
  ): Promise<SelectTravelDecisionResponseDto> {
    const { selectTravelDecisionOption } = await import(
      './services/decision-support-fast-path.util'
    );
    const result = await selectTravelDecisionOption({
      agent: this.agentService,
      decisionId,
      optionId: body.option_id,
      selectedBy: body.selected_by,
      tripId: body.trip_id,
    });
    if (result.ok === false) {
      return { ok: false, reason: result.reason };
    }
    if (body.trip_id && result.problem.tripId !== body.trip_id) {
      return { ok: false, reason: 'trip_id_mismatch' };
    }
    return {
      ok: true,
      decision_id: result.problem.decisionId,
      decision_key: result.problem.decisionKey,
      option_id: result.problem.selection?.optionId,
      state: result.problem.state,
      persisted_to_trip_metadata: result.persisted,
      contract_patch: result.contractPatch,
      travel_decision_contract: result.travelDecisionContract as Record<string, unknown> | undefined,
      draft_bridge_message: result.draftBridgeMessage,
      next: result.draftBridgeMessage
        ? { suggested_route_and_run_message: result.draftBridgeMessage }
        : undefined,
    };
  }

  @Public()
  @Get('trips/:tripId/decision-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '查询行程决策状态（开放题 + 已提交账本）',
    description:
      '读取 trip.metadata 中的 travelDecisionOpenProblems / travelDecisionCommitments / travelDecisionContract。',
  })
  async getTripDecisionStatus(@Param('tripId') tripId: string): Promise<{
    ok: boolean;
    reason?: string;
    status?: import('./decision-support').TripDecisionStatusV1;
  }> {
    const tid = String(tripId ?? '').trim();
    if (!tid) return { ok: false, reason: 'trip_id_required' };
    const { PrismaService } = await import('../prisma/prisma.service');
    const prisma =
      (this.agentService as any).prisma ??
      (this.agentService as any).moduleRef?.get?.(PrismaService, { strict: false });
    if (!prisma?.trip?.findUnique) {
      return { ok: false, reason: 'prisma_unavailable' };
    }
    const trip = await prisma.trip.findUnique({
      where: { id: tid },
      select: { metadata: true },
    });
    if (!trip) return { ok: false, reason: 'trip_not_found' };
    const { buildTripDecisionStatus } = await import('./decision-support');
    return {
      ok: true,
      status: buildTripDecisionStatus({ tripId: tid, metadata: trip.metadata }),
    };
  }

  @Public()
  @Post('booking_cart/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '预订购物车状态流转',
    description: `
客户端回传 \`route_and_run\` 产出的 \`ui_display.booking_cart\` 快照，执行：
- \`update_selection\`：更新选中条目（同 slot 仅一项）
- \`apply_saving\`：应用 \`savings_opportunities[saving_index]\` 换选
- \`confirm_ready\`：确认可 checkout（超预算需 \`acknowledge_over_budget\`）
- \`submit_checkout\`：提交预订意向，返回 deep_links

**注意**：采样报价，TripNara 不代扣款；跳转外部供应商完成支付。
    `.trim(),
  })
  @ApiBody({ type: ApplyBookingCartActionRequestDto })
  @ApiResponse({ status: 200, type: ApplyBookingCartActionResponseDto })
  async applyBookingCartAction(
    @Body() input: ApplyBookingCartActionRequestDto,
  ): Promise<ApplyBookingCartActionResponseDto> {
    return this.agentService.applyBookingCartAction(input);
  }

  @Public()
  @Post('open_world_verification/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '开放世界 POI 核实任务状态流转',
    description: `
客户端回传 \`route_and_run\` 产出的 \`ui_display.open_world_discovery\` 快照，执行：
- \`mark_verified\`：标记 stub 已核实（可选 \`promoted_place_id\` 绑定真实 POI）
- \`discard_stub\`：丢弃 provisional 节点

**注意**：无服务端持久化；客户端需用返回的 \`open_world_discovery\` 更新本地快照 / trip metadata。
    `.trim(),
  })
  @ApiBody({ type: ApplyOpenWorldVerificationRequestDto })
  @ApiResponse({ status: 200, type: ApplyOpenWorldVerificationResponseDto })
  applyOpenWorldVerificationAction(
    @Body() input: ApplyOpenWorldVerificationRequestDto,
  ): ApplyOpenWorldVerificationResponseDto {
    return this.agentService.applyOpenWorldVerificationAction(input);
  }

  @Public()
  @Post('log_decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '审计/埋点：记录 NEED_CONFIRMATION 协商点用户决策',
    description:
      '记录用户在协商点的行为（Confirm / Discard / Reject / View 等）进入 Decision Log / Decision DNA；best-effort，不写入 Revision Chain。',
  })
  @ApiBody({ type: LogDecisionRequestDto })
  @ApiResponse({ status: 200, type: LogDecisionResponseDto })
  async logDecision(@Body() input: LogDecisionRequestDto): Promise<LogDecisionResponseDto> {
    return await this.agentService.logDecision(input);
  }

  @Public()
  @Get('negotiation_revision/:revisionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '读取协商行程修订快照（审计向量）',
    description: '返回 resolution_patch_summary、delta_*、interrupted_items 等，供决策时间轴 UI 使用。',
  })
  @ApiResponse({ status: 200, description: 'Revision row' })
  @ApiResponse({ status: 404, description: 'Revision 不存在' })
  async getNegotiationRevision(@Param('revisionId') revisionId: string) {
    return await this.agentService.getNegotiationRevisionSnapshot(revisionId);
  }

  @Public()
  @Get('trip/:tripId/robustness_dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Robustness Dashboard（物理 + 组织双维）',
    description:
      '返回 tripnara.trip_robustness_dashboard@v1：rollout 双曲线、bottleneck cards、Alignment Tier-3 因果 tuple 摘要。优先读 Trip.metadata 缓存；?recompute=1 强制重算。',
  })
  @ApiResponse({ status: 200, type: TripRobustnessDashboardResponseDto })
  async getTripRobustnessDashboard(
    @Param('tripId') tripId: string,
    @Req() req: Request,
  ): Promise<TripRobustnessDashboardResponseDto> {
    const forceRecompute =
      String((req.query as Record<string, unknown>)?.recompute ?? '') === '1';
    return await this.agentService.getTripRobustnessDashboard(tripId, { forceRecompute });
  }

  @Public()
  @Get('trip/:tripId/itinerary_revision_timeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '决策时间轴：行程修订链聚合',
    description:
      '按时间顺序返回该 trip 下所有 itinerary_revisions，并附带叙事摘要与回滚锚点（rollback_to_revision_id）。',
  })
  @ApiResponse({ status: 200, type: RevisionTimelineResponseDto })
  async getItineraryRevisionTimeline(@Param('tripId') tripId: string): Promise<RevisionTimelineResponseDto> {
    return await this.agentService.getItineraryRevisionTimeline(tripId);
  }

  @Public()
  @Post('rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '一键物理回滚（Time Machine）',
    description:
      '按 revision_id 读取目标 revision 的 snapshot，净化的副本写入响应体；同一事务内更新 Trip（status=PLANNING，清理协商相关 metadata）；并追加 kind=ROLLBACK 新版本，parent 指向回滚前链头。行程项 AWAITING_CONFIRMATION/OK → PLANNED，并移除 metadata.resolution。',
  })
  @ApiBody({ type: ItineraryRollbackRequestDto })
  @ApiResponse({ status: 200, type: ItineraryRollbackResponseDto })
  @ApiResponse({ status: 400, description: '参数或状态不允许回滚' })
  @ApiResponse({ status: 404, description: 'revision 不存在' })
  async rollbackItinerary(@Body() body: ItineraryRollbackRequestDto): Promise<ItineraryRollbackResponseDto> {
    return await this.agentService.rollbackItinerary(body);
  }

  /** Same contract as `POST /agent/rollback` (explicit “rollback_to_revision” path for clients). */
  @Public()
  @Post('rollback_to_revision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '一键物理回滚（别名路径）',
    description: '与 POST /agent/rollback 相同：revision_id 指定目标快照；追加 ROLLBACK 跃迁并写回 Trip 状态。',
  })
  @ApiBody({ type: ItineraryRollbackRequestDto })
  @ApiResponse({ status: 200, type: ItineraryRollbackResponseDto })
  @ApiResponse({ status: 400, description: '参数或状态不允许回滚' })
  @ApiResponse({ status: 404, description: 'revision 不存在' })
  async rollbackToRevisionEndpoint(@Body() body: ItineraryRollbackRequestDto): Promise<ItineraryRollbackResponseDto> {
    return await this.agentService.rollbackItinerary(body);
  }
}

