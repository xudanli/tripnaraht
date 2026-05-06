// src/agent/agent.controller.ts
import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, Logger, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { AgentService } from './services/agent.service';
import { HotspotRegistryService } from '../skills/world/services/hotspot-registry.service';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from './dto/route-and-run.dto';
import { buildTravelOntologyStateFromOrchestrator } from '../decision/kernel/travel-ontology.mapper';
import { Public } from '../auth/decorators/public.decorator';
import { ConfirmNegotiationResponseDto, NegotiationResolutionDto } from './dto/confirm-negotiation.dto';
import { RevisionTimelineResponseDto } from './dto/itinerary-revision-timeline.dto';
import { ItineraryRollbackRequestDto, ItineraryRollbackResponseDto } from './dto/itinerary-rollback.dto';
import { LogDecisionRequestDto, LogDecisionResponseDto } from './dto/log-decision.dto';
import {
  ConflictStrategyOptionsRequestDto,
  ConflictStrategyOptionsResponseDto,
} from './dto/conflict-strategy-options.dto';
import { ActionExecutionService } from './services/action-execution.service';

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
@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);
  private static readonly CONSTRAINTS_META_VERSION = '2026-05-01';
  private static readonly TRANSPORT_MODES_META = [
    { value: 'TRANSIT', label_zh: '公共交通', label_en: 'Transit', aliases: ['公交', '地铁'] },
    { value: 'RAIL', label_zh: '火车', label_en: 'Rail', aliases: ['铁路'] },
    { value: 'DRIVE', label_zh: '自驾', label_en: 'Drive', aliases: ['开车'] },
    { value: 'MOTORCYCLE', label_zh: '摩托', label_en: 'Motorcycle', aliases: ['摩托车'] },
    { value: 'FERRY', label_zh: '轮渡', label_en: 'Ferry', aliases: ['渡轮'] },
  ] as const;

  constructor(
    private readonly agentService: AgentService,
    @Optional() private readonly hotspotRegistry?: HotspotRegistryService,
    @Optional() private readonly actionExecution?: ActionExecutionService,
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[route_and_run] actionExecutionPreview failed: ${msg}`);
    }
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
   * 路由并执行
   * 
   * 智能路由到 System 1 或 System 2，并执行相应的处理流程。
   * 
   * System 1 路径：
   * - SYSTEM1_API: 标准 API / CRUD / 简单查询
   * - SYSTEM1_RAG: 知识库/向量检索
   * 
   * System 2 路径：
   * - SYSTEM2_REASONING: ReAct + 工具 + TravelPlanner/Critic
   * - SYSTEM2_WEBBROWSE: 无头浏览器兜底（仅授权后）
   */
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
智能体统一入口，根据用户输入自动路由到 System 1（快速路径）或 System 2（ReAct 循环）。

**路由策略**：
- 硬规则短路：支付/退款/浏览器 → System2 + consent_required
- 明确 CRUD → System1_API
- 单纯事实查询 → System1_RAG
- 规划/多约束/无 API → System2_REASONING

**System 2 ReAct 循环**：
- Plan → Act → Observe → Critic → Repair
- 受预算控制（max_seconds, max_steps）
- 自动可行性检查（时间窗、日界、午餐、鲁棒时间）

**返回结果**：
- route: 路由决策（route, confidence, reasons, budget）
- result: 执行结果（status, answer_text, payload）
- explain: 决策日志（decision_log）
- observability: 可观测性指标（latency, cost, tool_calls）
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
  @ApiResponse({
    status: 200,
    description: '成功返回路由和执行结果',
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
    @Body() request: RouteAndRunRequestDto
  ): Promise<RouteAndRunResponseDto> {
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
    await this.maybeAttachActionExecutionPreview(request, response);

    const actionPlan =
      response.result?.payload?.orchestrationResult?.itinerary?.action_plan || [];

    // Action 闭环默认输出：在统一出口补齐，避免侵入 AgentService 的多分支返回逻辑。
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

