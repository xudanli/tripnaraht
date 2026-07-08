// src/trips/decision/decision-engine.controller.ts

/**
 * 决策引擎 API 控制器
 *
 * 统一入口：/api/decision-engine/v1/*
 * 封装 TripDecisionEngine、StrategyOrchestrator、ConstraintEngine、Explainability 等能力
 *
 * 参考: docs/DECISION_ENGINE_API_PRD.md
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Logger,
  Optional,
  HttpCode,
  HttpStatus,
  Param,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { TripDecisionEngineService } from './trip-decision-engine.service';
import { HardTrekTripMetadataService } from '../../hiking-demo/services/hard-trek-trip-metadata.service';
import type { TrailPlanPreviewResult } from './adapters/trail-planning.adapter';
import { StrategyOrchestratorService } from './services/strategy-orchestrator.service';
import { ConstraintEngineService } from './constraints/constraint-engine.service';
import { ExplainabilityService } from './explainability/explainability.service';
import { MultiPlanGenerator } from './services/multi-plan-generator.service';
import { WorldModelContext, RoutePlanDraft } from './shared/world-model.types';
import { TripWorldState } from './world-model';
import { TripPlan } from './plan-model';
import { RealityExecutionBlockedError } from '../reality-kernel/reality-execution-gate';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { Public } from '../../auth/decorators/public.decorator';
import {
  GeneratePlanRequestDto,
  RepairPlanRequestDto,
  ValidateSafetyRequestDto,
  CheckConstraintsRequestDto,
  GenerateMultiplePlansRequestDto,
  ExplainPlanRequestDto,
  AdjustPacingRequestDto,
  ReplaceNodesRequestDto,
  RecordRealityOutcomeDto,
  EvaluateClosedLoopRequestDto,
  RecordClosedLoopFailureEventDto,
  RecordCausalOutcomeDto,
} from './dto/decision-engine-api.dto';
import { OpsRealityAuditService } from './services/ops-reality-audit.service';
import { OperationalPolicyService } from './operational-policy/operational-policy.service';
import {
  mergeOutcomeTelemetryRefs,
  type OpsRealityOutcomePayloadV1,
} from './observability/ops-reality-audit-payload';
import {
  coerceFailureOntologyPayload,
  mergeFailureOntologyIntoOutcome,
} from './failure-ontology/failure-ontology-outcome';
import { applyPrismaTripIdToWorldState } from '../execution-closure-persistence/apply-prisma-trip-id-to-world-state';
import { buildCausalRuntimeEcho } from '../causal-runtime/causal-runtime-echo.util';
import { CausalCounterfactualClosureService } from '../causal-runtime/causal-counterfactual-closure.service';
import {
  CausalRuntimeSessionService,
  enrichOpsOutcomeWithSession,
} from '../causal-runtime';
import { asTripWorldState } from '../causal-runtime/coerce-trip-world-state.util';
import { DecisionLoggingService } from './services/decision-logging.service';
import { PrismaService } from '../../prisma/prisma.service';
import { applyEmbeddedHikingToWorldState } from '../utils/embedded-hiking-trip-metadata.util';
import {
  buildLegacyEngineSsotBlockPayload,
  isLegacyTripEngineHttpBlocked,
} from '../../decision/kernel/decision-kernel-ssot.util';
import { DecisionLogStorageService } from './services/decision-log-storage.service';
import { TripClosedLoopService, type TripAction, type TripFailureEvent } from './closed-loop';
import { FullPlanSelectionService } from '../../decision-runtime/core/full-plan-selection.service';
import {
  isCanonicalExecutionEnabled,
  isCanonicalFullPlanSelectionEnabled,
  resolveDecisionRuntimeMode,
  resolveEffectiveRuntimeMode,
  shouldRunFullPlanOptimizationShadow,
} from '../../decision-runtime/constraints/constraint-evaluation.config';
import { resolveStagingShadowOptionsForRequest } from '../../decision-runtime/core/resolve-staging-shadow-options.util';
import { isShadowEvidencePersistenceEnabled } from '../../decision-runtime/observability/shadow-evidence-persistence.config';
import { OBJECTIVE_REGISTRY_VERSION } from '../../decision-runtime/objectives/objective-semantics.registry';
import {
  CONSTRAINT_POLICY_VERSION,
  resolveGitCommit,
} from '../../decision-runtime/benchmark/benchmark-config.util';
import { E1_BENCHMARK_MIGRATION } from '../../decision-runtime/benchmark/benchmark-fault-injection-gate.util';
import { BenchmarkPreflightGuard } from '../../decision-runtime/observability/benchmark-preflight.guard';
import type { DecisionCandidate } from '../../decision-runtime/candidates/contracts/decision-candidate';
import type { CanonicalConstraintReport } from '../../decision-runtime/constraints/contracts/canonical-constraint-report';
import { DecisionTriggerGatewayService } from '../../decision-runtime/trigger/decision-trigger.gateway.service';
import { isDecisionTriggerGatewayEnabled } from '../../decision-runtime/trigger/decision-trigger.config';
import { ConstraintShadowMetricsService } from '../../decision-runtime/constraints/constraint-shadow-metrics.service';
import { buildDecisionRuntimeCapabilitiesView } from '../../decision-runtime/execution/decision-runtime-capabilities.view';
import { buildTriggerCenterView } from '../../decision-runtime/trigger/trigger-center.view';
import { DecisionProviderRegistryService } from '../../decision-runtime/candidates/decision-provider-registry.service';
import { DecisionProviderInvocationService } from '../../decision-runtime/candidates/decision-provider-invocation.service';

@ApiTags('decision-engine')
@Controller('decision-engine/v1')
export class DecisionEngineController {
  private readonly logger = new Logger(DecisionEngineController.name);

  private pickHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    const lower = name.toLowerCase();
    const keys = Object.keys(headers);
    const found = keys.find((k) => k.toLowerCase() === lower);
    if (!found) return undefined;
    const v = headers[found];
    if (Array.isArray(v)) return v[0]?.trim();
    return typeof v === 'string' ? v.trim() : undefined;
  }

  constructor(
    private readonly decisionEngine: TripDecisionEngineService,
    private readonly hardTrekTripMetadata: HardTrekTripMetadataService,
    private readonly prisma: PrismaService,
    @Optional() private readonly strategyOrchestrator?: StrategyOrchestratorService,
    @Optional() private readonly constraintEngine?: ConstraintEngineService,
    @Optional() private readonly explainabilityService?: ExplainabilityService,
    @Optional() private readonly multiPlanGenerator?: MultiPlanGenerator,
    @Optional() private readonly opsRealityAudit?: OpsRealityAuditService,
    @Optional() private readonly operationalPolicy?: OperationalPolicyService,
    @Optional() private readonly decisionLogging?: DecisionLoggingService,
    @Optional() private readonly tripClosedLoop?: TripClosedLoopService,
    @Optional() private readonly decisionLogStorage?: DecisionLogStorageService,
    @Optional() private readonly causalCounterfactual?: CausalCounterfactualClosureService,
    @Optional() private readonly causalRuntimeSession?: CausalRuntimeSessionService,
    @Optional() private readonly fullPlanSelection?: FullPlanSelectionService,
    @Optional() private readonly decisionTriggerGateway?: DecisionTriggerGatewayService,
    @Optional() private readonly constraintShadowMetrics?: ConstraintShadowMetricsService,
    @Optional() private readonly providerRegistry?: DecisionProviderRegistryService,
    @Optional() private readonly providerInvocation?: DecisionProviderInvocationService,
  ) {}

  /** Echo causal runtime artifacts for frontend / OPS join. */
  private echoCausalRuntime(state: TripWorldState) {
    return buildCausalRuntimeEcho(state);
  }

  /** @deprecated use echoCausalRuntime */
  private echoLastDecisionCausalityId(state: TripWorldState): { lastDecisionCausalityId?: string } {
    const id = state.signals?.lastDecisionCausalityId?.trim();
    return id ? { lastDecisionCausalityId: id } : {};
  }

  private buildClosedLoopReport(plan: TripPlan, constraints?: Record<string, unknown>) {
    if (!this.tripClosedLoop || !plan?.days) return undefined;
    return this.tripClosedLoop.evaluate(
      this.tripClosedLoop.buildState(plan, { constraints: constraints ?? {} }),
    );
  }

  private buildClosedLoopPayload(plan: TripPlan, constraints?: Record<string, unknown>) {
    const closedLoopReport = this.buildClosedLoopReport(plan, constraints);
    return {
      closedLoopReport,
      closedLoopUiHints: closedLoopReport && this.tripClosedLoop
        ? this.tripClosedLoop.buildUiHints(closedLoopReport)
        : undefined,
    };
  }

  private buildClosedLoopFailureEvent(body: RecordClosedLoopFailureEventDto): TripFailureEvent {
    if (this.tripClosedLoop && body.plan?.days) {
      const state = this.tripClosedLoop.buildState(body.plan as TripPlan, {
        constraints: body.constraints ?? {},
      });
      return this.tripClosedLoop.recordFailureEvent(state, {
        tripId: body.tripId,
        actionId: body.actionId,
        eventType: body.eventType as TripFailureEvent['eventType'],
        failedReason: body.failedReason,
        affectedIssueIds: body.affectedIssueIds,
        affectedSlotIds: body.affectedSlotIds,
      });
    }

    return {
      tripId: body.tripId,
      actionId: body.actionId,
      eventType: body.eventType as TripFailureEvent['eventType'],
      failedReason: body.failedReason,
      affectedIssueIds: body.affectedIssueIds,
      affectedSlotIds: body.affectedSlotIds,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查', description: '决策引擎服务可用性检查' })
  @ApiResponse({ status: 200, description: '服务正常' })
  health() {
    return successResponse({
      status: 'ok',
      service: 'decision-engine',
      version: '1.0',
      capabilities: {
        generatePlan: true,
        repairPlan: true,
        validateSafety: !!this.strategyOrchestrator,
        checkConstraints: !!this.constraintEngine,
        explainPlan: !!this.explainabilityService,
        generateMultiplePlans: !!this.multiPlanGenerator,
        operationalPolicy: !!this.operationalPolicy,
        closedLoopEvaluation: !!this.tripClosedLoop,
        canonicalFullPlanSelection: isCanonicalFullPlanSelectionEnabled(),
        decisionRuntimeMode: resolveDecisionRuntimeMode(),
        effectiveRuntimeMode: resolveEffectiveRuntimeMode(),
        fullPlanOptimizationShadow: shouldRunFullPlanOptimizationShadow(),
      },
    });
  }

  @Get('runtime-capabilities')
  @Public()
  @ApiOperation({
    summary: 'Decision Runtime 能力矩阵 + SHADOW_COMPARE 指标',
    description:
      '只读 QA 端点：env flags + 进程内 constraint shadow divergence snapshot（无密钥）。',
  })
  runtimeCapabilities() {
    return successResponse(
      buildDecisionRuntimeCapabilitiesView(
        this.constraintShadowMetrics?.snapshot(),
        this.providerRegistry?.snapshot(),
      ),
    );
  }

  @Get('trigger-center/by-trip/:tripId')
  @Public()
  @ApiOperation({
    summary: 'M7 触发中心 — 行程级事件/影响/建议/处置',
    description:
      '只读：从 Trigger Gateway lineage 构建用户可读视图（发生了什么、影响范围、方案有效性、系统建议、是否需确认）。',
  })
  triggerCenterByTrip(@Param('tripId') tripId: string) {
    if (!this.decisionTriggerGateway) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'Decision Trigger Gateway 不可用');
    }
    const entries = this.decisionTriggerGateway.listLineage(tripId);
    return successResponse(buildTriggerCenterView(tripId, entries));
  }

  @Post('providers/research')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Agentic research provider (structured advisory artifact)',
    description: 'Returns tripnara.research_provider_result@v1 — no formal decision authority.',
  })
  async invokeResearchProvider(
    @Body() body: { tripId: string; query?: string; state?: TripWorldState },
  ) {
    try {
      if (!body.tripId?.trim()) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId is required');
      }
      if (!this.providerInvocation) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Provider invocation unavailable');
      }
      const result = await this.providerInvocation.invokeResearch({
        tripId: body.tripId.trim(),
        query: body.query,
        state: body.state,
      });
      return successResponse(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  @Post('providers/narration')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Agentic narration provider (structured explanation)',
    description: 'Returns tripnara.narration_provider_result@v1.',
  })
  async invokeNarrationProvider(
    @Body()
    body: {
      tripId: string;
      plan?: TripPlan;
      decisionRecordId?: string;
    },
  ) {
    try {
      if (!body.tripId?.trim()) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId is required');
      }
      if (!this.providerInvocation) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Provider invocation unavailable');
      }
      const result = await this.providerInvocation.invokeNarration({
        tripId: body.tripId.trim(),
        plan: body.plan,
        decisionRecordId: body.decisionRecordId,
      });
      return successResponse(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  @Post('providers/critic')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Constraint critic provider (structured signals)',
    description: 'Returns tripnara.critic_provider_result@v1.',
  })
  async invokeCriticProvider(
    @Body()
    body: {
      tripId: string;
      plan?: TripPlan;
      state?: TripWorldState;
    },
  ) {
    try {
      if (!body.tripId?.trim()) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId is required');
      }
      if (!this.providerInvocation) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Provider invocation unavailable');
      }
      const result = await this.providerInvocation.invokeCritic({
        tripId: body.tripId.trim(),
        plan: body.plan,
        state: body.state,
      });
      return successResponse(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  @Get('runtime-diagnostics')
  @Public()
  @UseGuards(BenchmarkPreflightGuard)
  @ApiOperation({
    summary: 'Live runtime configuration (no secrets)',
    description:
      'Benchmark preflight only — gated by RUNTIME_DIAGNOSTICS_ENABLED / BENCHMARK_PREFLIGHT_TOKEN in production.',
  })
  runtimeDiagnostics() {
    const hexKey = process.env.SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY?.trim();
    const blindingConfigured = Boolean(hexKey && /^[0-9a-fA-F]{64}$/.test(hexKey));
    const environment =
      process.env.DEPLOYMENT_ENV?.trim() ||
      process.env.NODE_ENV ||
      'development';
    return successResponse({
      environment,
      gitCommit: resolveGitCommit(),
      schemaVersion: E1_BENCHMARK_MIGRATION,
      runtimeMode: resolveEffectiveRuntimeMode(),
      canonicalFullPlanSelection: isCanonicalFullPlanSelectionEnabled(),
      canonicalExecutionEnabled: isCanonicalExecutionEnabled(),
      shadowEvidencePersistenceEnabled: isShadowEvidencePersistenceEnabled(),
      blindingEncryptionKeyConfigured: blindingConfigured,
      solverEngine: process.env.CP_SAT_SOLVER_ENGINE ?? 'cp-sat-lex-v1',
      objectiveRegistryVersion: OBJECTIVE_REGISTRY_VERSION,
      constraintPolicyVersion: CONSTRAINT_POLICY_VERSION,
    });
  }

  @Get('operational-policy')
  @Public()
  @ApiOperation({
    summary: '生效营运策略（P-OPS-3）',
    description: '默认策略合并环境变量 OPS_OPERATIONAL_POLICY_JSON 后的版本化配置（warn/degrade/block/reroute 语义）。',
  })
  @ApiResponse({ status: 200, description: '策略 JSON' })
  operationalPolicyEffective() {
    if (!this.operationalPolicy) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'Operational policy service unavailable');
    }
    return successResponse(this.operationalPolicy.getEffectivePolicy());
  }

  @Post('generate-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成计划', description: '根据世界状态生成行程计划' })
  @ApiBody({ type: GeneratePlanRequestDto })
  @ApiResponse({ status: 200, description: '生成成功' })
  async generatePlan(
    @Body() body: GeneratePlanRequestDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    try {
      if (isLegacyTripEngineHttpBlocked(headers)) {
        return errorResponse(
          ErrorCode.BUSINESS_ERROR,
          'Legacy TripDecisionEngine generate-plan is non-authoritative under Decision Kernel SSOT',
          buildLegacyEngineSsotBlockPayload(),
        );
      }
      if (!body.state?.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
      }
      const state = body.state as TripWorldState;
      applyPrismaTripIdToWorldState(state, body.tripId);
      const tripId = body.tripId ?? state.context?.tripId;
      if (tripId) {
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { metadata: true },
        });
        const embedded = applyEmbeddedHikingToWorldState(state, trip?.metadata);
        if (embedded.applied) {
          this.logger.debug(
            `embedded hiking generate-plan: durationDays=${embedded.hint?.effectiveDurationDays} segments=${embedded.hint?.segmentCount}`,
          );
        }
      }
      const { plan, log } = await this.decisionEngine.generatePlan(state, body.requestId);
      const hardPlan = log?.hardTrekTrailPlan as TrailPlanPreviewResult | undefined;
      if (tripId && hardPlan?.segments?.length) {
        try {
          await this.hardTrekTripMetadata.persistHardTrekTrailPlan(tripId, hardPlan);
        } catch (persistErr: any) {
          this.logger.warn(`hardTrekTrailPlan persist skipped: ${persistErr?.message}`);
        }
      }
      return successResponse({ plan, log, ...this.buildClosedLoopPayload(plan), ...this.echoCausalRuntime(state) });
    } catch (error: any) {
      if (error instanceof RealityExecutionBlockedError) {
        this.logger.warn(`generatePlan execution gate: ${error.message}`);
        return errorResponse(ErrorCode.BUSINESS_ERROR, error.message, {
          snapshotId: error.snapshotId,
          policy_codes: error.codes,
        });
      }
      this.logger.error(`generatePlan 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('causal-outcome')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'P5：记录实况 outcome 并关闭因果反事实环',
    description:
      '对比 causality_id 对应预测 metrics 与观测值，更新 Iceland 校准 / reflectiveCausalModel，并 dual-write Travel Event Store（RESULT）。',
  })
  @ApiBody({ type: RecordCausalOutcomeDto })
  async recordCausalOutcome(@Body() body: RecordCausalOutcomeDto) {
    if (!this.causalCounterfactual) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'CausalCounterfactualClosureService 不可用');
    }
    if (!body.state?.['context']) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
    }
    const state = asTripWorldState(body.state as Record<string, unknown>);
    if (!state) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
    }
    applyPrismaTripIdToWorldState(state, body.tripId);
    const causalityId = body.causality_id?.trim();
    if (!causalityId) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'causality_id 是必需的');
    }

    const result = await this.causalCounterfactual.closeLoop({
      state,
      causalityId,
      tripId: body.tripId,
      requestId: body.requestId,
      observation: {
        metrics: body.metrics ?? {},
        narrative: body.narrative,
        missedAppointment: body.missed_appointment,
      },
    });

    if (!result) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        '未找到 causality_id 或 metrics 不足以执行反事实闭环',
      );
    }

    return successResponse({
      report: result.report,
      travelEventPersisted: result.travelEventPersisted,
      travelEventId: result.travelEventId,
      ...this.echoCausalRuntime(state),
    });
  }

  @Post('repair-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '修复计划', description: '天气/闭馆等变化时最小改动修复' })
  @ApiBody({ type: RepairPlanRequestDto })
  @ApiResponse({ status: 200, description: '修复成功' })
  async repairPlan(
    @Body() body: RepairPlanRequestDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    try {
      if (isLegacyTripEngineHttpBlocked(headers)) {
        return errorResponse(
          ErrorCode.BUSINESS_ERROR,
          'Legacy TripDecisionEngine repair-plan is non-authoritative under Decision Kernel SSOT',
          buildLegacyEngineSsotBlockPayload(),
        );
      }
      if (!body.state?.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
      }
      if (!body.plan?.days) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan.days 是必需的');
      }
      const state = body.state as TripWorldState;
      applyPrismaTripIdToWorldState(state, body.tripId);
      const trigger = (body.trigger || 'signal_update') as any;
      const { plan, log } = await this.decisionEngine.repairPlan(state, body.plan as TripPlan, trigger);
      return successResponse({ plan, log, ...this.buildClosedLoopPayload(plan), ...this.echoCausalRuntime(state) });
    } catch (error: any) {
      if (error instanceof RealityExecutionBlockedError) {
        this.logger.warn(`repairPlan execution gate: ${error.message}`);
        return errorResponse(ErrorCode.BUSINESS_ERROR, error.message, {
          snapshotId: error.snapshotId,
          policy_codes: error.codes,
        });
      }
      this.logger.error(`repairPlan 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('validate-safety')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '安全校验', description: 'Abu 策略校验物理安全、危险区域' })
  @ApiBody({ type: ValidateSafetyRequestDto })
  @ApiResponse({ status: 200, description: '校验完成' })
  async validateSafety(@Body() body: ValidateSafetyRequestDto) {
    try {
      if (!this.strategyOrchestrator) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'StrategyOrchestrator 不可用');
      }
      if (!body.tripId) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId 是必需的');
      }
      if (!body.plan) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan 是必需的');
      }
      if (!body.worldContext) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'worldContext 是必需的');
      }
      const planWithTripId = {
        ...body.plan,
        tripId: body.plan.tripId || body.tripId,
      } as RoutePlanDraft;
      const result = await this.strategyOrchestrator.run(
        body.worldContext as WorldModelContext,
        planWithTripId,
      );
      return successResponse({
        allowed: result.allowed,
        violations: result.allowed ? [] : (result.logs || []).filter((l: any) => l.persona === 'ABU'),
        alternativeRoutes: [],
        message: result.allowed ? '行程通过安全校验' : '行程包含安全违规项',
      });
    } catch (error: any) {
      this.logger.error(`validateSafety 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('check-constraints')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '约束校验', description: '检查计划是否满足约束' })
  @ApiBody({ type: CheckConstraintsRequestDto })
  @ApiResponse({ status: 200, description: '校验完成' })
  async checkConstraints(@Body() body: CheckConstraintsRequestDto) {
    try {
      if (!body.state?.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
      }
      if (!body.plan?.days) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan.days 是必需的');
      }
      if (!this.constraintEngine) {
        return successResponse({
          feasible: true,
          violations: [],
          infeasibilityExplanation: null,
          rawCheckResult: { violations: [], isValid: true, summary: { errorCount: 0, warningCount: 0, infoCount: 0 } },
        });
      }
      const state = body.state as TripWorldState;
      applyPrismaTripIdToWorldState(state, body.tripId);
      const result = await this.constraintEngine.isFeasible(state, body.plan as TripPlan);
      return successResponse({
        feasible: result.feasible,
        violations: result.violations,
        infeasibilityExplanation: result.infeasibilityExplanation,
        canonicalReport: result.canonicalReport,
        constraintShadowComparison: result.constraintShadowComparison,
      });
    } catch (error: any) {
      this.logger.error(`checkConstraints 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('evaluate-closed-loop')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({
    summary: '闭环评估',
    description: '将 TripPlan 视为 TripState，可选先模拟 TripAction，再输出 safe/risky/blocked 决策报告与修复建议。',
  })
  @ApiBody({ type: EvaluateClosedLoopRequestDto })
  @ApiResponse({ status: 200, description: '评估完成' })
  evaluateClosedLoop(@Body() body: EvaluateClosedLoopRequestDto) {
    try {
      if (!this.tripClosedLoop) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'TripClosedLoopService 不可用');
      }
      if (!body.plan?.days) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan.days 是必需的');
      }

      const state = this.tripClosedLoop.buildState(body.plan as TripPlan, {
        constraints: body.constraints ?? {},
        acceptedRiskIssueIds: body.acceptedRiskIssueIds ?? [],
      });
      const report = this.tripClosedLoop.evaluate(
        state,
        body.action ? (body.action as TripAction) : undefined,
      );
      return successResponse({
        report,
        uiHints: this.tripClosedLoop.buildUiHints(report),
      });
    } catch (error: any) {
      this.logger.error(`evaluateClosedLoop 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('closed-loop/failure-events')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({
    summary: '记录闭环失败事件',
    description: '标准化记录用户拒绝、太累、执行失败、证据失效等 failure data，并尽量写入决策日志 metadata。',
  })
  @ApiBody({ type: RecordClosedLoopFailureEventDto })
  @ApiResponse({ status: 200, description: '记录完成' })
  async recordClosedLoopFailureEvent(@Body() body: RecordClosedLoopFailureEventDto) {
    try {
      if (!body.eventType) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'eventType 是必需的');
      }

      const event = this.buildClosedLoopFailureEvent(body);
      if (this.decisionLogStorage) {
        await this.decisionLogStorage.saveLogEntry(
          {
            persona: 'USER_ACTION',
            action: body.eventType === 'RISK_ACCEPTED' ? 'ALLOW' : 'MODIFY',
            decisionSource: 'USER',
            decisionStage: 'PLAN_EDIT',
            explanation: body.failedReason
              ? `闭环失败事件: ${body.eventType} - ${body.failedReason}`
              : `闭环失败事件: ${body.eventType}`,
            reasonCodes: ['CLOSED_LOOP_FAILURE', body.eventType],
            evidenceRefs: body.affectedIssueIds ?? [],
            timestamp: event.timestamp,
            metadata: {
              closedLoopFailureEvent: event,
              affectedSlotIds: body.affectedSlotIds ?? [],
            },
          },
          {
            tripId: body.tripId,
            metadata: {
              source: 'decision-engine.closed-loop.failure-events',
            },
          },
        );
      }

      return successResponse({
        event,
        persisted: !!this.decisionLogStorage,
      });
    } catch (error: any) {
      this.logger.error(`recordClosedLoopFailureEvent 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('generate-multiple-plans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '多方案生成', description: '生成 2–N 个不同权衡方案' })
  @ApiBody({ type: GenerateMultiplePlansRequestDto })
  @ApiResponse({ status: 200, description: '生成成功' })
  async generateMultiplePlans(
    @Body() body: GenerateMultiplePlansRequestDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    try {
      if (isLegacyTripEngineHttpBlocked(headers)) {
        return errorResponse(
          ErrorCode.BUSINESS_ERROR,
          'Legacy TripDecisionEngine generate-multiple-plans is non-authoritative under Decision Kernel SSOT',
          buildLegacyEngineSsotBlockPayload(),
        );
      }
      if (!body.state?.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
      }
      if (!this.decisionEngine.generateMultiplePlans) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, '多方案生成能力不可用');
      }
      const state = body.state as TripWorldState;
      applyPrismaTripIdToWorldState(state, body.tripId);
      if (!(state.policies as { constraintDSL?: unknown } | undefined)?.constraintDSL && body.constraints) {
        state.policies = { ...(state.policies ?? {}), constraintDSL: body.constraints as any } as TripWorldState['policies'];
      }
      const { variants, log } = await this.decisionEngine.generateMultiplePlans(state, body.requestId);
      const variantsWithClosedLoop = this.tripClosedLoop
        ? variants.map((variant: any) => ({
            ...variant,
            ...this.buildClosedLoopPayload(variant.plan, body.constraints),
          }))
        : variants;
      return successResponse({ variants: variantsWithClosedLoop, log, ...this.echoLastDecisionCausalityId(state) });
    } catch (error: any) {
      this.logger.error(`generateMultiplePlans 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('canonical-plan-selection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Canonical 全量行程选优 (P1)',
    description:
      'Legacy 生成候选 → Constraint Gateway 评估 → DecisionCore.finalize。不写入 Effective Plan。需 CANONICAL_FULL_PLAN_SELECTION=1',
  })
  @ApiBody({ type: GenerateMultiplePlansRequestDto })
  @ApiResponse({ status: 200, description: '正式决策记录 + 推荐方案' })
  async canonicalPlanSelection(
    @Body() body: GenerateMultiplePlansRequestDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    try {
      if (!isCanonicalFullPlanSelectionEnabled()) {
        return errorResponse(
          ErrorCode.BUSINESS_ERROR,
          'Canonical full plan selection disabled (set CANONICAL_FULL_PLAN_SELECTION=1)',
        );
      }
      if (!this.fullPlanSelection) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'FullPlanSelectionService unavailable');
      }
      if (!body.state?.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
      }
      if (!body.tripId?.trim()) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId 是必需的');
      }

      const experimentId =
        body.experimentContext?.experimentId ??
        this.pickHeader(headers, 'X-Decision-Experiment-Id');
      const scenarioId =
        body.experimentContext?.scenarioId ??
        this.pickHeader(headers, 'X-Decision-Scenario-Id');
      const experimentRunId =
        body.experimentContext?.runId ??
        body.problemId ??
        this.pickHeader(headers, 'X-Decision-Run-Id');

      const stagingShadowOptions = resolveStagingShadowOptionsForRequest(
        body.stagingShadowOptions,
      );

      const state = body.state as TripWorldState;
      applyPrismaTripIdToWorldState(state, body.tripId);
      if (!(state.policies as { constraintDSL?: unknown } | undefined)?.constraintDSL && body.constraints) {
        state.policies = {
          ...(state.policies ?? {}),
          constraintDSL: body.constraints as any,
        } as TripWorldState['policies'];
      }

      const tripRow = await this.prisma.trip.findUnique({
        where: { id: body.tripId },
        select: { metadata: true, pacingConfig: true },
      });

      const planningContext = {
        tripId: body.tripId,
        constraintDsl: body.constraints as any,
        retainAllCandidates: true,
        experimentRunId,
        experimentId,
        scenarioId,
        stagingShadowOptions,
        tripMetadata: tripRow?.metadata ?? undefined,
        pacingConfig: tripRow?.pacingConfig ?? undefined,
      };

      let result;
      if (isDecisionTriggerGatewayEnabled() && this.decisionTriggerGateway) {
        const dispatch = await this.decisionTriggerGateway.dispatch({
          kind: 'FULL_PLAN_SELECTION',
          tripId: body.tripId,
          source: 'DECISION_ENGINE_API',
          requestId: experimentRunId,
          fullPlanSelection: {
            worldState: state,
            context: planningContext,
            problemId: experimentRunId,
            prebuiltCandidates: body.prebuiltCandidates as unknown as DecisionCandidate[] | undefined,
            constraintReportsByCandidateId: body.constraintReportsByCandidateId as unknown as
              | Record<string, CanonicalConstraintReport>
              | undefined,
          },
          metadata: {
            experimentId,
            scenarioId,
            httpSource: body.experimentContext?.source ?? this.pickHeader(headers, 'X-Decision-Source'),
          },
        });
        if (dispatch.status !== 'COMPLETED' || !dispatch.result) {
          return errorResponse(
            ErrorCode.INTERNAL_ERROR,
            dispatch.error?.message ?? 'Decision Trigger Gateway dispatch failed',
          );
        }
        result = dispatch.result as unknown as typeof result;
      } else if (body.prebuiltCandidates?.length) {
        result = await this.fullPlanSelection!.selectFromPrebuiltCandidates({
          worldState: state,
          context: planningContext,
          candidates: body.prebuiltCandidates as unknown as DecisionCandidate[],
          problemId: experimentRunId,
          constraintReportsByCandidateId: body.constraintReportsByCandidateId as unknown as
            | Record<string, CanonicalConstraintReport>
            | undefined,
        });
      } else {
        result = await this.fullPlanSelection!.selectRecommendedPlan({
          worldState: state,
          context: planningContext,
          problemId: experimentRunId,
        });
      }

      if (!result) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Plan selection returned no result');
      }

      return successResponse({
        ...result,
        experimentContext: {
          experimentId,
          scenarioId,
          runId: experimentRunId,
          source:
            body.experimentContext?.source ??
            this.pickHeader(headers, 'X-Decision-Source') ??
            'HTTP',
        },
        candidates: result.candidates.map((c) => ({
          candidateId: c.candidateId,
          label: c.label,
          source: c.source,
          utilityHint: c.utilityHint,
          legacyVariant: c.legacyVariant,
        })),
        recommendedPlan: result.recommendedPlan,
      });
    } catch (error: any) {
      this.logger.error(`canonicalPlanSelection 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('explain-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '决策解释', description: '返回计划的可解释 UI 数据' })
  @ApiBody({ type: ExplainPlanRequestDto })
  @ApiResponse({ status: 200, description: '解释成功' })
  async explainPlan(@Body() body: ExplainPlanRequestDto) {
    try {
      if (!body.plan?.days) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan.days 是必需的');
      }
      if (!body.log) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'log 是必需的');
      }
      if (!this.explainabilityService) {
        return successResponse({
          summary: '决策解释服务不可用',
          whyThisPlan: [],
          slots: [],
          violations: body.violations || [],
        });
      }
      const explanation = this.explainabilityService.explainPlan(
        body.plan as TripPlan,
        body.log as any,
        body.violations as any[],
      );
      return successResponse(explanation);
    } catch (error: any) {
      this.logger.error(`explainPlan 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('adjust-pacing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '节奏调整', description: 'Dr.Dre 策略调整行程节奏' })
  @ApiBody({ type: AdjustPacingRequestDto })
  @ApiResponse({ status: 200, description: '调整完成' })
  async adjustPacing(@Body() body: AdjustPacingRequestDto) {
    try {
      if (!this.strategyOrchestrator) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'StrategyOrchestrator 不可用');
      }
      if (!body.tripId || !body.plan || !body.worldContext) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId、plan、worldContext 是必需的');
      }
      const planWithTripId = {
        ...body.plan,
        tripId: body.plan.tripId || body.tripId,
      } as RoutePlanDraft;
      const result = await this.strategyOrchestrator.run(
        body.worldContext as WorldModelContext,
        planWithTripId,
      );
      if (result.plan && result.finalAction === 'ADJUST') {
        return successResponse({
          success: true,
          adjustedPlan: result.plan,
          changes: (result.logs || []).filter((l: any) => l.persona === 'DR_DRE'),
          message: '行程节奏已自动调整',
        });
      }
      return successResponse({
        success: false,
        message: '行程节奏无需调整',
      });
    } catch (error: any) {
      this.logger.error(`adjustPacing 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('replace-nodes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '节点替换', description: 'Neptune 策略替换不可用节点' })
  @ApiBody({ type: ReplaceNodesRequestDto })
  @ApiResponse({ status: 200, description: '替换完成' })
  async replaceNodes(@Body() body: ReplaceNodesRequestDto) {
    try {
      if (!this.strategyOrchestrator) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'StrategyOrchestrator 不可用');
      }
      if (!body.tripId || !body.plan || !body.worldContext || !body.unavailableNodes?.length) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId、plan、worldContext、unavailableNodes 是必需的');
      }
      const planWithTripId = {
        ...body.plan,
        tripId: body.plan.tripId || body.tripId,
      } as RoutePlanDraft;
      const updatedPlan: RoutePlanDraft = {
        ...planWithTripId,
        segments: (planWithTripId.segments || []).map((segment: any) => {
          const unavailable = body.unavailableNodes.find((u) => u.nodeId === segment.segmentId);
          return unavailable
            ? {
                ...segment,
                metadata: {
                  ...segment.metadata,
                  status: 'UNAVAILABLE',
                  reason: unavailable.reason,
                },
              }
            : segment;
        }),
      };
      const result = await this.strategyOrchestrator.run(
        body.worldContext as WorldModelContext,
        updatedPlan,
      );
      if (result.plan && result.finalAction === 'REPLACE') {
        return successResponse({
          success: true,
          replacedPlan: result.plan,
          replacements: (result.logs || []).filter((l: any) => l.persona === 'NEPTUNE'),
          message: '路线节点已自动替换',
        });
      }
      return successResponse({
        success: false,
        message: '无法找到合适的替换节点',
      });
    } catch (error: any) {
      this.logger.error(`replaceNodes 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('ops-reality-audit/:snapshotId/outcome')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'P-OPS-2：回填实况 outcome（与预测快照 join）',
    description:
      '对 append-only 预测行首次写入 outcome（幂等：仅 outcome 为空时可更新）。需启用 OPS_REALITY_AUDIT=1。',
  })
  async recordRealityOutcome(
    @Param('snapshotId') snapshotId: string,
    @Body() body: RecordRealityOutcomeDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    if (!this.opsRealityAudit) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'OpsRealityAuditService 不可用');
    }

    const sessionTripId =
      body.tripId?.trim() ||
      this.causalRuntimeSession?.resolveTripId({
        tripId: body.tripId,
        requestId: body.execution_trace_id,
      });
    const session = sessionTripId
      ? this.causalRuntimeSession?.getForTrip(sessionTripId)
      : null;
    const enriched = enrichOpsOutcomeWithSession(
      {
        tripId: body.tripId,
        causality_id: body.causality_id,
        state: body.state,
        snapshotId,
      },
      session,
    );
    const effectiveSnapshotId = enriched.snapshotId?.trim() || snapshotId.trim();
    const effectiveBody: RecordRealityOutcomeDto = {
      ...body,
      tripId: enriched.tripId ?? body.tripId,
      causality_id: enriched.causality_id ?? body.causality_id,
      state: enriched.state ?? body.state,
    };

    const tripRun =
      effectiveBody.trip_run_id?.trim() ||
      this.pickHeader(headers, 'x-trip-run-id');
    const execTrace =
      effectiveBody.execution_trace_id?.trim() ||
      this.pickHeader(headers, 'x-execution-trace-id') ||
      this.pickHeader(headers, 'x-request-id');
    const causalityRef = effectiveBody.causality_id?.trim();
    let mergedOutcome = mergeOutcomeTelemetryRefs(effectiveBody.outcome as Record<string, unknown>, {
      tripRunId: tripRun,
      executionTraceId: execTrace,
      causalityId: causalityRef,
    }) as unknown as OpsRealityOutcomePayloadV1;

    if (effectiveBody.failure_ontology && typeof effectiveBody.failure_ontology === 'object') {
      const failureRecord = coerceFailureOntologyPayload(effectiveBody.failure_ontology as Record<string, unknown>);
      if (failureRecord) {
        mergedOutcome = mergeFailureOntologyIntoOutcome(mergedOutcome, failureRecord);
      }
    }

    const ok = await this.opsRealityAudit.recordOutcome(
      effectiveSnapshotId,
      mergedOutcome,
      effectiveBody.source,
    );
    if (!ok) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        '未更新（快照不存在、已写过 outcome、或未启用 OPS_REALITY_AUDIT）',
      );
    }

    const decisionLogId = effectiveBody.decision_log_id?.trim();
    let decisionOutcomeId: string | undefined;
    let decisionOutcomePrismaError: string | undefined;
    if (this.decisionLogging && decisionLogId) {
      try {
        const row = await this.decisionLogging.logOutcome(
          decisionLogId,
          {
            expectedCharacteristics: {
              ops_reality_audit_snapshot_id: effectiveSnapshotId,
              bridge: 'p-ops-2/outcome-to-decision_outcomes',
            },
          },
          {
            actualCharacteristics: {
              outcome: mergedOutcome as Record<string, unknown>,
            },
          },
          undefined,
          undefined,
          causalityRef ? { decisionCausalityId: causalityRef } : undefined,
        );
        decisionOutcomeId = row.id;
      } catch (e) {
        decisionOutcomePrismaError =
          e instanceof Error ? e.message : String(e);
        this.logger.warn(
          `[P-OPS-2] decision_outcomes row skipped: ${decisionOutcomePrismaError}`,
        );
      }
    }

    return successResponse({
      success: true,
      snapshotId: effectiveSnapshotId,
      ...(enriched.stateAutoFilled ? { stateAutoFilled: true } : {}),
      ...(enriched.causalityAutoFilled ? { causalityAutoFilled: true } : {}),
      ...(enriched.snapshotAutoFilled ? { snapshotAutoFilled: true } : {}),
      ...(decisionOutcomeId ? { decision_outcome_id: decisionOutcomeId } : {}),
      ...(decisionOutcomePrismaError
        ? { decision_outcome_prisma_error: decisionOutcomePrismaError }
        : {}),
      ...(await this.tryCounterfactualAfterOpsOutcome({
        body: effectiveBody,
        mergedOutcome,
        causalityRef,
        headers,
      })),
    });
  }

  /**
   * P5 bridge — optional auto-close when OPS outcome carries state + causality_id.
   */
  private async tryCounterfactualAfterOpsOutcome(input: {
    body: RecordRealityOutcomeDto;
    mergedOutcome: OpsRealityOutcomePayloadV1;
    causalityRef?: string;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<Record<string, unknown>> {
    if (!this.causalCounterfactual || !input.causalityRef || !input.body.state?.['context']) {
      return {};
    }

    const state = asTripWorldState(input.body.state as Record<string, unknown>);
    if (!state) {
      return {};
    }
    applyPrismaTripIdToWorldState(state, input.body.tripId);

    const requestId =
      input.body.execution_trace_id?.trim() ||
      this.pickHeader(input.headers, 'x-request-id') ||
      undefined;

    try {
      const closed = await this.causalCounterfactual.tryCloseFromOpsOutcome({
        state,
        causalityId: input.causalityRef,
        outcome: input.mergedOutcome,
        tripId: input.body.tripId,
        requestId: typeof requestId === 'string' ? requestId : undefined,
      });

      if (!closed) return { causalCounterfactualClosed: false };

      this.causalRuntimeSession?.capture({ state });

      return {
        causalCounterfactualClosed: true,
        causalCounterfactualReport: closed.report,
        travelEventPersisted: closed.travelEventPersisted,
        ...this.echoCausalRuntime(state),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[P5/OPS] counterfactual auto-close failed: ${message}`);
      return { causalCounterfactualClosed: false, causalCounterfactualError: message };
    }
  }

  @Get('ops-reality-audit/by-trip/:tripId')
  @Public()
  @ApiOperation({
    summary: 'P-OPS-2：按 trip 列出近期预测快照（含是否已填 outcome）',
  })
  async listRealityAuditByTrip(@Param('tripId') tripId: string) {
    const snapshots = (await this.opsRealityAudit?.listRecentForTrip(tripId)) ?? [];
    return successResponse({ tripId, snapshots });
  }

  @Get('ops-reality-audit/:snapshotId/replay-compare')
  @Public()
  @ApiOperation({
    summary: 'P-OPS-2：离线 replay 比对（可比指纹）',
    description:
      '需 outcome.extensions.observation_export（p-ops-2-obs-export/v1）。比对 prediction 与观测导出在 legs+weather+planDigest 上的可比指纹（忽略 capturedAtIso）。',
  })
  async replayCompareSnapshot(@Param('snapshotId') snapshotId: string) {
    if (!this.opsRealityAudit) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'OpsRealityAuditService 不可用');
    }
    const row = await this.opsRealityAudit.replayCompareSnapshot(snapshotId);
    if (!row) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, '快照不存在或未启用 OPS_REALITY_AUDIT');
    }
    return successResponse(row);
  }
}
