// src/agent/services/claude-orchestrator.service.ts

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import { ActionRegistryService } from './action-registry.service';
import { SimpleLruCache } from './orchestration-utils';
import { createDeadline } from './orchestration-stability.util';
import {
  collectDecisionEvidenceSummaries,
  computeDecisionEvidenceFingerprint,
} from '../utils/decision-evidence-fingerprint.util';
import { CONSTRAINT_IDS } from './constraint-registry';
import { buildL3PersuasionLine, selectPersuasionMode } from '../utils/narrator-l3-persuasion.util';
import { formatPredictiveFailureReport } from '../utils/repair-causal-explainer.util';
import { calculateEarlyWarningRisk } from '../utils/early-warning-risk-model.util';
import {
  IntentAnalysis,
  RoutingDecision,
  SkillsPlan,
  ExecutionPlan,
  ExecutionStep,
  OrchestrationResult,
  AgentContext,
} from '../interfaces/claude-orchestration.interface';
import {
  INTENT_ANALYSIS_PROMPT,
  ROUTING_DECISION_PROMPT,
  SKILLS_SELECTION_PROMPT,
  EXECUTION_PLANNING_PROMPT,
} from './claude-orchestration-prompts';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import {
  TripPlanRequest,
  OrchestratorState,
  OrchestrationStep,
  GateResult,
  Itinerary,
  GuardianType,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import { ClaudePlannerAgentService } from './sub-agents/planner-agent.service';
import { ClaudeGatekeeperAgentService } from './sub-agents/gatekeeper-agent.service';
import { ClaudeComplianceAgentService } from './sub-agents/compliance-agent.service';
import { ClaudeLocalInsightAgentService } from './sub-agents/local-insight-agent.service';
import { ClaudeCoreDecisionAgentService } from './sub-agents/core-decision-agent.service';
import { ClaudeNarratorAgentService } from './sub-agents/narrator-agent.service';
import { getSkillFailureStrategy } from '../utils/skill-importance.util';
import { isInGrayBucket } from '../utils/gray-release.util';
import { ErrorType, inferErrorType, getErrorHandlingStrategy } from '../interfaces/error-types.interface';
import { ClarificationQuestion } from '../interfaces/clarification.interface';
import { SKILL_VALIDATION_RULES } from './skill-validation-rules.config';
import { SYSTEM_ORCHESTRATOR_ACTIONS } from '../constants/action-execution.constants';
import { ClarificationHandlerService } from './clarification-handler.service';
import { ShadowConflictScannerService, type EarlyWarning } from './shadow-conflict-scanner.service';
import { LocalCaseStoreService } from '../cbr/local-case-store.service';
import { CbrAggregatorService } from '../cbr/cbr-aggregator.service';
import { auditReportToCaseRecord } from '../cbr/case-extractor.util';
import { ConstraintScorer, type RelaxationActionId } from '../cbr/constraint-scorer.util';
import { groupMinCutPaths } from '../cbr/option-grouper.util';
import { SignatureBuilder } from '../cbr/signature-builder.util';
import { SkillInputValidatorService } from './skill-input-validator.service';
import { HallucinationDetectionService } from './hallucination-detection.service';
import { TrajectoryCollectionService } from '../training/services/trajectory-collection.service';
import { ReadinessService } from '../../trips/readiness/services/readiness.service';
import { UserDecisionService } from '../../trips/readiness/services/user-decision.service';
import { TripContext, TravelerProfile, ItineraryInfo } from '../../trips/readiness/types/trip-context.types';
import { DecisionDraftGeneratorService } from '../../decision-draft/services/decision-draft-generator.service';
import { DecisionReplayService } from './decision-replay.service';
// Domain Agents (World Model Layer)
import { GeoAgentService } from './domain-agents/geo-agent.service';
import { WeatherAgentService } from './domain-agents/weather-agent.service';
import { CostAgentService } from './domain-agents/cost-agent.service';
import { ExperienceAgentService } from './domain-agents/experience-agent.service';
import { TokenStatsService } from './token-stats.service';
// Phase 2.1: Decision Kernel
import { DecisionKernelService } from '../../decision/kernel/decision-kernel.service';
import type { HarnessTraceFinalStatus } from '../../harness/tracing/harness-trace.types';
import { HarnessStepName } from '../../harness/contracts/harness-step.types';
import { TdfpmCalculatorService } from '../../trips/decision/services/tdfpm-calculator.service';
import type { TdfpmDayContext } from '../../trips/decision/services/tdfpm-calculator.service';
import { PrometheusMetricsService } from '../../monitoring/prometheus-metrics.service';
import {
  orchestratorStateToDecisionStatePatch,
  decisionStateToOrchestratorState,
  buildPatchFromDSOPrimary,
} from '../../decision/kernel/orchestrator-state-mapper';
import {
  DecisionState,
  type DecisionStatePatch,
  type PoiPlanningDecisionSlice,
} from '../../decision/kernel/decision-state.types';
import type { PlanGenTerminalFailure } from '../../decision/kernel/decision-state.types';
import { AuditReportGenerator } from '../utils/terminal-audit-report.generator';
import {
  buildDecisionFeedbackCorrelationId,
  computePredictiveFailureStateHash,
  digestSimulatedRepairTracesForCorrelation,
  digestTripPlanRequestLight,
} from '../../decision/kernel/utils/decision-feedback-correlation.util';
import type { UserRouteIntent } from '../../planning-policy/interfaces/region-intent.types';
import { RegionAnchorPlanningService } from '../../planning-policy/services/region-anchor-planning.service';
import { ICELAND_POI_SLUG_KEYWORDS } from '../../planning-policy/regions/iceland-poi-slugs';
import { GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY } from '../../planning-policy/regions/golden-circle-anchor-retrieval-profile';
import { POI_PLANNING_SCORE_REASON } from '../../planning-policy/constants/poi-planning-score-reasons';
import {
  buildPoiPlanningOutcomePhaseReport,
  type PoiPlanningAdmissionDiagnosticsInput,
} from '../../planning-policy/utils/poi-planning-outcome-metrics.util';
import {
  buildPoiPlanningAdmissionDiagnostics,
  enforceRequiredAnchorsTopN,
  poiPlanningRowIdentityKey,
} from '../../planning-policy/utils/poi-planning-anchor-admission.util';
import {
  goldenCircleEntityStrongMatch,
  keywordMatchResearchPoiToSlug,
  researchPoiHasStableId,
} from '../../planning-policy/utils/anchor-entity-match.util';
import {
  buildCandidateRetrievalQueryPlan,
  mergeResearchPoiLists,
} from '../../planning-policy/utils/build-candidate-retrieval-query-plan.util';
import {
  countPoiPlanningFallbackInPois,
  extractPlanningSlugsFromItinerary,
  extractPlanningSlugsFromPois,
  type MinimalItineraryItem,
} from '../../planning-policy/utils/poi-planning-slug-resolve.util';
import type { IDsoLatestStateProvider } from '../../decision/kernel/dso-latest-state-provider.interface';
import { DSO_LATEST_STATE_PROVIDER } from '../../decision/kernel/dso-latest-state-provider.interface';
// 护城河扩展：预测性世界模型
import { WeatherPredictionService } from '../../skills/world/services/weather-prediction.service';
import { FailureRiskPredictionService } from '../../skills/world/services/failure-risk-prediction.service';
import { aggregateWeatherRisk } from '../utils/weather-risk-aggregator.util';
import {
  generateClarificationQuestions,
  identifyGapsFromRequest,
  isUnresolvedDestinationPlaceholder,
} from '../utils/clarification-question-generator.util';
import {
  buildFallbackPlan,
  buildFallbackPlans,
  chooseFallbackStrategy,
  fallbackPlanToItinerary,
  getFallbackTemplateVersion,
} from '../../decision/planner/fallback-planner';
/**
 * Claude Orchestrator Service
 * 
 * 使用 Claude 3.5 Sonnet 作为智能编排引擎，统一管理：
 * - 路由决策（理解用户意图，选择 System 1/2）
 * - Skills 选择（动态选择需要的 Skills）
 * - 执行编排（决定 Skills 的执行顺序和依赖关系）
 */
@Injectable()
export class ClaudeOrchestratorService {
  private readonly logger = new Logger(ClaudeOrchestratorService.name);
  private readonly worldCache = new SimpleLruCache<any>(64, 10 * 60 * 1000); // 10分钟TTL

  constructor(
    private llmService: LlmService,
    @Inject(SKILLS_REGISTRY_TOKEN) @Optional() private skillsRegistry?: SkillsRegistryService,
    @Optional() private actionRegistry?: ActionRegistryService,
    @Optional() private plannerAgent?: ClaudePlannerAgentService,
    @Optional() private gatekeeperAgent?: ClaudeGatekeeperAgentService,
    @Optional() private complianceAgent?: ClaudeComplianceAgentService,
    @Optional() private localInsightAgent?: ClaudeLocalInsightAgentService,
    @Optional() private coreDecisionAgent?: ClaudeCoreDecisionAgentService,
    @Optional() private narratorAgent?: ClaudeNarratorAgentService,
    @Optional() private readonly skillInputValidator?: SkillInputValidatorService,
    @Optional() private hallucinationDetection?: HallucinationDetectionService,
    @Optional() private readonly clarificationHandler?: ClarificationHandlerService,
    @Optional() private readonly shadowConflictScanner?: ShadowConflictScannerService,
    @Optional() private readonly localCaseStore?: LocalCaseStoreService,
    @Optional() private readonly cbrAggregator?: CbrAggregatorService,
    @Optional() private trajectoryCollection?: TrajectoryCollectionService,
    @Optional() private readonly readinessService?: ReadinessService,
    @Optional() private readonly userDecisionService?: UserDecisionService,
    @Optional() private readonly decisionDraftGenerator?: DecisionDraftGeneratorService,
    //领域智能体（世界模型层）
    @Optional() private readonly geoAgent?: GeoAgentService,
    @Optional() private readonly weatherAgent?: WeatherAgentService,
    @Optional() private readonly costAgent?: CostAgentService,
    @Optional() private readonly experienceAgent?: ExperienceAgentService,
    // 护城河扩展：预测性世界模型
    @Optional() private readonly weatherPredictionService?: WeatherPredictionService,
    @Optional() private readonly failureRiskPredictionService?: FailureRiskPredictionService,
    // Phase 2.1: Decision Kernel（DSO 中心化）
    @Optional() private readonly decisionKernel?: DecisionKernelService,
    @Optional() private readonly configService?: ConfigService,
    // P0: Token 按阶段打点（AI 科学家评审要求）
    @Optional() private readonly tokenStatsService?: TokenStatsService,
    // P1: TDFPM → fatigueTrend（按日计算疲劳，写入 DSO tripState.fatigue）
    @Optional() private readonly tdfpmCalculator?: TdfpmCalculatorService,
    // 多代理并发：提交前从 store 读取最新 DSO，冲突时重试
    @Optional() @Inject(DSO_LATEST_STATE_PROVIDER) private readonly dsoLatestStateProvider?: IDsoLatestStateProvider,
    // Decision Replay snapshots (optional)
    @Optional() private readonly decisionReplay?: DecisionReplayService,
    /** Phase 1：区域锚点 → DSO.poiPlanning */
    @Optional() private readonly regionAnchorPlanning?: RegionAnchorPlanningService,
    /** Monitoring (Prometheus) */
    @Optional() private readonly promMetrics?: PrometheusMetricsService,
  ) {
    this.logger.log(`[ClaudeOrchestratorService] Initialized`);
    this.logger.log(`[ClaudeOrchestratorService] SkillsRegistry: ${!!this.skillsRegistry}, ActionRegistry: ${!!this.actionRegistry}`);
    this.logger.log(`[ClaudeOrchestratorService] Sub-Agents: Planner=${!!this.plannerAgent}, Gatekeeper=${!!this.gatekeeperAgent}, Compliance=${!!this.complianceAgent}, LocalInsight=${!!this.localInsightAgent}, CoreDecision=${!!this.coreDecisionAgent}, Narrator=${!!this.narratorAgent}`);
    this.logger.log(`[ClaudeOrchestratorService] Domain Agents: Geo=${!!this.geoAgent}, Weather=${!!this.weatherAgent}, Cost=${!!this.costAgent}, Experience=${!!this.experienceAgent}`);
    this.logger.log(`[ClaudeOrchestratorService] Decision Kernel (DSO): ${!!this.decisionKernel}, enabled=${this.isKernelEnabled()}`);
    if (this.skillsRegistry) {
      const skillsCount = this.skillsRegistry.getAllSkills().length;
      this.logger.log(`[ClaudeOrchestratorService] 可用 Skills 数量: ${skillsCount}`);
    } else {
      this.logger.warn(`[ClaudeOrchestratorService] ⚠️ SkillsRegistry 未注入！`);
    }
  }

  private isDecisionReplayAutoSnapshotEnabled(): boolean {
    const v =
      this.configService?.get<string>('DECISION_REPLAY_AUTO_SNAPSHOT') ??
      process.env.DECISION_REPLAY_AUTO_SNAPSHOT ??
      'false';
    return v === 'true' || v === '1';
  }

  private maybeSnapshot(state: OrchestratorState, trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'): void {
    if (!this.decisionReplay) return;
    if (!this.isDecisionReplayAutoSnapshotEnabled()) return;
    try {
      this.decisionReplay.createSnapshot(state, trigger);
    } catch (e: any) {
      this.logger.warn(`[Claude Orchestrator] DecisionReplay snapshot failed: ${e?.message}`);
    }
  }

  /**
   * Phase 2.4: Decision Kernel 是否启用（用于灰度/回滚）
   * DECISION_KERNEL_ENABLED=false 时可回滚到无 DSO 路径
   */
  private isKernelEnabled(): boolean {
    const v = this.configService?.get<string>('DECISION_KERNEL_ENABLED') ?? process.env.DECISION_KERNEL_ENABLED ?? 'true';
    return v !== 'false' && v !== '0';
  }

  /**
   * P1: A/B 实验流量切分
   * 当 DECISION_KERNEL_AB_PERCENT 设置时，按 userId/request_id hash 分流指定比例到 Kernel 路径
   * 例：DECISION_KERNEL_AB_PERCENT=10 → 10% 实验组（Kernel），90% 对照组（无 Kernel）
   */
  private isKernelEnabledForRequest(request: { request_id: string; user_id?: string }): boolean {
    if (!this.isKernelEnabled()) return false;
    const percent = parseInt(
      this.configService?.get<string>('DECISION_KERNEL_AB_PERCENT') ?? process.env.DECISION_KERNEL_AB_PERCENT ?? '0',
      10,
    );
    if (percent <= 0) return true;
    if (percent >= 100) return true;
    const seed = `${request.user_id ?? ''}|${request.request_id}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const bucket = h % 100;
    return bucket < percent;
  }

  /**
   * 编排返回前闭合内存 Harness trace（`HARNESS_RECORD_TRACE=1`）：写入 `endedAt` / 业务终态。
   * 若 harness 已失败收口（`endedAt` 已存在），则不变更。
   */
  private finalizeHarnessTraceFromOrchestration(
    decisionState: DecisionState | undefined,
    finalStatus: HarnessTraceFinalStatus,
  ): void {
    if (!this.decisionKernel || !decisionState) return;
    this.decisionKernel.finalizeHarnessTraceIfRecorded(decisionState, finalStatus);
  }

  /**
   * Durable 恢复：由 `lastStep` 推导下一 Harness 硬阶段，并对 INTAKE 完成态跳过重复 INTAKE（直接进入 RESEARCH 准入）。
   */
  private computeResumeHarnessEntryFromLast(last?: string): HarnessStepName {
    if (!last) return HarnessStepName.INTAKE;
    if (last === HarnessStepName.INTAKE || last === 'INTAKE') {
      return HarnessStepName.RESEARCH;
    }
    const order: HarnessStepName[] = [
      HarnessStepName.INTAKE,
      HarnessStepName.RESEARCH,
      HarnessStepName.GATE_EVAL,
      HarnessStepName.PLAN_GEN,
      HarnessStepName.VERIFY,
      HarnessStepName.REPAIR,
      HarnessStepName.NARRATE,
    ];
    const idx = order.indexOf(last as HarnessStepName);
    if (idx < 0) return HarnessStepName.INTAKE;
    return order[Math.min(idx + 1, order.length - 1)]!;
  }

  /**
   * Phase 2: Kernel 原生执行 RESEARCH（KERNEL_NATIVE_EXECUTION=true 时走 ResearchExecutor）
   * Scheme B: 默认 true，Kernel Phase Executors 为主路径；设为 false 可回退到 callback
   * Scheme E: 灰度 - KERNEL_NATIVE_EXECUTION_GRAY_PERCENT=50 时仅 50% 请求走 Kernel 路径
   */
  private isKernelNativeExecution(state?: { request_id: string; user_id?: string }): boolean {
    const v = this.configService?.get<string>('KERNEL_NATIVE_EXECUTION') ?? process.env.KERNEL_NATIVE_EXECUTION ?? 'true';
    const baseEnabled = v === 'true' || v === '1';
    if (!baseEnabled) return false;

    const grayPercent = parseInt(
      this.configService?.get<string>('KERNEL_NATIVE_EXECUTION_GRAY_PERCENT') ??
        process.env.KERNEL_NATIVE_EXECUTION_GRAY_PERCENT ??
        '100',
      10,
    );
    if (grayPercent >= 100 || !state) return true;
    if (grayPercent <= 0) return false;

    return isInGrayBucket(`${state.user_id ?? ''}|${state.request_id}`, grayPercent);
  }

  /**
   * DSO 为主状态源（专利 P2）
   * true=STATE_UPDATE/FEEDBACK 使用 buildPatchFromDSOPrimary，优先 DSO 避免 O→D 覆盖
   */
  private isDsoAsPrimary(): boolean {
    const v = this.configService?.get<string>('DSO_AS_PRIMARY') ?? process.env.DSO_AS_PRIMARY ?? 'true';
    return v === 'true' || v === '1';
  }

  /**
   * 获取 LLM 提供商（支持请求参数和降级机制）
   */
  private getLlmProvider(request: RouteAndRunRequestDto): LlmProvider {
    // 1. 优先使用请求参数中的 llm_provider
    const requestProvider = request.options?.llm_provider;
    if (requestProvider && requestProvider !== 'auto') {
      switch (requestProvider) {
        case 'openai':
          return LlmProvider.OPENAI;
        case 'deepseek':
          return LlmProvider.DEEPSEEK;
        case 'gemini':
          return LlmProvider.GEMINI;
        case 'anthropic':
          return LlmProvider.ANTHROPIC;
        case 'vllm':
          return LlmProvider.VLLM;
        default:
          break;
      }
    }
    
    // 2. 使用系统默认提供商
    return this.llmService.getDefaultProvider();
  }

  /**
   * 获取降级提供商列表（当主提供商失败时使用）
   * 包含 vLLM 自托管，可在无 API Key 时降级使用
   */
  private getFallbackProviders(primaryProvider: LlmProvider): LlmProvider[] {
    const fallbackOrder: LlmProvider[] = [
      LlmProvider.VLLM,       // 自托管，零 API 成本
      LlmProvider.DEEPSEEK,
      LlmProvider.OPENAI,
      LlmProvider.GEMINI,
    ];
    return fallbackOrder.filter(p => p !== primaryProvider);
  }

  /**
   * 使用 LLM 调用，支持降级机制
   * @param tokenContext 可选，用于 P0 Token 按阶段打点
   */
  private async callLlmWithFallback(
    primaryProvider: LlmProvider,
    prompt: string,
    schema: any,
    operationName: string,
    tokenContext?: { request_id: string; state_machine_step: OrchestrationStep; sub_agent: SubAgentType },
  ): Promise<string> {
    const startTime = Date.now();
    try {
      const response = await this.llmService.callLlmWithSchema(primaryProvider, prompt, schema);
      await this.recordTokenIfEnabled(prompt, response, primaryProvider, startTime, true, tokenContext);
      return response;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] ${operationName} 使用 ${primaryProvider} 失败: ${error?.message}`);
      const fallbackProviders = this.getFallbackProviders(primaryProvider);
      for (const fallbackProvider of fallbackProviders) {
        try {
          this.logger.debug(`[Claude Orchestrator] ${operationName} 尝试降级到 ${fallbackProvider}...`);
          const response = await this.llmService.callLlmWithSchema(fallbackProvider, prompt, schema);
          await this.recordTokenIfEnabled(prompt, response, fallbackProvider, startTime, true, tokenContext);
          return response;
        } catch (fallbackError: any) {
          this.logger.warn(`[Claude Orchestrator] ${operationName} 使用 ${fallbackProvider} 也失败: ${fallbackError?.message}`);
          continue;
        }
      }
      await this.recordTokenIfEnabled(prompt, '', primaryProvider, startTime, false, tokenContext);
      throw error;
    }
  }

  /** P0: Token 按阶段打点（估算 tokens，当 TokenStatsService 和 tokenContext 存在时） */
  private async recordTokenIfEnabled(
    prompt: string,
    response: string,
    provider: LlmProvider,
    startTime: number,
    success: boolean,
    ctx?: { request_id: string; state_machine_step: OrchestrationStep; sub_agent: SubAgentType },
  ): Promise<void> {
    if (!this.tokenStatsService || !ctx) return;
    try {
      const promptTokens = Math.ceil(prompt.length / 4);
      const completionTokens = Math.ceil(response.length / 4);
      const spanId = `claude-${ctx.state_machine_step}-${Date.now()}`;
      await this.tokenStatsService.recordTokenUsage({
        request_id: ctx.request_id,
        trace_id: ctx.request_id,
        span_id: spanId,
        sub_agent: ctx.sub_agent,
        state_machine_step: ctx.state_machine_step,
        task_type: ctx.state_machine_step,
        provider,
        model: provider,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        duration_ms: Date.now() - startTime,
        success,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      this.logger.debug(`[TokenStats] 记录失败: ${e?.message}`);
    }
  }

  /**
   * 智能编排主入口（CLAUDE_DYNAMIC 等）。
   *
   * **Harness 内存 trace**：本方法内大量 early `return` 与 `executePlan` 出口**不**经过 `buildSuccessResult` / `buildErrorResult`，
   * 因而**不**调用 `finalizeHarnessTraceFromOrchestration`。通常此路径也未初始化 DSO，无 `HARNESS_RECORD_TRACE` 下可闭合的 trace；
   * 新建行程且能解析 `countryCode` 时会委派 **`orchestrateWithStateMachine`**，其出口经 `build*` 并收口（见 `docs/Harness Runtime.md` §10.1）。
   */
  async orchestrate(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    deadline?: { remainingMs: () => number; clamp: (ms: number, minMs?: number) => number },
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    this.logger.log(`[Claude Orchestrator] 开始编排: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
    this.logger.debug(`[Claude Orchestrator] SkillsRegistry: ${!!this.skillsRegistry}, ActionRegistry: ${!!this.actionRegistry}`);

    // 获取 LLM 提供商（支持请求参数和降级）
    const llmProvider = this.getLlmProvider(request);
    this.logger.debug(`[Claude Orchestrator] 使用 LLM 提供商: ${llmProvider}`);

    try {
      // 0. 提前检查：创建新行程场景（在 LLM 调用之前，避免超时）
      // 如果用户请求规划新行程但缺少必要信息，提前返回错误
      const isCreatingNewTrip = !request.trip_id || request.trip_id === '';
      const messageLower = request.message.toLowerCase();
      const isPlanningIntent = messageLower.includes('规划') ||
                                messageLower.includes('计划') ||
                                messageLower.includes('行程') ||
                                messageLower.includes('安排') ||
                                messageLower.includes('itinerary') ||
                                messageLower.includes('trip') ||
                                messageLower.includes('plan');
      
      // 新建行程规划：按专利要求走状态机流程（INTAKE→STATE_UPDATE→RESEARCH→GATE_EVAL→...）
      // 不再使用 Fast Path，确保 DSO、STATE_UPDATE、三人格等专利要素完整执行
      if (isCreatingNewTrip && isPlanningIntent) {
        const countryCode = this.extractCountryCodeFromMessage(request.message);
        if (countryCode) {
          this.logger.log(`[Claude Orchestrator] 新建行程规划，countryCode=${countryCode}，走专利状态机流程`);
          const smDeadline = deadline ?? createDeadline(60_000);
          const smResult = await this.orchestrateWithStateMachine(request, context, smDeadline, undefined);
          smResult.totalDuration = Date.now() - startTime;
          return smResult;
        } else {
          // 缺少countryCode，提前返回错误
          this.logger.warn(`[Claude Orchestrator] 创建新行程需要目的地信息，但无法从消息中提取 countryCode`);
          return {
            success: false,
            result: {
              needsUserConfirmation: true,
              clarificationMessage: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
              errorType: 'MISSING_REQUIRED_PARAM' as any,
              missingParams: ['countryCode'],
              solutions: [
                '在消息中明确指定目的地国家或地区（如：日本、东京、Japan）',
                '提供已保存的行程 ID，系统将自动获取国家代码',
              ],
            },
            answerText: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
            stepsExecuted: [],
            totalDuration: Date.now() - startTime,
            decisionLog: [
              {
                request_id: request.request_id,
                step: 'INTAKE' as OrchestrationStep,
                actor: 'Orchestrator' as SubAgentType,
                inputs_summary: `用户请求: ${request.message}`,
                outputs_summary: `提前验证失败: 缺少目的地信息`,
                evidence_refs: [],
                timestamp: new Date().toISOString(),
              },
            ],
          };
        }
      }

      // 1. 使用 LLM 分析用户意图（原有流程，作为fallback）
      this.logger.debug(`[Claude Orchestrator] 步骤 1/6: 分析用户意图...`);
      const intentAnalysis = await this.analyzeIntent(request, context, llmProvider);
      this.logger.log(`[Claude Orchestrator] ✅ 意图分析完成: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`);

      // 2. 使用 LLM 选择路由策略
      this.logger.debug(`[Claude Orchestrator] 步骤 2/6: 选择路由策略...`);
      const routingDecision = await this.decideRouting(intentAnalysis, llmProvider, request.request_id);
      this.logger.log(`[Claude Orchestrator] ✅ 路由决策完成: ${routingDecision.route}, 置信度: ${routingDecision.confidence}`);

      // 3. 根据路由决策选择执行路径
      if (routingDecision.route.startsWith('SYSTEM1')) {
        // System 1 快速路径：直接返回，由 AgentService 处理
        return {
          success: true,
          result: {
            route: routingDecision.route,
            routingDecision,
            intentAnalysis,
          },
          answerText: '正在处理您的请求...',
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [
            {
              request_id: request.request_id,
              step: 'INTAKE' as OrchestrationStep,
              actor: 'Orchestrator' as SubAgentType,
              inputs_summary: `用户请求: ${request.message}`,
              outputs_summary: `意图类型: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`,
              evidence_refs: [],
              timestamp: new Date().toISOString(),
            },
            {
              request_id: request.request_id,
              step: 'INTAKE' as OrchestrationStep,
              actor: 'Orchestrator' as SubAgentType,
              inputs_summary: `意图分析结果: ${intentAnalysis.intentType}`,
              outputs_summary: `路由决策: ${routingDecision.route}`,
              evidence_refs: [],
              timestamp: new Date().toISOString(),
            },
          ],
        };
      }


      // 4. System 2 路径：使用 LLM 选择 Skills
      this.logger.debug(`[Claude Orchestrator] 步骤 4/6: 选择 Skills...`);
      const skillsPlan = await this.selectSkills(intentAnalysis, routingDecision, context, llmProvider, request.request_id);
      this.logger.log(`[Claude Orchestrator] ✅ Skills 选择完成: ${skillsPlan.selectedSkills.length} 个 Skills`);
      if (skillsPlan.selectedSkills.length > 0) {
        this.logger.debug(`[Claude Orchestrator] 选择的 Skills: ${skillsPlan.selectedSkills.map(s => s.skillName).join(', ')}`);
      }

      // 4.5. 提前验证 Skills 输入参数（在 plan 编排之前，节省 LLM 成本）
      this.logger.debug(`[Claude Orchestrator] 步骤 4.5/6: 提前验证 Skills 输入参数...`);
      
      // 特殊处理：创建新行程场景（trip_id 为 null）
      // 如果选择了需要 world/tripId 的 skills，应该先构建 world 上下文
      if (isCreatingNewTrip) {
        const needsWorldOrTripId = skillsPlan.selectedSkills.some(skill => {
          if (!skill.skillName) return false;
          const skillMeta = this.skillsRegistry?.getSkill(skill.skillName)?.metadata;
          if (!skillMeta?.inputSchema) return false;
          
          // 检查是否需要 world 或 tripId
          const schema = skillMeta.inputSchema;
          const needsWorld = schema.dependencies?.some(dep => 
            dep.param === 'world' || dep.alternatives?.includes('world')
          );
          const needsTripId = schema.dependencies?.some(dep => 
            dep.param === 'tripId' || dep.alternatives?.includes('tripId')
          );
          
          return needsWorld || needsTripId;
        });
        
        if (needsWorldOrTripId) {
          // 检查是否可以从消息中提取 countryCode（用于构建 world）
          const countryCode = this.extractCountryCodeFromMessage(request.message);
          if (!countryCode) {
            this.logger.warn(`[Claude Orchestrator] 创建新行程需要 world 上下文，但无法从消息中提取 countryCode`);
            return {
              success: false,
              result: {
                needsUserConfirmation: true,
                clarificationMessage: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
                errorType: 'MISSING_REQUIRED_PARAM' as any,
                missingParams: ['countryCode'],
                solutions: [
                  '在消息中明确指定目的地国家或地区（如：日本、东京、Japan）',
                  '提供已保存的行程 ID，系统将自动获取国家代码',
                ],
              },
              answerText: '无法完成行程规划，因为缺少必需的信息。\n\n缺失项：\n- 目的地国家或地区\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。',
              stepsExecuted: [],
              totalDuration: Date.now() - startTime,
              decisionLog: [],
            };
          }
          
          // 如果可以从消息中提取 countryCode，自动添加 world.buildContext 到 skillsPlan
          // 确保后续步骤能够获取 world 上下文
          const hasWorldBuildContext = skillsPlan.selectedSkills.some(s => s.skillName === 'world.buildContext');
          if (!hasWorldBuildContext) {
            this.logger.debug(`[Claude Orchestrator] 创建新行程场景：自动添加 world.buildContext 到 skillsPlan，countryCode: ${countryCode}`);
            skillsPlan.selectedSkills.unshift({
              skillName: 'world.buildContext',
              reason: '创建新行程需要构建 world 上下文',
              priority: 1,
              input: {
                countryCode: countryCode,
              },
              dependencies: [],
            });
            // 更新 executionOrder
            if (!skillsPlan.executionOrder.includes('world.buildContext')) {
              skillsPlan.executionOrder.unshift('world.buildContext');
            }
          }
        }
      }
      
      const earlyValidationResult = await this.validateSkillsInputs(skillsPlan, context, request);
      if (!earlyValidationResult.valid && earlyValidationResult.clarificationMessage) {
        this.logger.warn(`[Claude Orchestrator] Skills 验证失败: ${earlyValidationResult.missingParams?.join(', ')}`);
        return {
          success: false,
          result: {
            needsUserConfirmation: true,
            clarificationMessage: earlyValidationResult.clarificationMessage,
            errorType: 'MISSING_REQUIRED_PARAM' as any,
            missingParams: earlyValidationResult.missingParams,
            solutions: earlyValidationResult.solutions || [],
          },
          answerText: earlyValidationResult.clarificationMessage,
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [],
        };
      }

      // 5. 使用 LLM 编排执行计划
      this.logger.debug(`[Claude Orchestrator] 步骤 5/6: 编排执行计划...`);
      const executionPlan = await this.planExecution(skillsPlan, routingDecision, llmProvider, request.request_id);
      this.logger.log(`[Claude Orchestrator] ✅ 执行计划完成: ${executionPlan.steps.length} 个步骤`);

      // 5.5. 再次验证计划输入参数（处理 plan 编排时可能添加的参数依赖）
      this.logger.debug(`[Claude Orchestrator] 步骤 5.5/6: 验证计划输入参数...`);
      const validationResult = await this.validatePlanInputs(executionPlan, context, request);
      if (!validationResult.valid && validationResult.clarificationMessage) {
        this.logger.warn(`[Claude Orchestrator] 计划验证失败: ${validationResult.missingParams?.join(', ')}`);
        return {
          success: false,
          result: {
            needsUserConfirmation: true,
            clarificationMessage: validationResult.clarificationMessage,
            errorType: 'MISSING_REQUIRED_PARAM' as any,
            missingParams: validationResult.missingParams,
            solutions: validationResult.solutions || [],
          },
          answerText: validationResult.clarificationMessage,
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [],
        };
      }

      // 6. 执行计划
      this.logger.debug(`[Claude Orchestrator] 步骤 6/6: 执行计划...`);
      const result = await this.executePlan(executionPlan, context, request);
      this.logger.log(`[Claude Orchestrator] ✅ 执行完成: success=${result.success}, 成功步骤: ${result.stepsExecuted.filter(s => s.success).length}/${result.stepsExecuted.length}`);

      return result;
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] ❌ 编排失败: ${error?.message || String(error)}`, error?.stack);
      
      // 检查是否是超时错误
      const isTimeoutError = error?.code === 'ECONNABORTED' || 
                            error?.message?.includes('timeout') || 
                            error?.message?.includes('超时') ||
                            error?.message?.startsWith('TIMEOUT:');
      
      if (isTimeoutError) {
        this.logger.error(`[Claude Orchestrator] 请求超时，返回超时错误信息`);
        return {
          success: false,
          result: {
            // 超时不应该设置 needsUserConfirmation，应该直接返回 TIMEOUT 状态
            needsUserConfirmation: false,
            clarificationMessage: '请求超时，请缩小范围或稍后重试。',
            errorType: ErrorType.TIMEOUT_ERROR,
            missingParams: [],
            solutions: [
              '请稍后重试',
              '简化您的请求内容',
              '减少请求的复杂度',
            ],
          },
          answerText: '请求超时，请缩小范围或稍后重试。',
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [],
        };
      }
      
      // 记录详细的错误信息
      const errorInfo = {
        message: error?.message || '未知错误',
        stack: error?.stack,
        skillsRegistryAvailable: !!this.skillsRegistry,
        actionRegistryAvailable: !!this.actionRegistry,
      };
      this.logger.error(`[Claude Orchestrator] 错误详情: ${JSON.stringify(errorInfo, null, 2)}`);
      
      return {
        success: false,
        result: {
          errors: error?.message || '未知错误',
        },
        answerText: `抱歉，处理您的请求时出现错误：${error?.message || '未知错误'}`,
        stepsExecuted: [],
        totalDuration: Date.now() - startTime,
        decisionLog: [
          {
            request_id: request.request_id,
            step: 'FAILED' as OrchestrationStep,
            actor: 'Orchestrator' as SubAgentType,
            inputs_summary: `用户请求: ${request.message}`,
            outputs_summary: `处理失败: ${error?.message || '未知错误'}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              error: error?.message || '未知错误',
              skillsRegistryAvailable: !!this.skillsRegistry,
              actionRegistryAvailable: !!this.actionRegistry,
            },
          },
        ],
      };
    }
  }

  /**
   * 分析用户意图（使用指定的 LLM 提供商，支持降级）
   */
  private async analyzeIntent(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    provider: LlmProvider,
  ): Promise<IntentAnalysis> {
    const prompt = this.buildIntentAnalysisPrompt(request, context);
    
    const tokenContext = request?.request_id
      ? { request_id: request.request_id, state_machine_step: 'INTAKE' as OrchestrationStep, sub_agent: 'Planner' as SubAgentType }
      : undefined;
    try {
      const response = await this.callLlmWithFallback(
        provider,
        prompt,
        {
          type: 'object',
          properties: {
            intentType: {
              type: 'string',
              enum: ['simple_query', 'complex_planning', 'analysis', 'decision', 'mixed'],
            },
            complexity: {
              type: 'string',
              enum: ['simple', 'medium', 'complex'],
            },
            requiredCapabilities: {
              type: 'array',
              items: { type: 'string' },
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string' },
            keywords: {
              type: 'array',
              items: { type: 'string' },
            },
            entities: { type: 'object' },
          },
          required: ['intentType', 'complexity', 'requiredCapabilities', 'confidence', 'reasoning'],
        },
        '意图分析',
        tokenContext,
      );

      const parsed = this.extractJSONFromResponse(response);
      return parsed as IntentAnalysis;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] 意图分析失败，使用默认值: ${error?.message}`);
      // 降级：返回默认意图分析
      return {
        intentType: 'simple_query',
        complexity: 'simple',
        requiredCapabilities: ['data_query'],
        confidence: 0.5,
        reasoning: '意图分析失败，使用默认值',
      };
    }
  }

  /**
   * 从 LLM 响应中提取 JSON（处理可能包含 markdown 代码块或解释性文本的情况）
   */
  private extractJSONFromResponse(response: string): any {
    if (!response || typeof response !== 'string') {
      throw new Error('响应为空或格式不正确');
    }

    let cleaned = response.trim();
    
    // 移除 markdown 代码块标记（更严格的匹配，支持多行）
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?\s*```$/i, '');
    cleaned = cleaned.trim();
    
    // 尝试提取 JSON 对象（如果响应中包含其他文本）
    // 使用更宽松的匹配，包括可能的多行 JSON
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    // 再次清理可能的空白字符
    cleaned = cleaned.trim();
    
    try {
      return JSON.parse(cleaned);
    } catch (parseError: any) {
      this.logger.error(`JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`);
      this.logger.error(`清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`);
      throw parseError;
    }
  }

  /**
   * 路由决策（使用指定的 LLM 提供商，支持降级）
   */
  private async decideRouting(
    intentAnalysis: IntentAnalysis,
    provider: LlmProvider,
    requestId?: string,
  ): Promise<RoutingDecision> {
    const prompt = this.buildRoutingPrompt(intentAnalysis);
    const tokenContext = requestId
      ? { request_id: requestId, state_machine_step: 'INTAKE' as OrchestrationStep, sub_agent: 'Orchestrator' as SubAgentType }
      : undefined;
    try {
      const response = await this.callLlmWithFallback(
        provider,
        prompt,
        {
          type: 'object',
          properties: {
            route: {
              type: 'string',
              enum: ['SYSTEM1_API', 'SYSTEM1_RAG', 'SYSTEM2_REASONING', 'SYSTEM2_ANALYSIS', 'SYSTEM2_WEBBROWSE'],
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string' },
            budget: {
              type: 'object',
              properties: {
                max_seconds: { type: 'number' },
                max_steps: { type: 'number' },
                max_browser_steps: { type: 'number' },
              },
              required: ['max_seconds', 'max_steps', 'max_browser_steps'],
            },
            requiredCapabilities: {
              type: 'array',
              items: { type: 'string' },
            },
            consentRequired: { type: 'boolean' },
          },
          required: ['route', 'confidence', 'reasoning', 'budget'],
        },
        '路由决策',
        tokenContext,
      );

      const parsed = this.extractJSONFromResponse(response);
      return parsed as RoutingDecision;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] 路由决策失败，使用默认值: ${error?.message}`);
      // 降级：返回默认路由决策
      return {
        route: 'SYSTEM2_REASONING',
        confidence: 0.5,
        reasoning: '路由决策失败，使用默认值',
        budget: {
          max_seconds: 60,
          max_steps: 8,
          max_browser_steps: 0,
        },
      };
    }
  }

  /**
   * 选择 Skills（使用指定的 LLM 提供商）
   */
  private async selectSkills(
    intentAnalysis: IntentAnalysis,
    routingDecision: RoutingDecision,
    context: AgentContext,
    provider: LlmProvider,
    requestId?: string,
  ): Promise<SkillsPlan> {
    // 获取所有可用的 Skills
    const availableSkills = this.getAvailableSkills();
    
    if (availableSkills.length === 0) {
      this.logger.warn('[Claude Orchestrator] 没有可用的 Skills');
      return {
        selectedSkills: [],
        executionOrder: [],
        dependencies: {},
      };
    }

    const prompt = this.buildSkillsSelectionPrompt(
      intentAnalysis,
      routingDecision,
      availableSkills,
    );
    const tokenContext = requestId
      ? { request_id: requestId, state_machine_step: 'RESEARCH' as OrchestrationStep, sub_agent: 'Planner' as SubAgentType }
      : undefined;
    try {
      const response = await this.callLlmWithFallback(
        provider,
        prompt,
        {
          type: 'object',
          properties: {
            selectedSkills: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  skillName: { type: 'string' },
                  reason: { type: 'string' },
                  priority: { type: 'number' },
                  input: { type: 'object' },
                  dependencies: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
                required: ['skillName', 'reason', 'priority', 'input'],
              },
            },
            executionOrder: {
              type: 'array',
              items: { type: 'string' },
            },
            dependencies: { type: 'object' },
          },
          required: ['selectedSkills', 'executionOrder', 'dependencies'],
        },
        'Skills 选择',
        tokenContext,
      );

      const parsed = this.extractJSONFromResponse(response);
      return parsed as SkillsPlan;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] Skills 选择失败: ${error?.message}`);
      return {
        selectedSkills: [],
        executionOrder: [],
        dependencies: {},
      };
    }
  }

  /**
   * 编排执行计划（使用指定的 LLM 提供商）
   */
  private async planExecution(
    skillsPlan: SkillsPlan,
    routingDecision: RoutingDecision,
    provider: LlmProvider,
    requestId?: string,
  ): Promise<ExecutionPlan> {
    if (skillsPlan.selectedSkills.length === 0) {
      return {
        steps: [],
        parallelGroups: [],
        fallbackStrategy: {
          onError: 'continue',
          retryCount: 1,
        },
      };
    }

    const prompt = this.buildExecutionPlanningPrompt(skillsPlan, routingDecision);
    const tokenContext = requestId
      ? { request_id: requestId, state_machine_step: 'RESEARCH' as OrchestrationStep, sub_agent: 'Planner' as SubAgentType }
      : undefined;
    try {
      const response = await this.callLlmWithFallback(
        provider,
        prompt,
        {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: ['skill', 'action', 'parallel_group'],
                  },
                  skillName: { type: 'string' },
                  actionName: { type: 'string' },
                  dependencies: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  parallel: { type: 'boolean' },
                  input: { type: 'object' },
                  fallback: {
                    type: 'object',
                    properties: {
                      onError: {
                        type: 'string',
                        enum: ['continue', 'stop', 'retry'],
                      },
                      retryCount: { type: 'number' },
                    },
                  },
                },
                required: ['id', 'type', 'dependencies', 'parallel'],
              },
            },
            parallelGroups: {
              type: 'array',
              items: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            fallbackStrategy: {
              type: 'object',
              properties: {
                onError: {
                  type: 'string',
                  enum: ['continue', 'stop'],
                },
                retryCount: { type: 'number' },
              },
              required: ['onError', 'retryCount'],
            },
            estimatedDuration: { type: 'number' },
            estimatedCost: { type: 'number' },
          },
          required: ['steps', 'parallelGroups', 'fallbackStrategy'],
        },
        '执行计划编排',
        tokenContext,
      );

      const parsed = this.extractJSONFromResponse(response);
      return parsed as ExecutionPlan;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] 执行计划编排失败: ${error?.message}`);
      // 降级：生成简单的顺序执行计划
      return this.generateFallbackPlan(skillsPlan);
    }
  }

  /**
   * 验证计划输入参数（提前识别缺失参数）
   * 
   * 使用配置化的验证规则，支持从 skill metadata 读取（如果已定义）
   */
  /**
   * 验证执行计划的输入参数
   * 
   * 在 plan 编排之后再次验证，确保所有参数都已准备
   * 
   * 优先使用 SkillInputValidatorService（统一验证服务）
   * 如果没有注入，降级到原有的验证逻辑（向后兼容）
   */
  private async validatePlanInputs(
    plan: ExecutionPlan,
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): Promise<{
    valid: boolean;
    missingParams?: string[];
    clarificationMessage?: string;
    solutions?: string[];
  }> {
    // 优先使用统一验证服务
    if (this.skillInputValidator) {
      const missingParams: string[] = [];
      const results: Record<string, any> = {};

      for (const step of plan.steps) {
        if (step.type === 'skill' && step.skillName) {
          // 准备输入参数（模拟执行前的准备）
          const input = this.prepareSkillInput(step, results, context, request);
          
          // 获取 skill 的 metadata
          const skill = this.skillsRegistry?.getSkill(step.skillName);
          const metadata = skill?.metadata;
          
          // 使用统一验证服务
          const validationResult = this.skillInputValidator.validate(
            step.skillName,
            input,
            metadata,
            {
              context,
              request,
              stepResults: results,
              planSteps: plan.steps.map(s => ({ id: s.id, skillName: s.skillName })),
            },
          );
          
          if (!validationResult.valid && validationResult.missingParams.length > 0) {
            missingParams.push(...validationResult.missingParams);
          }
        }
      }

      if (missingParams.length > 0) {
        const uniqueMissingParams = [...new Set(missingParams)];
        return {
          valid: false,
          missingParams: uniqueMissingParams,
          clarificationMessage: this.buildMissingParamClarificationMessage({
            message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
            missingParams: uniqueMissingParams,
          }),
          solutions: this.extractSolutionsFromError({
            message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
          }),
        };
      }

      return { valid: true };
    }
    
    // 降级到原有验证逻辑（向后兼容）
    const missingParams: string[] = [];
    const results: Record<string, any> = {};

    for (const step of plan.steps) {
      if (step.type === 'skill' && step.skillName) {
        const input = this.prepareSkillInput(step, results, context, request);
        const validationRule = SKILL_VALIDATION_RULES[step.skillName];
        
        if (validationRule) {
          const validationResult = this.validateSkillInputWithRule(
            step.skillName,
            input,
            validationRule,
            context,
            request,
          );
          
          if (validationResult.missingParams.length > 0) {
            missingParams.push(...validationResult.missingParams);
          }
        } else {
          this.logger.debug(`[Claude Orchestrator] Skill ${step.skillName} 没有配置验证规则，跳过验证`);
        }
      }
    }

    if (missingParams.length > 0) {
      const uniqueMissingParams = [...new Set(missingParams)];
      const clarificationMessage = this.buildMissingParamClarificationMessage({
        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
        missingParams: uniqueMissingParams,
      });
      
      const solutions = this.extractSolutionsFromError({
        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
      });

      return {
        valid: false,
        missingParams: uniqueMissingParams,
        clarificationMessage,
        solutions,
      };
    }

    return { valid: true };
  }

  /**
   * 验证 Skills 输入参数（在 plan 编排之前）
   * 
   * 提前验证，避免浪费 LLM 调用成本
   * 
   * 优先使用 SkillInputValidatorService（统一验证服务）
   * 如果没有注入，降级到原有的验证逻辑（向后兼容）
   */
  private async validateSkillsInputs(
    skillsPlan: SkillsPlan,
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): Promise<{
    valid: boolean;
    missingParams?: string[];
    clarificationMessage?: string;
    solutions?: string[];
  }> {
    // 优先使用统一验证服务
    if (this.skillInputValidator) {
      const missingParams: string[] = [];
      
      for (const skillSelection of skillsPlan.selectedSkills) {
        if (skillSelection.skillName) {
          // 获取 skill 的 metadata
          const skill = this.skillsRegistry?.getSkill(skillSelection.skillName);
          const metadata = skill?.metadata;
          
          // 使用统一验证服务
          const input = skillSelection.input || {};
          const validationResult = this.skillInputValidator.validate(
            skillSelection.skillName,
            input,
            metadata,
            {
              context,
              request,
              // Skills 选择阶段还没有步骤结果
              stepResults: {},
            },
          );
          
          if (!validationResult.valid && validationResult.missingParams.length > 0) {
            missingParams.push(...validationResult.missingParams);
          }
        }
      }
      
      if (missingParams.length > 0) {
        const uniqueMissingParams = [...new Set(missingParams)];
        return {
          valid: false,
          missingParams: uniqueMissingParams,
          clarificationMessage: this.buildMissingParamClarificationMessage({
            message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
            missingParams: uniqueMissingParams,
          }),
          solutions: this.extractSolutionsFromError({
            message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
          }),
        };
      }
      
      return { valid: true };
    }
    
    // 降级到原有验证逻辑（向后兼容）
    const missingParams: string[] = [];
    
    for (const skillSelection of skillsPlan.selectedSkills) {
      if (skillSelection.skillName) {
        const validationRule = SKILL_VALIDATION_RULES[skillSelection.skillName];
        
        if (validationRule) {
          const input = skillSelection.input || {};
          const validationResult = this.validateSkillInputWithRule(
            skillSelection.skillName,
            input,
            validationRule,
            context,
            request,
          );
          
          if (validationResult.missingParams.length > 0) {
            missingParams.push(...validationResult.missingParams);
          }
        }
      }
    }
    
    if (missingParams.length > 0) {
      const uniqueMissingParams = [...new Set(missingParams)];
      const clarificationMessage = this.buildMissingParamClarificationMessage({
        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
        missingParams: uniqueMissingParams,
      });
      
      const solutions = this.extractSolutionsFromError({
        message: `缺少必需参数: ${uniqueMissingParams.join(', ')}`,
      });

      return {
        valid: false,
        missingParams: uniqueMissingParams,
        clarificationMessage,
        solutions,
      };
    }

    return { valid: true };
  }

  /**
   * 使用验证规则验证 skill 输入参数
   */
  private validateSkillInputWithRule(
    skillName: string,
    input: any,
    rule: typeof SKILL_VALIDATION_RULES[string],
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): {
    missingParams: string[];
  } {
    const missingParams: string[] = [];
    
    // 1. 使用提取器填充参数
    if (rule.extractors) {
      for (const [param, extractor] of Object.entries(rule.extractors)) {
        if (!this.hasValue(input[param])) {
          // 特殊处理：countryCode 提取器需要注入 extractCountryCodeFromMessage
          if (param === 'countryCode') {
            const countryCode = this.extractCountryCodeFromMessage(request.message);
            if (countryCode) {
              input[param] = countryCode;
            } else {
              // 如果提取器也没有返回值，尝试调用提取器
              const extracted = extractor(context, request);
              if (extracted) {
                input[param] = extracted;
              }
            }
          } else {
            const extracted = extractor(context, request);
            if (extracted) {
              input[param] = extracted;
            }
          }
        }
      }
    }
    
    // 2. 检查依赖关系
    if (rule.dependencies) {
      for (const dep of rule.dependencies) {
        const hasParam = this.hasValue(input[dep.param]);
        const hasAlternatives = dep.alternatives?.some(alt => 
          this.hasValue(input[alt]) || 
          (alt === 'tripId' && (context.tripId || request.trip_id))
        );
        
        if (!hasParam && !hasAlternatives) {
          if (dep.alternatives && dep.alternatives.length > 0) {
            missingParams.push(`${dep.param} 或 ${dep.alternatives.join('、')}`);
          } else {
            missingParams.push(dep.param);
          }
        }
      }
    }
    
    return { missingParams };
  }

  /**
   * 检查参数是否有值
   */
  private hasValue(value: any): boolean {
    return value !== undefined && value !== null && value !== '';
  }

  /**
   * 执行计划
   */
  private async executePlan(
    plan: ExecutionPlan,
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const stepsExecuted: OrchestrationResult['stepsExecuted'] = [];
    const results: Record<string, any> = {};
    const decisionLog: OrchestrationResult['decisionLog'] = [];

    try {
      // 按计划顺序执行步骤
      for (const step of plan.steps) {
        const stepStartTime = Date.now();
        
        try {
          if (step.type === 'skill') {
            if (!this.skillsRegistry) {
              throw new Error(`SkillsRegistry 未注入，无法执行 Skill: ${step.skillName}`);
            }
            
            const skill = this.skillsRegistry.getSkill(step.skillName!);
            if (!skill) {
              const availableSkills = this.skillsRegistry.getAllSkills().map(s => s.metadata.name);
              this.logger.error(`[Claude Orchestrator] Skill 不存在: ${step.skillName}, 可用 Skills: ${availableSkills.join(', ')}`);
              throw new Error(`Skill not found: ${step.skillName}. Available: ${availableSkills.slice(0, 5).join(', ')}...`);
            }

            // 准备输入（可以使用前面步骤的结果）
            const input = this.prepareSkillInput(step, results, context, request);
            
            // 执行 Skill
            this.logger.debug(`[Claude Orchestrator] 执行 Skill: ${step.skillName}`);
            const result = await skill.execute(input);
            results[step.id] = result;
            
            stepsExecuted.push({
              stepId: step.id,
              skillName: step.skillName,
              success: true,
              result,
              duration: Date.now() - stepStartTime,
            });
          } else if (step.type === 'action' && this.actionRegistry) {
            const action = this.actionRegistry.get(step.actionName!);
            if (!action) {
              throw new Error(`Action not found: ${step.actionName}`);
            }

            const input = this.prepareActionInput(step, results, context, request);
            // Action.execute 需要 input 和 state 两个参数
            const state = {
              requestId: context.requestId,
              userId: context.userId,
              tripId: context.tripId,
              results,
            };
            const result = await action.execute(input, state);
            results[step.id] = result;
            
            stepsExecuted.push({
              stepId: step.id,
              actionName: step.actionName,
              success: true,
              result,
              duration: Date.now() - stepStartTime,
            });
          }
        } catch (error: any) {
          this.logger.error(`[Claude Orchestrator] 步骤执行失败: ${step.id}, ${error?.message}`);
          
          // 检查是否是关键依赖缺失错误
          if (error?.isCriticalDependencyMissing) {
            this.logger.warn(`[Claude Orchestrator] 检测到关键依赖缺失: ${step.skillName || step.actionName}`);
            // 抛出特殊错误，让外层捕获并转换为用户澄清消息
            const criticalError = new Error(error.message);
            (criticalError as any).isCriticalDependencyMissing = true;
            (criticalError as any).missingServices = error.missingServices || [];
            (criticalError as any).solutions = error.solutions || [];
            (criticalError as any).stepId = step.id;
            (criticalError as any).skillName = step.skillName || step.actionName;
            throw criticalError;
          }
          
          // 根据 fallback 策略处理错误
          if (step.fallback?.onError === 'continue') {
            stepsExecuted.push({
              stepId: step.id,
              skillName: step.skillName,
              actionName: step.actionName,
              success: false,
              error: error?.message || '未知错误',
              duration: Date.now() - stepStartTime,
            });
            continue;
          } else if (step.fallback?.onError === 'stop') {
            throw error;
          } else if (step.fallback?.onError === 'retry' && step.fallback.retryCount) {
            // 重试逻辑
            const maxRetries = step.fallback.retryCount;
            let retries = 0;
            let lastError = error;
            
            while (retries < maxRetries) {
              retries++;
              this.logger.warn(`[Claude Orchestrator] 重试步骤: ${step.id}, 第 ${retries}/${maxRetries} 次`);
              
              // 等待后重试（指数退避）
              const delay = Math.min(1000 * Math.pow(2, retries - 1), 5000);
              await new Promise(resolve => setTimeout(resolve, delay));
              
              try {
                // 重新执行步骤
                if (step.type === 'skill') {
                  const skill = this.skillsRegistry?.getSkill(step.skillName!);
                  if (!skill) {
                    throw new Error(`Skill not found: ${step.skillName}`);
                  }
                  const input = this.prepareSkillInput(step, results, context, request);
                  const result = await skill.execute(input);
                  results[step.id] = result;
                  
                  stepsExecuted.push({
                    stepId: step.id,
                    skillName: step.skillName,
                    success: true,
                    result,
                    duration: Date.now() - stepStartTime,
                  });
                  
                  // 重试成功，跳出循环
                  break;
                } else if (step.type === 'action' && this.actionRegistry) {
                  const action = this.actionRegistry.get(step.actionName!);
                  if (!action) {
                    throw new Error(`Action not found: ${step.actionName}`);
                  }
                  const input = this.prepareActionInput(step, results, context, request);
                  const state = {
                    requestId: context.requestId,
                    userId: context.userId,
                    tripId: context.tripId,
                    results,
                  };
                  const result = await action.execute(input, state);
                  results[step.id] = result;
                  
                  stepsExecuted.push({
                    stepId: step.id,
                    actionName: step.actionName,
                    success: true,
                    result,
                    duration: Date.now() - stepStartTime,
                  });
                  
                  // 重试成功，跳出循环
                  break;
                }
              } catch (retryError: any) {
                lastError = retryError;
                if (retries >= maxRetries) {
                  // 重试次数用完，记录失败
                  this.logger.error(`[Claude Orchestrator] 步骤 ${step.id} 重试 ${maxRetries} 次后仍失败`);
                  stepsExecuted.push({
                    stepId: step.id,
                    skillName: step.skillName,
                    actionName: step.actionName,
                    success: false,
                    error: lastError?.message || '未知错误',
                    duration: Date.now() - stepStartTime,
                  });
                  // 根据 fallback 策略决定是否继续
                  if (plan.fallbackStrategy.onError === 'stop') {
                    throw lastError;
                  }
                  // continue: 继续执行下一个步骤
                  break;
                }
              }
            }
          } else {
            throw error;
          }
        }
      }

      // 整合结果
      const answerText = this.generateAnswerText(results, stepsExecuted);
      
      // 计算总成本（简化估算）
      const totalCost = stepsExecuted.reduce((sum, step) => {
        // 每个 Skill/Action 调用估算成本（简化）
        return sum + (step.success ? 0.001 : 0); // $0.001 per successful step
      }, 0);
      
      return {
        success: true,
        result: results,
        answerText,
        stepsExecuted,
        totalDuration: Date.now() - startTime,
        totalCost,
        decisionLog,
      };
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] 执行计划失败: ${error?.message}`);
      
      // 使用错误类型枚举推断错误类型
      const errorType = inferErrorType(error);
      const strategy = getErrorHandlingStrategy(errorType);
      
      this.logger.warn(`[Claude Orchestrator] 检测到错误: type=${errorType}, shouldShowClarification=${strategy.shouldShowClarification}`);
      
      // 如果需要显示澄清消息，构建用户友好的澄清消息
      if (strategy.shouldShowClarification) {
        let clarificationMessage: string;
        
        if (errorType === ErrorType.CRITICAL_DEPENDENCY_MISSING) {
          clarificationMessage = this.buildClarificationMessage(error);
        } else if (errorType === ErrorType.MISSING_REQUIRED_PARAM) {
          clarificationMessage = this.buildMissingParamClarificationMessage(error);
        } else {
          // 使用策略中的消息模板
          clarificationMessage = strategy.messageTemplate
            .replace('{errorMessage}', error?.message || '未知错误')
            .replace('{skillName}', error?.skillName || '未知服务');
        }
        
        return {
          success: false,
          result: {
            ...results,
            // 澄清消息字段统一放在 result 中（与 OrchestrationResult 接口保持一致）
            needsUserConfirmation: strategy.requiresUserConfirmation,
            clarificationMessage,
            missingServices: error.missingServices || [],
            solutions: strategy.suggestedSolutions.length > 0 
              ? strategy.suggestedSolutions 
              : this.extractSolutionsFromError(error),
            errorType, // 新增：错误类型
          },
          answerText: clarificationMessage,
          stepsExecuted,
          totalDuration: Date.now() - startTime,
          decisionLog,
        };
      }
      
      // 普通错误处理
      return {
        success: false,
        result: results,
        answerText: `执行过程中出现错误：${error?.message || '未知错误'}`,
        stepsExecuted,
        totalDuration: Date.now() - startTime,
        decisionLog,
      };
    }
  }
  
  /**
   * 构建用户友好的澄清消息（优化版：去除技术术语）
   */
  private buildClarificationMessage(error: any): string {
    const skillName = this.translateSkillName(error.skillName || '未知服务');
    const missingServices = error.missingServices || [];
    const solutions = error.solutions || [];
    
    const message = [
      `抱歉，暂时无法完成行程规划。`,
      '',
      '原因：',
      `- ${skillName}暂时不可用`,
      ...(missingServices.length > 0 ? [
        '',
        '受影响的功能：',
        ...missingServices.map((service: string) => `- ${this.translateServiceName(service)}`)
      ] : []),
      '',
      '您可以：',
      ...solutions.map((solution: string, index: number) => `${index + 1}. ${solution}`),
      '',
      '如果问题持续存在，请联系客服或稍后重试。',
    ].join('\n');
    
    return message;
  }

  /**
   * 🆕 翻译技能名称（去除技术术语）
   */
  private translateSkillName(skillName: string): string {
    const translations: Record<string, string> = {
      'transport.search': '交通查询服务',
      'poi.search': '地点搜索服务',
      'dem.get.profile': '地形分析服务',
      'opening_hours.get': '开放时间查询服务',
      'geo.check.hazard.zones': '安全风险评估服务',
    };
    return translations[skillName] || skillName;
  }

  /**
   * 🆕 翻译服务名称（去除技术术语）
   */
  private translateServiceName(service: string): string {
    const translations: Record<string, string> = {
      'transport': '交通信息查询',
      'poi': '地点信息查询',
      'dem': '地形数据分析',
      'opening_hours': '开放时间查询',
      'hazard_zones': '安全风险评估',
    };
    return translations[service] || service;
  }

  /**
   * 构建缺少必需参数的澄清消息（优化版：使用用户语言）
   */
  private buildMissingParamClarificationMessage(error: any): string {
    const errorMessage = error?.message || '缺少必需参数';
    
    // 尝试从错误消息或 error.missingParams 中提取缺失的参数名
    let missingParams: string[] = [];
    if (error?.missingParams && Array.isArray(error.missingParams)) {
      missingParams = error.missingParams.map((p: string) => this.translateParamName(p));
    } else {
      // 从错误消息中提取
      if (errorMessage.includes('countryCode')) {
        missingParams.push('目的地国家');
      }
      if (errorMessage.includes('tripId')) {
        missingParams.push('行程ID');
      }
      if (errorMessage.includes('world')) {
        missingParams.push('行程上下文信息');
      }
      if (missingParams.length === 0) {
        // 尝试从错误消息中提取参数名
        const match = errorMessage.match(/(\w+)\s*是必需的/);
        if (match) {
          missingParams.push(this.translateParamName(match[1]));
        } else {
          // 尝试匹配 "缺少必需参数: xxx, yyy" 格式
          const paramMatch = errorMessage.match(/缺少必需参数:\s*(.+)/);
          if (paramMatch) {
            missingParams = paramMatch[1].split(',').map((p: string) => this.translateParamName(p.trim()));
          } else {
            missingParams.push('必需信息');
          }
        }
      }
    }
    
    const missingParam = missingParams.join('、');
    
    const solutions = this.extractSolutionsFromError(error);
    
    const message = [
      `需要补充一些信息才能完成行程规划。`,
      '',
      `缺少的信息：`,
      `- ${missingParam || '必需信息'}`,
      '',
      `您可以：`,
      ...solutions.map((solution: string, index: number) => `${index + 1}. ${solution}`),
      '',
      `提供这些信息后，我们将继续为您规划行程。`,
    ].join('\n');
    
    return message;
  }

  /**
   * 🆕 翻译参数名称（去除技术术语）
   */
  private translateParamName(paramName: string): string {
    const translations: Record<string, string> = {
      'countryCode': '目的地国家',
      'tripId': '行程ID',
      'world': '行程上下文信息',
      'destination': '目的地',
      'origin': '出发地',
      'date_range': '日期范围',
      'start_date': '开始日期',
      'days': '行程天数',
      'mode': '交通方式',
      'party': '同行人员信息',
      'constraints': '约束条件',
      'preferences': '偏好设置',
    };
    return translations[paramName] || paramName;
  }

  /**
   * 从错误消息中提取解决方案
   */
  private extractSolutionsFromError(error: any): string[] {
    const errorMessage = error?.message || '';
    const solutions: string[] = [];
    
    // 如果错误消息中包含提示信息（如"可通过 tripId 或直接传入"）
    if (errorMessage.includes('可通过')) {
      const match = errorMessage.match(/可通过\s*([^或]+)(?:\s*或\s*([^）]+))?/);
      if (match) {
        if (match[1]) {
          solutions.push(`通过 ${match[1].trim()} 提供信息`);
        }
        if (match[2]) {
          solutions.push(`或直接 ${match[2].trim()}`);
        }
      }
    }
    
    // 根据错误类型添加通用解决方案
    if (errorMessage.includes('countryCode')) {
      if (!solutions.length) {
        solutions.push('在请求中提供国家代码（如 "CN"、"IS"）');
        solutions.push('或提供已保存的行程 ID，系统将自动获取国家代码');
        solutions.push('或在消息中明确提及目的地国家（如 "中国"、"冰岛"）');
      }
    } else if (errorMessage.includes('tripId')) {
      if (!solutions.length) {
        solutions.push('提供已保存的行程 ID');
        solutions.push('或直接提供行程相关的详细信息（目的地、日期等）');
      }
    } else {
      if (!solutions.length) {
        solutions.push('检查请求参数是否完整');
        solutions.push('提供更多上下文信息');
      }
    }
    
    return solutions.length > 0 ? solutions : ['请提供完整的请求信息'];
  }

  // ==================== 辅助方法 ====================

  /**
   * 构建意图分析提示词
   */
  private buildIntentAnalysisPrompt(
    request: RouteAndRunRequestDto,
    context: AgentContext,
  ): string {
    return `
${INTENT_ANALYSIS_PROMPT}

[用户请求]
${request.message}

[上下文信息]
- 用户 ID: ${context.userId}
- 行程 ID: ${context.tripId || '无'}
- 对话历史: ${context.conversationHistory?.join('\n') || '无'}

请分析用户意图。
`.trim();
  }

  /**
   * 构建路由决策提示词
   */
  private buildRoutingPrompt(intentAnalysis: IntentAnalysis): string {
    return `
${ROUTING_DECISION_PROMPT}

[意图分析结果]
${JSON.stringify(intentAnalysis, null, 2)}

请根据意图分析结果，决定路由策略。
`.trim();
  }

  /**
   * 构建 Skills 选择提示词
   */
  private buildSkillsSelectionPrompt(
    intentAnalysis: IntentAnalysis,
    routingDecision: RoutingDecision,
    availableSkills: Array<{ name: string; description: string }>,
  ): string {
    const skillsList = availableSkills.map(skill => 
      `- ${skill.name}: ${skill.description}`
    ).join('\n');

    return `
${SKILLS_SELECTION_PROMPT}

[意图分析结果]
${JSON.stringify(intentAnalysis, null, 2)}

[路由决策]
${JSON.stringify(routingDecision, null, 2)}

[可用 Skills]
${skillsList}

请选择最合适的 Skills。
`.trim();
  }

  /**
   * 构建执行计划编排提示词
   */
  private buildExecutionPlanningPrompt(
    skillsPlan: SkillsPlan,
    routingDecision: RoutingDecision,
  ): string {
    return `
${EXECUTION_PLANNING_PROMPT}

[Skills 选择结果]
${JSON.stringify(skillsPlan, null, 2)}

[路由决策]
${JSON.stringify(routingDecision, null, 2)}

请编排最优的执行计划。
`.trim();
  }

  /**
   * 获取可用的 Skills
   */
  private getAvailableSkills(): Array<{ name: string; description: string }> {
    if (!this.skillsRegistry) {
      this.logger.warn('[Claude Orchestrator] SkillsRegistry 未注入，返回空列表');
      return [];
    }

    try {
      // 获取所有注册的 Skills
      const allSkills = this.skillsRegistry.getAllSkills();
      this.logger.debug(`[Claude Orchestrator] 获取到 ${allSkills.length} 个可用 Skills`);
      
      return allSkills.map(skill => ({
        name: skill.metadata?.name || 'unknown',
        description: skill.metadata?.description || 'No description',
      }));
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] 获取 Skills 失败: ${error?.message}`, error?.stack);
      return [];
    }
  }

  /**
   * 准备 Skill 输入
   */
  private prepareSkillInput(
    step: ExecutionStep,
    results: Record<string, any>,
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): any {
    // 使用步骤中定义的输入，或从前面步骤的结果中提取
    let input: any = {};
    
    if (step.input) {
      // 替换结果引用（例如：${step1.result}）
      const inputStr = JSON.stringify(step.input);
      const processedInput = inputStr.replace(/\$\{(\w+)\}/g, (match, key) => {
        return results[key] ? JSON.stringify(results[key]) : match;
      });
      input = JSON.parse(processedInput);
    }
    
    // 从上下文和请求中提取实际值，替换占位符
    const actualTripId = context.tripId || request.trip_id;
    const actualUserId = context.userId || request.user_id;
    
    // 递归替换占位符
    input = this.replacePlaceholders(input, {
      tripId: actualTripId,
      trip_id: actualTripId,
      userId: actualUserId,
      user_id: actualUserId,
      requestId: context.requestId || request.request_id,
    });
    
    // 如果 input 中没有 tripId，但 context 中有，自动添加
    if (actualTripId && !input.tripId && !input.trip_id) {
      input.tripId = actualTripId;
    }
    
    // 为特定 Skills 提供智能默认值
    if (step.skillName === 'routeDirection.pickForIntent') {
      // 确保 userIntentTags 是数组
      if (!Array.isArray(input.userIntentTags)) {
        input.userIntentTags = input.userIntentTags ? [input.userIntentTags] : [];
      }
      
      // 如果没有 countryCode，尝试从请求中提取
      if (!input.countryCode && request.message) {
        const countryCode = this.extractCountryCodeFromMessage(request.message);
        if (countryCode) {
          input.countryCode = countryCode;
        }
      }
      
      // 如果没有 season，尝试从消息中提取日期，或使用当前月份作为默认值
      if (!input.season || typeof input.season !== 'number') {
        const extractedMonth = this.extractMonthFromMessage(request.message);
        if (extractedMonth) {
          input.season = extractedMonth;
        } else {
          // 使用当前月份作为默认值
          input.season = new Date().getMonth() + 1;
        }
      }
    }
    
    // 为 world.buildContext 提供智能默认值
    if (step.skillName === 'world.buildContext') {
      // 尝试从前面步骤的结果中提取 countryCode
      if (!input.countryCode || input.countryCode === 'none') {
        // 查找 routeDirection.pickForIntent 的结果
        for (const [stepId, stepResult] of Object.entries(results)) {
          if (stepResult && typeof stepResult === 'object') {
            // 方法1: 如果前面步骤返回了 routeDirectionId，可以从中提取国家代码
            if (stepResult.routeDirectionId && typeof stepResult.routeDirectionId === 'string') {
              // routeDirectionId 可能是 "default-IS-1" 这样的格式
              const match = stepResult.routeDirectionId.match(/default-([A-Z]{2})-\d+/);
              if (match) {
                input.countryCode = match[1];
                this.logger.debug(`从前面步骤 ${stepId} 的 routeDirectionId 提取 countryCode: ${input.countryCode}`);
                break;
              }
            }
            
            // 方法2: 如果前面步骤直接返回了 countryCode
            if (stepResult.countryCode && typeof stepResult.countryCode === 'string') {
              input.countryCode = stepResult.countryCode;
              this.logger.debug(`从前面步骤 ${stepId} 直接获取 countryCode: ${input.countryCode}`);
              break;
            }
          }
        }
      }
      
      // 如果还是没有 countryCode，尝试从用户消息中提取
      if ((!input.countryCode || input.countryCode === 'none') && request.message) {
        const countryCode = this.extractCountryCodeFromMessage(request.message);
        if (countryCode) {
          input.countryCode = countryCode;
          this.logger.debug(`从用户消息提取 countryCode: ${input.countryCode}`);
        }
      }
      
      // 清理无效值
      if (input.countryCode === 'none' || input.countryCode === 'undefined' || input.countryCode === 'null') {
        delete input.countryCode;
      }

      // Emergency constraint injection (auto-heal): pass through to world.buildContext so physical.roadStates can be overlaid.
      if ((request as any).emergency_constraints && !(input as any).emergency_constraints) {
        (input as any).emergency_constraints = (request as any).emergency_constraints;
      }
    }
    
    // 为 decision.runThreeGuardians 提供智能默认值
    if (step.skillName === 'decision.runThreeGuardians') {
      // 如果没有 world 和 tripId，尝试从前面步骤的结果中提取
      if (!input.world && !input.tripId) {
        // 查找 world.buildContext 的结果
        for (const [stepId, stepResult] of Object.entries(results)) {
          if (stepResult && typeof stepResult === 'object') {
            // 如果前面步骤返回了 world 字段
            if (stepResult.world) {
              input.world = stepResult.world;
              this.logger.debug(`从前面步骤 ${stepId} 提取 world 对象`);
              break;
            }
          }
        }
      }
      
      // 如果还是没有 world，但 context 中有 tripId，使用 tripId
      if (!input.world && !input.tripId && actualTripId) {
        input.tripId = actualTripId;
        this.logger.debug(`使用 context 中的 tripId: ${input.tripId}`);
      }
      
      // 注意：如果没有 world 和 tripId，不自动构建，让 skill 抛出错误，系统会统一返回澄清问题
      // 这样用户可以明确知道缺少什么信息
    }

    // P0: Skills 内 LLM 打点 - 注入 tokenContext（skillName → state_machine_step 映射）
    const requestId = context.requestId || request.request_id;
    if (requestId && step.skillName) {
      const stateStep = this.mapSkillNameToStep(step.skillName);
      input.tokenContext = {
        request_id: requestId,
        state_machine_step: stateStep,
        sub_agent: this.mapSkillNameToSubAgent(step.skillName),
      };
    }

    return input;
  }

  /** skillName → OrchestrationStep（用于 Token 按阶段打点） */
  private mapSkillNameToStep(skillName?: string): import('../../agent/interfaces/trip-plan.interface').OrchestrationStep {
    if (!skillName) return 'INTAKE';
    if (skillName.includes('gate') || skillName.includes('runThreeGuardians') || skillName.includes('precheck')) return 'GATE_EVAL';
    if (skillName.includes('itinerary.generate') || skillName.includes('plan.') || skillName.includes('architect') || skillName.includes('transit') || skillName.includes('budget') || skillName.includes('pace') || skillName.includes('constraints')) return 'PLAN_GEN';
    if (skillName.includes('verify')) return 'VERIFY';
    if (skillName.includes('repair') || skillName.includes('alternatives')) return 'REPAIR';
    if (skillName.includes('narrate') || skillName.includes('explain')) return 'NARRATE';
    return 'RESEARCH'; // 默认
  }

  private mapSkillNameToSubAgent(skillName?: string): import('../../agent/interfaces/trip-plan.interface').SubAgentType {
    if (!skillName) return 'Planner';
    if (skillName.includes('gate')) return 'Gatekeeper';
    if (skillName.includes('narrate') || skillName.includes('explain')) return 'Narrator';
    return 'Planner';
  }
  
  /**
   * 从消息中提取国家代码（简单规则）
   * 支持国家名和城市名映射
   */
  private extractCountryCodeFromMessage(message: string): string | undefined {
    const countryMap: Record<string, string> = {
      // 国家名
      '冰岛': 'IS',
      'Iceland': 'IS',
      'iceland': 'IS',
      '中国': 'CN',
      'China': 'CN',
      'china': 'CN',
      '日本': 'JP',
      'Japan': 'JP',
      'japan': 'JP',
      '美国': 'US',
      'United States': 'US',
      'USA': 'US',
      '新西兰': 'NZ',
      'New Zealand': 'NZ',
      'new zealand': 'NZ',
      'NZ': 'NZ',
      '大溪地': 'PF',
      'Tahiti': 'PF',
      'tahiti': 'PF',
      '法属波利尼西亚': 'PF',
      'French Polynesia': 'PF',
      '泰国': 'TH',
      'Thailand': 'TH',
      'thailand': 'TH',
      '新加坡': 'SG',
      'Singapore': 'SG',
      'singapore': 'SG',
      '韩国': 'KR',
      'Korea': 'KR',
      'korea': 'KR',
      '马来西亚': 'MY',
      'Malaysia': 'MY',
      'malaysia': 'MY',
      '越南': 'VN',
      'Vietnam': 'VN',
      'vietnam': 'VN',
      '格陵兰': 'GL',
      'Greenland': 'GL',
      'greenland': 'GL',
      'GL': 'GL',
      '斯瓦尔巴': 'SJ',
      'Svalbard': 'SJ',
      'svalbard': 'SJ',
      'SJ': 'SJ',
      '阿根廷': 'AR',
      'Argentina': 'AR',
      'argentina': 'AR',
      'AR': 'AR',
      // 阿尔卑斯（跨越多国）
      '阿尔卑斯': 'AL',
      '阿尔卑斯山': 'AL',
      'Alps': 'AL',
      'alps': 'AL',
      'AL': 'AL',
      // 城市名映射到国家
      '东京': 'JP',
      'Tokyo': 'JP',
      'tokyo': 'JP',
      '大阪': 'JP',
      'Osaka': 'JP',
      '京都': 'JP',
      'Kyoto': 'JP',
      '北京': 'CN',
      'Beijing': 'CN',
      '上海': 'CN',
      'Shanghai': 'CN',
      'shanghai': 'CN',
      '雷克雅未克': 'IS',
      'Reykjavik': 'IS',
      'reykjavik': 'IS',
      'us': 'US',
    };
    
    const lowerMessage = message.toLowerCase();
    for (const [key, code] of Object.entries(countryMap)) {
      if (lowerMessage.includes(key.toLowerCase())) {
        return code;
      }
    }
    
    return undefined;
  }
  
  /**
   * 从消息中提取月份（1-12）
   */
  private extractMonthFromMessage(message: string): number | undefined {
    if (!message) {
      return undefined;
    }
    
    // 尝试匹配月份关键词
    const monthKeywords: Record<string, number> = {
      '一月': 1, '1月': 1, 'january': 1, 'jan': 1,
      '二月': 2, '2月': 2, 'february': 2, 'feb': 2,
      '三月': 3, '3月': 3, 'march': 3, 'mar': 3,
      '四月': 4, '4月': 4, 'april': 4, 'apr': 4,
      '五月': 5, '5月': 5, 'may': 5,
      '六月': 6, '6月': 6, 'june': 6, 'jun': 6,
      '七月': 7, '7月': 7, 'july': 7, 'jul': 7,
      '八月': 8, '8月': 8, 'august': 8, 'aug': 8,
      '九月': 9, '9月': 9, 'september': 9, 'sep': 9, 'sept': 9,
      '十月': 10, '10月': 10, 'october': 10, 'oct': 10,
      '十一月': 11, '11月': 11, 'november': 11, 'nov': 11,
      '十二月': 12, '12月': 12, 'december': 12, 'dec': 12,
    };
    
    const lowerMessage = message.toLowerCase();
    for (const [key, month] of Object.entries(monthKeywords)) {
      if (lowerMessage.includes(key.toLowerCase())) {
        return month;
      }
    }
    
    // 尝试匹配日期格式（YYYY-MM-DD 或类似格式）
    const datePattern = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
    const dateMatch = message.match(datePattern);
    if (dateMatch) {
      const month = parseInt(dateMatch[2], 10);
      if (month >= 1 && month <= 12) {
        return month;
      }
    }
    
    return undefined;
  }
  
  /**
   * 替换输入中的占位符文本
   */
  private replacePlaceholders(input: any, replacements: Record<string, any>): any {
    if (typeof input === 'string') {
      // 替换常见的占位符文本
      const placeholderPatterns = [
        /需要从用户请求中提取/gi,
        /none/gi,
        /undefined/gi,
        /null/gi,
      ];
      
      let result = input;
      for (const pattern of placeholderPatterns) {
        if (pattern.test(result)) {
          // 如果包含占位符，尝试从 replacements 中获取值
          if (result.toLowerCase().includes('trip') && replacements.tripId) {
            result = replacements.tripId;
          } else if (result.toLowerCase().includes('user') && replacements.userId) {
            result = replacements.userId;
          } else if (result.toLowerCase().includes('request') && replacements.requestId) {
            result = replacements.requestId;
          }
        }
      }
      
      return result;
    } else if (Array.isArray(input)) {
      return input.map(item => this.replacePlaceholders(item, replacements));
    } else if (input && typeof input === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(input)) {
        // 特殊处理 tripId 相关字段
        if ((key === 'tripId' || key === 'trip_id') && 
            (typeof value === 'string' && 
             (value === 'none' || value === 'undefined' || value === 'null' || 
              value.includes('需要从用户请求中提取')))) {
          result[key] = replacements.tripId || replacements.trip_id;
        } else if ((key === 'userId' || key === 'user_id') && 
                   (typeof value === 'string' && 
                    (value === 'none' || value === 'undefined' || value === 'null'))) {
          result[key] = replacements.userId || replacements.user_id;
        } else {
          result[key] = this.replacePlaceholders(value, replacements);
        }
      }
      return result;
    }
    
    return input;
  }

  /**
   * 准备 Action 输入
   */
  private prepareActionInput(
    step: ExecutionStep,
    results: Record<string, any>,
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): any {
    return this.prepareSkillInput(step, results, context, request);
  }

  /**
   * 生成答案文本
   */
  private generateAnswerText(
    results: Record<string, any>,
    stepsExecuted: OrchestrationResult['stepsExecuted'],
  ): string {
    // 尝试从多个步骤的结果中提取文本
    const successfulSteps = stepsExecuted.filter(step => step.success);
    
    if (successfulSteps.length === 0) {
      return '处理完成，但所有步骤都失败了。';
    }
    
    // 优先使用最后一个成功步骤的结果
    const lastStep = successfulSteps[successfulSteps.length - 1];
    if (lastStep?.result) {
      // 尝试多种格式
      if (typeof lastStep.result === 'string') {
        return lastStep.result;
      }
      if (lastStep.result.answerText) {
        return lastStep.result.answerText;
      }
      if (lastStep.result.message) {
        return lastStep.result.message;
      }
      if (lastStep.result.explanation) {
        return lastStep.result.explanation;
      }
      if (lastStep.result.summary) {
        return lastStep.result.summary;
      }
      // 如果是对象，尝试提取关键信息
      if (typeof lastStep.result === 'object') {
        // 尝试提取 timeline、candidates 等信息
        if (lastStep.result.timeline && Array.isArray(lastStep.result.timeline)) {
          return `已生成 ${lastStep.result.timeline.length} 天的行程安排。`;
        }
        if (lastStep.result.candidates && Array.isArray(lastStep.result.candidates)) {
          return `找到 ${lastStep.result.candidates.length} 个候选结果。`;
        }
        // 如果有关键字段，尝试生成摘要
        const keys = Object.keys(lastStep.result);
        if (keys.length > 0) {
          return `处理完成。结果包含：${keys.slice(0, 3).join('、')}${keys.length > 3 ? '等' : ''}。`;
        }
      }
    }
    
    // 如果所有步骤都成功但没有明确的结果文本，生成汇总
    if (successfulSteps.length > 0) {
      const skillNames = successfulSteps
        .map(step => step.skillName || step.actionName)
        .filter(Boolean)
        .join('、');
      return `已成功执行 ${successfulSteps.length} 个步骤${skillNames ? `（${skillNames}）` : ''}。`;
    }
    
    return '处理完成';
  }

  /**
   * 生成降级执行计划
   */
  private generateFallbackPlan(skillsPlan: SkillsPlan): ExecutionPlan {
    const steps: ExecutionStep[] = skillsPlan.selectedSkills.map((skill, index) => ({
      id: `step${index + 1}`,
      type: 'skill',
      skillName: skill.skillName,
      dependencies: skill.dependencies || [],
      parallel: false,
      input: skill.input,
      fallback: {
        onError: 'continue',
        retryCount: 1,
      },
    }));

    return {
      steps,
      parallelGroups: [],
      fallbackStrategy: {
        onError: 'continue',
        retryCount: 1,
      },
    };
  }

  // ==================== 状态机流程（基于 claude.md）====================

  /**
   * 状态机编排主入口（基于 claude.md 架构）
   *
   * Phase 2.3 流程：INTAKE → STATE_UPDATE → RESEARCH → GATE_EVAL → CONTEXT_BUILD → PLAN_GEN → OPTIMIZE → VERIFY → REPAIR → NARRATE → DONE
   *
   * 强制顺序：Gate 在 Plan 之前执行
   */
  async orchestrateWithStateMachine(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    deadline?: { remainingMs: () => number; clamp: (ms: number, minMs?: number) => number },
    resume?: { decision_state: DecisionState; checkpoint_loaded?: boolean },
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    this.logger.log(`[Claude Orchestrator] 开始状态机编排: request_id=${request.request_id}`);
    this.logger.log(`[Claude Orchestrator] Deadline: ${deadline?.remainingMs() || 'N/A'}ms`);

    // 获取 LLM 提供商
    const llmProvider = this.getLlmProvider(request);
    this.logger.log(`[Claude Orchestrator] LLM Provider: ${llmProvider}`);

    // 初始化状态
    const state: OrchestratorState = {
      request_id: request.request_id,
      // P0 改进：PlanState 版本化
      plan_id: request.trip_id ? `plan-${request.trip_id}` : `plan-${request.request_id}`,
      plan_version: 1,
      current_step: 'INTAKE',
      evidence_registry: new Map(),
      decision_log: [],
      decision_steps: [], // Decision Steps（业务层决策，来自 Decision-First Engine）
      errors: [],
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        // Context Orchestrator：打通 userId/tripId 供 buildContextForNode / UserTravelProfile 使用
        userId: request.user_id ?? undefined,
        tripId: request.trip_id ?? undefined,
        fallback_strategy_hint: request.options?.fallback_strategy,
        fallback_debug_scores: request.options?.show_debug_scores,
        show_commute_matrix: request.options?.show_commute_matrix === true,
        require_poi_data: request.options?.require_poi_data === true,
        allow_partial: request.options?.allow_partial === true,
        poi_policy: request.options?.poi_policy,
        poi_source_hint: request.options?.poi_source,
        show_poi_trace: request.options?.show_poi_trace === true,
        // Persist emergency constraints on OrchestratorState for DSO projection (Sentinel hard mask).
        emergency_constraints: (request as any).emergency_constraints ?? undefined,
      },
    };

    // Phase 2.1: 初始化 DecisionState (DSO)，与 OrchestratorState 并行维护
    // Phase 2.4: DECISION_KERNEL_ENABLED=false 可回滚到无 Kernel 路径
    // P1: DECISION_KERNEL_AB_PERCENT 设置时按 hash 分流（如 10 表示 10% 实验组）
    let decisionState: DecisionState | undefined;
    let resumeSkipIntake = false;
    if (resume?.decision_state && this.decisionKernel && this.isKernelEnabledForRequest(request)) {
      decisionState = resume.decision_state;
      const requestId = request.request_id;
      const nextHarness = this.computeResumeHarnessEntryFromLast(decisionState.systemState?.lastStep);
      let step = nextHarness;
      let admission = await this.decisionKernel.validateStepAdmission(decisionState, step, { requestId });
      let depth = 0;
      while (!admission.passed && admission.suggested_fallback_step && depth < 8) {
        depth += 1;
        step = admission.suggested_fallback_step;
        admission = await this.decisionKernel.validateStepAdmission(decisionState, step, { requestId });
      }
      if (!admission.passed) {
        this.logger.warn(
          `[Claude Orchestrator] Durable resume: 准入失败，回退全新 DSO。末次尝试 step=${String(step)} codes=${admission.validation_results
            .filter((r) => !r.passed)
            .map((r) => r.code)
            .join(',') ?? 'n/a'}`,
        );
        decisionState = this.decisionKernel.createInitialState(requestId, {
          evaluationRunId: request.meta?.run_id,
        });
        resumeSkipIntake = false;
      } else {
        const ls = decisionState.systemState?.lastStep;
        resumeSkipIntake = ls === HarnessStepName.INTAKE || ls === 'INTAKE';
        decisionState = this.decisionKernel.updateState(decisionState, {
          harnessRuntime: {
            ...(decisionState.harnessRuntime ?? {}),
            resume_admission_step: step,
            resume_admission_passed: true,
          },
        });
        this.logger.debug(
          `[Claude Orchestrator] Durable resume: DSO 已加载 admission_step=${String(step)} skip_intake=${resumeSkipIntake}`,
        );
      }
    } else if (this.decisionKernel && this.isKernelEnabledForRequest(request)) {
      decisionState = this.decisionKernel.createInitialState(request.request_id, {
        evaluationRunId: request.meta?.run_id,
      });
      this.logger.debug(`[Claude Orchestrator] DSO 已初始化: requestId=${request.request_id}`);
    }

    try {
      // 步骤 1: INTAKE - 解析请求 & 缺口识别（Durable：lastStep=INTAKE 时跳过重复 INTAKE）
      if (!resumeSkipIntake) {
        await this.executeIntakeStep(request, context, state, llmProvider);
      } else {
        this.logger.log('[Claude Orchestrator] Durable resume: 跳过 INTAKE，进入 STATE_UPDATE');
        state.current_step = 'STATE_UPDATE';
        state.metadata.last_updated_at = new Date().toISOString();
      }
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 2: STATE_UPDATE - Phase 2.3 显式 DSO 同步
      decisionState = await this.executeStateUpdateStep(state, decisionState) ?? decisionState;
      this.maybeSnapshot(state, 'AUTO');

      // 在 DSO 里记录本轮澄清 fingerprint 与重复尝试次数（用于高亮 accept_no_solution 等防御性策略）
      if (this.decisionKernel && decisionState) {
        const fp = (state.metadata as any)?.last_relaxation_fingerprint as string | undefined;
        if (fp) {
          const prev = decisionState.systemState?.lastRelaxationFingerprint;
          const prevSame = decisionState.systemState?.consecutiveSameRelaxationAttempts ?? 0;
          const same = prev && prev === fp;
          const nextSame = same ? prevSame + 1 : 0;
          const prevRetry = decisionState.systemState?.planGenRetryCount ?? 0;
          decisionState = this.decisionKernel.updateState(decisionState, {
            systemState: {
              requestId: state.request_id,
              lastRelaxationFingerprint: fp,
              consecutiveSameRelaxationAttempts: nextSame,
              planGenRetryCount: prevRetry + 1,
            } as any,
          });
        }
      }

      // 用户批准终止：优雅拒绝出口（不进入 RESEARCH/Gate/Plan）
      const terminalIntent = (state.metadata as any)?.terminal_intent as string | undefined;
      if (terminalIntent === 'TERMINAL_NO_SOLUTION') {
        this.logger.warn(`[Claude Orchestrator] TERMINAL_NO_SOLUTION confirmed by user; halting orchestration.`);
        state.current_step = 'DONE';
        state.verdict = 'REJECT';
        state.metadata.last_updated_at = new Date().toISOString();
        state.metadata.total_duration_ms = Date.now() - startTime;
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildTerminalNoSolutionResult(state, startTime, decisionState);
      }

      // HARD 缺口 + 已生成澄清问题：必须在 RESEARCH 之前返回，避免 transport.search 等技能在「未指定」上失败
      if (this.shouldReturnClarificationForHardGaps(state)) {
        const compileHard =
          state.gaps?.find(
            (g) =>
              g?.severity === 'HARD' &&
              (g.type === 'INTENT_COMPILE_ERROR' || g.type === 'SPEC_TYPE_ERROR'),
          ) ?? null;
        if (compileHard) {
          state.decision_log.push({
            request_id: state.request_id,
            step: 'INTAKE',
            actor: 'Orchestrator',
            inputs_summary: 'INTAKE compiler hard error → clarification',
            outputs_summary: `INTENT_COMPILE_BLOCK: ${compileHard.type}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'INTENT_COMPILE_BLOCK',
              gap_type: compileHard.type,
              detail: compileHard.detail,
              allow_partial: state.metadata?.allow_partial === true,
            },
          });
        }
        this.logger.debug(
          `[Claude Orchestrator] HARD 缺口且已有澄清问题，跳过 RESEARCH/Gate/Plan，直接返回澄清`,
        );
        return this.buildClarificationResult(state, startTime, decisionState);
      }

      // 步骤 3: RESEARCH - KERNEL_NATIVE_EXECUTION 时走 Kernel.executeResearch，否则走 callback
      decisionState = await this.executeResearchPhase(decisionState, state, request, context, llmProvider);
      this.maybeSnapshot(state, 'AUTO');

      // Early Warning：RESEARCH 后前置侦察（不阻断；仅写入 metadata/decision_log，供 UI 提示）
      if (this.shadowConflictScanner) {
        try {
          const ew = await this.shadowConflictScanner.scan({
            decisionKernel: this.decisionKernel,
            decisionState,
            state,
            request,
          });
          if (ew) {
            const early_warning_id =
              ew.early_warning_id ??
              this.djb2Fingerprint({
                request_id: state.request_id,
                risk_level: ew.risk_level,
                conflict_type: ew.conflict_type,
                evidence_summary: ew.evidence_summary,
                suggested_actions: (ew.suggested_actions ?? [])
                  .map((s) => ({
                    relaxation_type: s.relaxation_type,
                    shadow_confidence: s.shadow_confidence,
                    violations_before: s.violations_before,
                    violations_after: s.violations_after,
                    fixed_conflict_types: (s.fixed_conflict_types ?? []).slice().sort(),
                  }))
                  .sort((a, b) => a.relaxation_type.localeCompare(b.relaxation_type)),
              });
            const withId: EarlyWarning = { ...ew, early_warning_id };
            (state.metadata as any) = { ...(state.metadata ?? {}), early_warning: withId };
            state.decision_log.push({
              request_id: state.request_id,
              step: 'RESEARCH',
              actor: 'Orchestrator',
              inputs_summary: 'ShadowConflictScanner (post-RESEARCH)',
              outputs_summary: `EARLY_WARNING: id=${early_warning_id} risk=${ew.risk_level} type=${ew.conflict_type} suggestions=${ew.suggested_actions.length}`,
              evidence_refs: [],
              timestamp: new Date().toISOString(),
              metadata: {
                system_action: 'EARLY_WARNING',
                early_warning: withId,
              },
            });
          }
        } catch (e: any) {
          this.logger.debug(`[Claude Orchestrator] Early warning scan skipped: ${e?.message}`);
        }
      }

      // INTAKE 形式化仿真：PREDICTIVE_FAILURE_REPORT（可与 Shadow EW 叠加；核心载荷为 SimulatedRepairTrace[]）
      const intakeSim = (state.metadata as any)?.intake_simulation as
        | { simulatedRepairTraces?: import('../services/route-feasibility.types').SimulatedRepairTrace[] }
        | undefined;
      const simTraces = intakeSim?.simulatedRepairTraces ?? [];
      if (simTraces.length > 0) {
        const audit_text = formatPredictiveFailureReport(simTraces);
        const simDigest = digestSimulatedRepairTracesForCorrelation(simTraces as unknown[]);
        const tripDigest = digestTripPlanRequestLight(state.trip_plan_request ?? {});
        const predictiveStateHash = computePredictiveFailureStateHash({
          dsoVersion: decisionState?.systemState?.version ?? 0,
          simulatedTracesDigest: simDigest,
          tripDigest,
        });
        const predictiveCorrelationId = buildDecisionFeedbackCorrelationId({
          sessionId: state.request_id,
          phase: 'INTAKE',
          kind: 'PREDICTIVE_FAILURE',
          roundIndex: 0,
          stateHash: predictiveStateHash,
        });
        const predictive_failure_report = {
          card_type: 'PREDICTIVE_FAILURE_REPORT' as const,
          correlationId: predictiveCorrelationId,
          audit_text,
          simulated_repair_traces: simTraces,
        };
        const existingEw = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
        const mergedEw: EarlyWarning = existingEw
          ? { ...existingEw, predictive_failure_report }
          : {
              early_warning_id: `pred-${state.request_id}`,
              risk_level: 'MEDIUM',
              conflict_type: 'MIXED',
              evidence_summary: 'INTAKE_PREDICTIVE_SIMULATION',
              suggested_actions: [],
              predictive_failure_report,
            };
        (state.metadata as any) = { ...(state.metadata ?? {}), early_warning: mergedEw };
        state.decision_log.push({
          request_id: state.request_id,
          step: 'RESEARCH',
          actor: 'Orchestrator',
          inputs_summary: 'IntakeCompilerService simulation → PREDICTIVE_FAILURE_REPORT',
          outputs_summary: `PREDICTIVE_FAILURE_REPORT: traces=${simTraces.length}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'PREDICTIVE_FAILURE_REPORT',
            correlation_id: predictiveCorrelationId,
            predictive_failure_report,
          },
        });
      }

      // 预防性放宽闭环：HIGH/CRITICAL 在进入 POI 前强制澄清；下一回合 `clarification_answers` 由 ClarificationHandlerService 与 PLAN_GEN 同源 Patch
      const ewMeta = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
      if (ewMeta && (ewMeta.risk_level === 'HIGH' || ewMeta.risk_level === 'CRITICAL')) {
        const clarAnswers = (request as any).clarification_answers as Array<{ questionId?: string }> | undefined;
        const answeredEarlyWarning = clarAnswers?.some((a) => a?.questionId === 'early_warning_relaxations');
        const earlyWarningAcknowledged =
          (state.metadata as any)?.early_warning_acknowledged === true ||
          decisionState?.systemState?.earlyWarningAcknowledged === true;
        if (!answeredEarlyWarning && !earlyWarningAcknowledged) {
            // A/B 实验：50% 保留传统模糊措辞，50% 注入 L3 级论证风格的劝说语句。
          const ab = (() => {
            // djb2:deadbeef -> 取低 8 位十六进制数字作为稳定分桶标识
            const fp = this.djb2Fingerprint({ request_id: state.request_id, exp: 'ew_l3_prompt_v1' });
            const hex = fp.includes(':') ? fp.split(':')[1] : fp;
            const n = parseInt(hex.slice(-8), 16);
            const bucket = Number.isFinite(n) ? n % 100 : 0;
            return { fingerprint: fp, bucket, treatment: bucket < 50 };
          })();

          const supported = new Set(['upgrade_vehicle_to_4wd', 'increase_days_by_1', 'drop_one_must_include_poi']);
          const dedup = new Map<string, (typeof ewMeta.suggested_actions)[number]>();
          for (const s of ewMeta.suggested_actions ?? []) {
            if (s?.relaxation_type && supported.has(s.relaxation_type) && !dedup.has(s.relaxation_type)) {
              dedup.set(s.relaxation_type, s);
            }
          }
          const list = [...dedup.values()];
          if (list.length > 0) {
            const anyHigh = list.some((s) => s.shadow_confidence === 'high_probability_fixed');
            this.logger.warn(
              `[Claude Orchestrator] EARLY_WARNING intercept: risk=${ewMeta.risk_level} type=${ewMeta.conflict_type} options=${list.length}`,
            );

            const risk = calculateEarlyWarningRisk(
              {
                risk_level: ewMeta.risk_level,
                conflict_type: ewMeta.conflict_type,
                suggested_actions: list,
              },
              { request_id: state.request_id },
            );
            const failure_risk_score = risk.score;

            const failure_prob_hint = (() => {
              if (!ab.treatment) return undefined;
              if (failure_risk_score >= 0.8) {
                return `【高危逻辑拦截】若保持现状继续，预计撞墙风险很高（score=${failure_risk_score.toFixed(2)}）。建议立即选择一项修复以恢复物理可行域。`;
              }
              if (failure_risk_score >= 0.4) {
                return `【运行风险提示】该配置存在较高后续回溯成本（score=${failure_risk_score.toFixed(2)}）。建议优先修复，避免反复试错。`;
              }
              return `【提示】已检测到潜在风险（score=${failure_risk_score.toFixed(2)}），建议先修复再继续。`;
            })();

            const l3Line = (() => {
              if (!ab.treatment) return undefined;
              const cid =
                ewMeta.conflict_type === 'REACHABILITY'
                  ? CONSTRAINT_IDS.TERRAIN_F_ROAD_COMPATIBILITY
                  : ewMeta.conflict_type === 'SCOPE'
                    ? CONSTRAINT_IDS.TIME_SPACE_ETA_FEASIBILITY
                    : CONSTRAINT_IDS.TIME_SPACE_ETA_FEASIBILITY;
              const mode = selectPersuasionMode(cid);
             // 注意：early_warning 处于行程生成之前阶段；我们此时尚无具体的数值宽松量。
             // 但我们仍会展示一个确定性的“硬约束”横幅，包含 cid 和证据摘要。
              const out = buildL3PersuasionLine({
                mode,
                proof: {
                  cid,
                  unit: 'bool',
                  slack: -1,
                  evidence: ewMeta.evidence_summary
                    ? { source: 'SHADOW_GATE', refIds: [String(ewMeta.early_warning_id ?? 'early_warning')] }
                    : { source: 'SHADOW_GATE' },
                },
              });
              return out?.line;
            })();

            const questionHeader = ab.treatment
              ? `[SYSTEM_ACTION]: EARLY_WARNING(L3) 风险=${ewMeta.risk_level}（${ewMeta.conflict_type}）。`
              : `[SYSTEM_ACTION]: EARLY_WARNING 风险=${ewMeta.risk_level}（${ewMeta.conflict_type}）。`;
            const questionBody = `${ewMeta.evidence_summary} 请在 POI 选择与排程前确认一项或多项“物理可行域”放宽（影子推演置信度已标注）。`;
            const question = `${questionHeader}${failure_prob_hint ? `\n${failure_prob_hint}\n` : ''}${l3Line ? `\n${l3Line}\n` : ''}${questionBody}`;

            // 约束评分器：对选项进行排序，以打破振荡 / 优先处理硬物理约束。
            const topPrecedent = Array.isArray((ewMeta as any).historical_precedents)
              ? ((ewMeta as any).historical_precedents[0] as any)
              : undefined;
            const oscillation_k = decisionState?.systemState?.consecutiveSameRelaxationAttempts ?? 0;
            const dominant_cid =
              String((decisionState as any)?.constraints?.violations?.[0]?.type ?? '').trim() ||
              (ewMeta.conflict_type === 'REACHABILITY' ? 'REACHABILITY_HARD' : ewMeta.conflict_type === 'SCOPE' ? 'SCOPE' : 'MIXED');
            const is_hard = ewMeta.conflict_type === 'REACHABILITY' || ewMeta.risk_level === 'CRITICAL';

            const scored = list
              .map((s) => {
                const id = s.relaxation_type as RelaxationActionId;
                const persuasion = this.localCaseStore?.getPersuasionRate({
                  signature: SignatureBuilder.buildConversionSignature({
                    conflict_type: ewMeta.conflict_type,
                    primary_violation_type: dominant_cid,
                    region_id: (state.trip_plan_request as any)?.region_id,
                    start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
                  }),
                  action: id,
                });
                const breakdown = ConstraintScorer.calculateScore(id, {
                  dominant_cid,
                  is_hard,
                  oscillation_k,
                  precedent: topPrecedent,
                  preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
                  persuasion,
                  delta: 1.5,
                });
                return { s, breakdown };
              })
              .sort((a, b) => b.breakdown.score - a.breakdown.score);

            state.clarification_questions = [
              {
                id: 'early_warning_relaxations',
                question,
                type: anyHigh ? 'single_choice' : 'multi_choice',
                required: true,
                options: ([
                  ...scored.map(({ s, breakdown }) => ({
                    value: s.relaxation_type,
                    label: `${s.relaxation_type}｜${s.impact_description}（${
                      s.shadow_confidence === 'high_probability_fixed' ? 'high_probability_fixed' : 'needs_more_changes'
                    }）`,
                    metadata: {
                      score: breakdown.score,
                      weights: breakdown.weights,
                      dominant_cid: breakdown.dominant_cid,
                      precedent_n: breakdown.precedent_n,
                      terms: breakdown.terms,
                    },
                  })),
                  {
                    value: 'proceed_at_own_risk',
                    label: '[实验性] 保持现状继续规划（可能导致失败）',
                    metadata: {
                      score: ConstraintScorer.calculateScore('proceed_at_own_risk', {
                        dominant_cid,
                        is_hard,
                        oscillation_k,
                        precedent: topPrecedent,
                        preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
                      }).score,
                      dominant_cid,
                      precedent_n: typeof topPrecedent?.sample_count === 'number' ? topPrecedent.sample_count : 0,
                    },
                  },
                ] as any),
                hint: '提交后下一回合将合并写入 TripPlanRequest；再次规划时可行域已被物理修复。也可选择「自担风险继续」跳过拦截（撞南墙模式，仍可能进入 PLAN_GEN 熔断）。',
              },
            ];
            state.decision_log.push({
              request_id: state.request_id,
              step: 'RESEARCH',
              actor: 'Orchestrator',
              inputs_summary: 'EARLY_WARNING intercept → clarification',
              outputs_summary: `PREVENTIVE_RELAXATION_REQUIRED: risk=${ewMeta.risk_level}`,
              evidence_refs: [],
              timestamp: new Date().toISOString(),
              metadata: {
                system_action: 'EARLY_WARNING_INTERCEPT',
                early_warning: ewMeta,
                options_snapshot: (state.clarification_questions?.[0] as any)?.options ?? [],
                ew_prompt_ab: ab,
                failure_risk_score,
                failure_risk_reason: risk.reason,
                failure_risk_confidence: risk.confidence,
                ...(l3Line ? { ew_l3_line: l3Line } : {}),
                ...(failure_prob_hint ? { failure_prob_hint } : {}),
              },
            });
            state.metadata.last_updated_at = new Date().toISOString();
            state.metadata.total_duration_ms = Date.now() - startTime;
            this.maybeSnapshot(state, 'CHECKPOINT');
            return this.buildClarificationResult(state, startTime, decisionState);
          }
        }
      }

      // 步骤 4: POI_SELECTION - 明确执行 POI 选择/排序，不直接从 RESEARCH 跳到 PLAN_GEN
      const poiSelectionResult = await this.executePoiSelectionStep(state, decisionState);
      this.maybeSnapshot(state, 'AUTO');
      if (poiSelectionResult.allowWithFallback) {
        this.logger.debug('[Claude Orchestrator] POI_SELECTION 无数据，触发 FALLBACK');
        this.applyFallbackPlan(state);
        this.recordPoiPlanningOutcomeAfterItinerary(state, decisionState);
        state.current_step = 'DONE';
        state.metadata.last_updated_at = new Date().toISOString();
        state.metadata.total_duration_ms = Date.now() - startTime;
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildSuccessResult(state, startTime, decisionState);
      }
      if (poiSelectionResult.needsClarification) {
        this.logger.debug(
          `[Claude Orchestrator] POI_SELECTION 无同国家候选，返回 NEED_MORE_INFO`,
        );
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildClarificationResult(state, startTime, decisionState);
      }

      // 步骤 5: GATE_EVAL - KERNEL_NATIVE_EXECUTION 时走 Kernel.executeGateEval
      decisionState = await this.executeGateEvalPhase(decisionState, state, request, context, llmProvider);
      this.relaxGateForPartialIfEligible(state);
      this.maybeSnapshot(state, 'AUTO');

      // 如果 Gate 结果为 BLOCK，直接返回
      if (state.gate_result?.gate_result === 'BLOCK') {
        this.recordPoiPlanningOutcomeAfterItinerary(state, decisionState);
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildBlockedResult(state, startTime, decisionState);
      }

      // 步骤 6: CONTEXT_BUILD - Phase 2.3 在 PLAN 前构建 Context
      decisionState = await this.executeContextBuildStep(request, context, state, decisionState);
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 7: PLAN_GEN - KERNEL_NATIVE_EXECUTION 时走 Kernel.executePlanGen
      decisionState = await this.executePlanGenPhase(decisionState, state, request, context, llmProvider);
      this.maybeSnapshot(state, 'AUTO');

      // PLAN_GEN 空草案：系统动作短路 — 不进入 OPTIMIZE/VERIFY/NARRATE，避免无依据行程建议
      const itineraryDays = Array.isArray((state.itinerary as any)?.days) ? (state.itinerary as any).days.length : 0;
      if (itineraryDays === 0 && this.decisionKernel && decisionState && !decisionState.systemState?.planGenTerminalFailure) {
        const inconsistent: PlanGenTerminalFailure = {
          code: 'INCONSISTENT_EMPTY_DRAFT',
          message: 'Itinerary is empty but no terminal failure was signaled.',
        };
        decisionState = this.decisionKernel.updateState(decisionState, {
          systemState: {
            requestId: state.request_id,
            currentPhase: 'PLAN_GEN',
            planGenTerminalFailure: inconsistent,
          } as any,
        });
      }

      const planGenTf = decisionState?.systemState?.planGenTerminalFailure;
      if (planGenTf) {
        this.logger.warn(
          `[Claude Orchestrator] PLAN_GEN 空草案终止: code=${planGenTf.code} system_action=${SYSTEM_ORCHESTRATOR_ACTIONS.PLAN_GEN_EMPTY_DRAFT_HALT}`,
        );
        const mustInclude =
          decisionState?.userIntent?.mustIncludePoiIds ??
          (state.trip_plan_request as any)?.must_include_poi_ids ??
          [];
        const days =
          decisionState?.userIntent?.days ??
          (state.trip_plan_request as any)?.days ??
          undefined;

        const vehicleRequiredRaw =
          (decisionState?.environmentState as any)?.routeCorridorWorld?.constraints?.vehicleRequired ??
          (decisionState?.environmentState as any)?.routeCorridorWorld?.constraints?.vehicle_requirement ??
          (state.research_data as any)?.routeCorridorWorld?.constraints?.vehicleRequired ??
          (state.research_data as any)?.route_corridor_world?.constraints?.vehicleRequired;
        const vehicleRequired = typeof vehicleRequiredRaw === 'string' ? vehicleRequiredRaw.toLowerCase() : '';
        const assumedVehicleType =
          typeof (state.trip_plan_request as any)?.constraints?.vehicle_type === 'string'
            ? String((state.trip_plan_request as any).constraints.vehicle_type)
            : '2WD';

        const need4x4 = /4x4|4wd|四驱/.test(vehicleRequired);
        const userIs2wd = /2wd|两驱|2驱|2x4/i.test(assumedVehicleType) || assumedVehicleType === '2WD';

        const labelWithFixTypes = (
          base: string,
          fixed: boolean,
          impact?: string,
          fixedTypes?: string[],
        ): string => {
          const fx =
            fixedTypes && fixedTypes.length > 0
              ? `｜效果: 解决${fixedTypes.map((t) => `【${t}】`).join('')}冲突`
              : '';
          return `${base}（${fixed ? 'high_probability_fixed' : 'needs_more_changes'}）${impact ? `｜Impact: ${impact}` : ''}${fx}`;
        };

        const clone = <T,>(v: T): T => {
          const sc = (globalThis as any).structuredClone as ((x: any) => any) | undefined;
          if (typeof sc === 'function') return sc(v);
          return JSON.parse(JSON.stringify(v)) as T;
        };

        const baseViolations = ((decisionState as any).constraints?.violations ??
          (state.gate_result as any)?.violations ??
          []) as Array<{ type?: string }>;
        const baseVTypes = new Set(baseViolations.map((v) => String(v?.type ?? '')).filter(Boolean));
        const baseCount = baseViolations.length;

        const shadowGate = async (
          patchTrip: (t: any) => any,
        ): Promise<{ fixed: boolean; improved: boolean; fixedTypes: string[]; afterCount: number; afterTypes: string[] }> => {
          if (!this.decisionKernel || !decisionState) {
            return { fixed: false, improved: false, fixedTypes: [], afterCount: baseCount, afterTypes: Array.from(baseVTypes) };
          }
          const shadowDso = clone(decisionState);
          const shadowTrip = patchTrip(clone(state.trip_plan_request ?? { request_id: state.request_id, origin: '', destination: '' }));
          const ctx = {
            requestId: state.request_id,
            routeDirectionId: (request as any).route_direction_id ?? undefined,
            userId: (request as any).user_id,
            tripPlanRequest: shadowTrip,
            researchData: state.research_data,
          };
          const { gateResult } = await this.decisionKernel.executeGateEval(shadowDso as any, ctx as any);
          const vs = (gateResult.violations ?? []) as Array<{ type?: string }>;
          const afterTypes = vs.map((v) => String(v?.type ?? '')).filter(Boolean);
          const afterSet = new Set(afterTypes);
          const fixedTypes = Array.from(baseVTypes).filter((t) => !afterSet.has(t)).map((t) => this.violationTypeToCn(t));
          const afterCount = vs.length;
          const fixed = afterCount === 0;
          const improved = afterCount < baseCount;
          return { fixed, improved, fixedTypes, afterCount, afterTypes };
        };

        const optA = (() => {
          // 空间约束：MustIncludePoi vs TotalTripDuration
          if (!Array.isArray(mustInclude) || mustInclude.length === 0 || typeof days !== 'number' || !Number.isFinite(days)) {
            return undefined;
          }
          const fixed = mustInclude.length <= Math.max(1, Math.floor(days) + 1);
          return {
            value: 'increase_days_by_1',
            label: labelWithFixTypes(
              `将总天数增加 1 天（${days}→${days + 1}）以容纳必去点`,
              fixed,
              `近似将必去点容量上限从 ${Math.max(1, Math.floor(days) + 1)} 提升到 ${Math.max(1, Math.floor(days + 1) + 1)}`,
            ),
          };
        })();

        const optB = (() => {
          if (!Array.isArray(mustInclude) || mustInclude.length === 0) return undefined;
          const fixed = typeof days === 'number' ? mustInclude.length - 1 <= Math.max(1, Math.floor(days)) : true;
          return {
            value: 'drop_one_must_include_poi',
            label: labelWithFixTypes(
              '移除 1 个必去点（最小冲突集近似）',
              fixed,
              `必去点数量从 ${mustInclude.length} 降至 ${Math.max(0, mustInclude.length - 1)}`,
            ),
          };
        })();

        const optC = (() => {
          // 准入约束：F-road vs Vehicle
          if (!need4x4) return undefined;
          const fixed = true; // 升级车辆能力本身即满足该原子冲突（不保证全局可行，但对该冲突是“高概率修复”）
          return {
            value: 'upgrade_vehicle_to_4wd',
            label: labelWithFixTypes(
              '将车辆能力升级为 4WD/4x4（满足 F-road 准入）',
              fixed && userIs2wd,
              vehicleRequiredRaw ? `满足车辆要求：${String(vehicleRequiredRaw)}` : undefined,
            ),
          };
        })();

        const optionsBase = [optC, optA, optB].filter(Boolean) as Array<{ value: string; label: string }>;

        // 真正 Dry-Run：对每个 option 构造 shadow tripPlanRequest，执行 Kernel.executeGateEval 并回填 delta（violation types）
        const dryRunResults = await Promise.all(
          optionsBase.map(async (o) => {
            const r = await shadowGate((t) => {
              const next = { ...t, constraints: { ...(t.constraints ?? {}) } } as any;
              if (o.value === 'upgrade_vehicle_to_4wd') next.constraints.vehicle_type = '4WD';
              if (o.value === 'increase_days_by_1') {
                if (next.date_range?.end_date) {
                  const end = new Date(next.date_range.end_date + 'T00:00:00Z');
                  if (!Number.isNaN(end.getTime())) {
                    const plus = new Date(end);
                    plus.setUTCDate(plus.getUTCDate() + 1);
                    next.date_range = { ...next.date_range, end_date: plus.toISOString().slice(0, 10) };
                  }
                } else if (typeof next.days === 'number' && Number.isFinite(next.days)) {
                  next.days = Math.max(1, Math.floor(next.days) + 1);
                }
              }
              if (o.value === 'drop_one_must_include_poi') {
                const arr = Array.isArray(next.must_include_poi_ids) ? [...next.must_include_poi_ids] : [];
                if (arr.length > 0) arr.pop();
                next.must_include_poi_ids = arr;
              }
              return next;
            });
            const fixed = r.fixed;
            const improved = r.improved;
            const fixedTypes = r.fixedTypes;
            const scoreLabel = fixed
              ? 'high_probability_fixed'
              : improved
                ? `needs_more_changes（improved ${baseCount}→${r.afterCount}）`
                : 'needs_more_changes';
            const enrichedLabel = `${o.label}`.replace(
              /\（(high_probability_fixed|needs_more_changes)\）/,
              `（${scoreLabel}）`,
            ) + (fixedTypes.length ? `｜效果: 解决${fixedTypes.map((t) => `【${t}】`).join('')}冲突` : '');
            return { value: o.value, label: enrichedLabel, fixed };
          }),
        );

        const anyHigh = dryRunResults.some((r) => r.label.includes('high_probability_fixed'));
        const sameAttempts = decisionState?.systemState?.consecutiveSameRelaxationAttempts ?? 0;
        const recommendTermination = sameAttempts >= 2;
        // 约束评分器 + 最小割集分组，用于 PLAN_GEN 空草案的澄清说明。
        const dominant_cid =
          String((decisionState as any)?.constraints?.violations?.[0]?.type ?? '').trim() ||
          (need4x4 ? 'REACHABILITY_HARD' : mustInclude?.length ? 'SCOPE' : 'MIXED');
        const is_hard = need4x4 || String((baseViolations?.[0] as any)?.severity ?? '').toUpperCase() === 'HARD';
        const ewMetaTop = (state.metadata as any)?.early_warning?.historical_precedents?.[0] as any | undefined;

        const scored = dryRunResults.map(({ value, label }) => {
          const id = value as RelaxationActionId;
          const persuasion = this.localCaseStore?.getPersuasionRate({
            signature: SignatureBuilder.buildConversionSignature({
              conflict_type: (need4x4 ? 'REACHABILITY' : mustInclude?.length ? 'SCOPE' : 'MIXED') as any,
              primary_violation_type: dominant_cid,
              region_id: (state.trip_plan_request as any)?.region_id,
              start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
            }),
            action: id,
          });
          const breakdown = ConstraintScorer.calculateScore(id, {
            dominant_cid,
            is_hard,
            oscillation_k: sameAttempts,
            precedent: ewMetaTop,
            preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
            persuasion,
            delta: 1.5,
          });
          return { value: id, label, breakdown };
        });
        scored.sort((a, b) => b.breakdown.score - a.breakdown.score);

        const grouped = groupMinCutPaths({ dominant_cid, is_hard, options: scored });
        const decorate = (prefix: string, o: (typeof scored)[number]) => ({
          value: o.value,
          label: `${prefix}${o.label}${
            o.breakdown.precedent_n > 3 && typeof ewMetaTop?.stats?.historical_late_accept_rate === 'number'
              ? `｜判例: N=${o.breakdown.precedent_n}, ${(ewMetaTop.stats.historical_late_accept_rate * 100).toFixed(0)}% 最终采纳`
              : o.breakdown.precedent_n >= 1
                ? `｜判例: N=${o.breakdown.precedent_n}`
                : ''
          }`,
          metadata: {
            score: o.breakdown.score,
            weights: o.breakdown.weights,
            dominant_cid: o.breakdown.dominant_cid,
            precedent_n: o.breakdown.precedent_n,
            terms: o.breakdown.terms,
            path: prefix.includes('路径 A') ? 'A' : prefix.includes('路径 B') ? 'B' : 'OTHER',
          },
        });

        const options = ([
          ...grouped.pathA.map((o) => decorate('【路径 A·推荐】', o)),
          ...grouped.pathB.map((o) => decorate('【路径 B·可选】', o)),
          ...grouped.other.map((o) => decorate('【可选】', o)),
          {
            value: 'accept_no_solution',
            label: `${recommendTermination ? '【推荐】' : ''}保持所有约束不变（TERMINAL_NO_SOLUTION｜CONSENSUS_REACHED: NO_FEASIBLE_PATH）${
              recommendTermination ? '（已连续多次尝试当前约束，物理冲突仍无法消除）' : ''
            }`,
            metadata: {
              score: ConstraintScorer.calculateScore('accept_no_solution', {
                dominant_cid,
                is_hard,
                oscillation_k: sameAttempts,
                precedent: ewMetaTop,
                preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
              }).score,
              dominant_cid,
              precedent_n: typeof ewMetaTop?.sample_count === 'number' ? ewMetaTop.sample_count : 0,
              path: 'OTHER',
            },
          },
        ] as any);

        state.errors.push({
          step: 'PLAN_GEN',
          error_code: planGenTf.code,
          message: planGenTf.message,
          timestamp: new Date().toISOString(),
        });
        state.clarification_questions = [
          {
            id: 'plan_gen_empty_draft_relax_constraints',
            question: `${
              recommendTermination
                ? `[SYSTEM_ACTION]: 观察到多次尝试未果（连续相同放宽尝试次数=${sameAttempts}）。建议保持当前约束终止规划，或尝试更高强度的组合放宽。\n\n`
                : ''
            }${planGenTf.message} 系统已停止后续验证与行程叙述，以免产生无依据建议。请选择一个“放宽约束”的动作（已做影子预演/近似检查并标注置信度）。`,
            type: anyHigh ? 'single_choice' : 'multi_choice',
            required: true,
            options:
            options.length > 0
                ? options
                : [
                    {
                      value: 'manual_relax_constraints',
                      label: labelWithFixTypes('手动描述你愿意放宽的约束（改期/减少必去点/降低强度）', false),
                    },
                  ],
            hint: planGenTf.detail ? `技术详情：${planGenTf.detail}` : undefined,
          },
        ];
        state.decision_log.push({
          request_id: state.request_id,
          step: 'PLAN_GEN',
          actor: 'Orchestrator',
          inputs_summary: 'PLAN_GEN_EMPTY_DRAFT → clarification options snapshot',
          outputs_summary: `PLAN_GEN_EMPTY_DRAFT_CLARIFICATION: options=${Array.isArray(options) ? options.length : 0}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'PLAN_GEN_EMPTY_DRAFT_CLARIFICATION',
            options_snapshot: options ?? [],
            dominant_cid,
            is_hard,
          },
        });
        state.current_step = 'DONE';
        state.metadata.last_updated_at = new Date().toISOString();
        state.metadata.total_duration_ms = Date.now() - startTime;
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildClarificationResult(state, startTime, decisionState);
      }

      // 步骤 8:优化（OPTIMIZE）- 阶段 2.3：抽取优化提示
      decisionState = await this.executeOptimizeStep(state, decisionState);
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 9: 验证（VERIFY）- 当执行模式为 KERNEL_NATIVE_EXECUTION 时，走 Kernel.executeVerify 路径
      decisionState = await this.executeVerifyPhase(decisionState, state, request, context, llmProvider);
      decisionState = this.syncConfidenceAfterVerify(state, decisionState) ?? decisionState;
      this.maybeSnapshot(state, 'AUTO');

      // FATAL 不可修复：跳过 REPAIR/NARRATE，直接 FAILED
      if (decisionState?.verification?.hasFatal) {
        const msg =
          decisionState.verification.issues.find((i) => i.class === 'FATAL')?.message ??
          'FATAL_VERIFICATION_ISSUE';
        state.current_step = 'FAILED';
        state.errors.push({
          step: 'VERIFY',
          error_code: 'VERIFICATION_FATAL',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildErrorResult(state, new Error(msg), startTime, decisionState);
      }

      // 步骤 10: 修复（REPAIR）- 当执行模式为 KERNEL_NATIVE_EXECUTION 时，走 Kernel.executeRepair 路径（条件执行）
      if (state.gate_result?.gate_result === 'ADJUST_REQUIRED' || state.errors.length > 0) {
        const euBefore = decisionState?.optimizationHints?.expectedUtility;
        decisionState = await this.executeRepairPhase(decisionState, state, request, context, llmProvider) ?? decisionState;
        this.maybeSnapshot(state, 'AUTO');

        // Utility Decay：修复后重新 OPTIMIZE（轻量）并检测 E[U] 连续下降
        if (this.decisionKernel && decisionState) {
          try {
            // 重用 OPTIMIZE 的 fatigue 计算逻辑（与 executeOptimizeStep 一致）
            let fatigue: number | undefined;
            const planDraft = decisionState.tripState?.planDraft as Itinerary | undefined;
            if (planDraft?.days?.length && this.tdfpmCalculator) {
              const contexts = this.itineraryToTdfpmDayContexts(planDraft);
              const scores = contexts.map((c) => this.tdfpmCalculator!.computeFatigueScore(c).fatigueScore);
              const maxScore = Math.max(...scores, 0);
              fatigue = Math.min(1, maxScore / 100);
            }
            const { newState: afterOpt, optimizationHints } = await this.decisionKernel.executeOptimize(decisionState, {
              fatigue,
            });
            decisionState = afterOpt;
            const euAfter = optimizationHints?.expectedUtility;
            const prevEu = euBefore ?? decisionState.systemState?.lastExpectedUtility;
            const prevDeclines = decisionState.systemState?.consecutiveUtilityDeclines ?? 0;
            const decline = typeof prevEu === 'number' && typeof euAfter === 'number' && euAfter < prevEu;
            const nextDeclines = decline ? prevDeclines + 1 : 0;
            decisionState = this.decisionKernel.updateState(decisionState, {
              systemState: {
                requestId: state.request_id,
                lastExpectedUtility: typeof euAfter === 'number' ? euAfter : prevEu,
                consecutiveUtilityDeclines: nextDeclines,
              },
            });

            const maxDeclines = parseInt(process.env.DECISION_REPAIR_UTILITY_DECAY_MAX ?? '2', 10);
            if (maxDeclines > 0 && nextDeclines >= maxDeclines) {
              state.clarification_questions = [
                {
                  id: 'utility_decay_halt_confirmation',
                  question:
                    `自动修复后期望效用已连续 ${nextDeclines} 次下降（E[U] ${String(prevEu)} → ${String(euAfter)}）。是否缩小范围/放宽约束，或由您确认继续？`,
                  type: 'NEED_CONFIRMATION',
                  required: true,
                  options: [
                    { id: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
                    { id: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
                    { id: 'continue_auto_repair', label: '继续自动修复' },
                  ],
                } as any,
              ];
              this.maybeSnapshot(state, 'CHECKPOINT');
              return this.buildClarificationResult(state, startTime, decisionState);
            }
          } catch (e: any) {
            this.logger.debug(`[Claude Orchestrator] Utility decay check skipped: ${e?.message}`);
          }
        }
      }

      // 修复收敛保护：repairCount 超过阈值后转为 NEED_CONFIRMATION（避免 VERIFY↔REPAIR 横跳）
      const repairCount = decisionState?.systemState?.repairCount ?? 0;
      const maxRepairs = parseInt(process.env.DECISION_MAX_REPAIR_COUNT ?? '3', 10);
      if (repairCount >= maxRepairs && maxRepairs > 0) {
        state.clarification_questions = [
          {
            id: 'repair_halt_confirmation',
            question: `系统已自动修复尝试 ${repairCount} 次，仍未收敛。是否需要缩小范围/放宽约束/或由您确认继续自动修复？`,
            type: 'NEED_CONFIRMATION',
            required: true,
            options: [
              { id: 'reduce_scope', label: '缩小范围（减少天数/POI）' },
              { id: 'relax_constraints', label: '放宽约束（节奏/预算/强度）' },
              { id: 'continue_auto_repair', label: '继续自动修复' },
            ],
            hint: '为避免“拆东墙补西墙”的循环，系统需要您的指令。',
          } as any,
        ];
        this.maybeSnapshot(state, 'CHECKPOINT');
        return this.buildClarificationResult(state, startTime, decisionState);
      }

      // 步骤 11: NARRATE - 产出用户可读解释（不得改硬字段）
      this.recordPoiPlanningOutcomeAfterItinerary(state, decisionState);
      await this.executeNarrateStep(request, context, state, llmProvider);
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 11.5: FEEDBACK - 专利反馈学习模块，记录决策日志（异步，不阻塞）
      decisionState = await this.executeFeedbackStep(state, decisionState) ?? decisionState;
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 12: HALLUCINATION_DETECTION - 防幻觉检测
      await this.executeHallucinationDetectionStep(request, context, state);
      this.maybeSnapshot(state, 'AUTO');

      // 步骤 13: DONE
      state.current_step = 'DONE';
      state.metadata.last_updated_at = new Date().toISOString();
      state.metadata.total_duration_ms = Date.now() - startTime;
      this.maybeSnapshot(state, 'CHECKPOINT');

      return this.buildSuccessResult(state, startTime, decisionState);
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] 状态机编排失败: ${error?.message}`, error?.stack);
      
      // 🆕 检查是否是超时错误
      const isTimeout = error?.message?.startsWith('TIMEOUT:') || 
                        error?.code === 'ECONNABORTED' ||
                        (deadline?.remainingMs?.() ?? Number.POSITIVE_INFINITY) <= 0;
      
      if (isTimeout) {
        this.logger.warn(`[Claude Orchestrator] 状态机执行超时，当前步骤: ${state.current_step}, 已执行步骤数: ${state.decision_log.length}`);
        state.current_step = 'TIMEOUT';
        state.errors.push({
          step: state.current_step,
          error_code: 'TIMEOUT',
          message: `执行超时，已执行到步骤: ${state.current_step}`,
          timestamp: new Date().toISOString(),
        });
        
        // 🆕 记录超时时的决策日志
        state.decision_log.push({
          request_id: state.request_id,
          step: 'TIMEOUT' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `状态机执行超时`,
          outputs_summary: `已执行步骤: ${state.decision_log.map(log => log.step).join(' → ')}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - startTime,
            timeout: true,
            executed_steps: state.decision_log.map(log => log.step),
          },
        });
        this.maybeSnapshot(state, 'CHECKPOINT');
      } else {
        state.current_step = 'FAILED';
        state.errors.push({
          step: state.current_step,
          error_code: 'ORCHESTRATION_ERROR',
          message: error?.message || '未知错误',
          timestamp: new Date().toISOString(),
        });
        this.maybeSnapshot(state, 'CHECKPOINT');
      }

      return this.buildErrorResult(state, error, startTime, decisionState);
    }
  }

  /** INTAKE 已标 HARD 缺口并生成澄清问题时，不得进入 RESEARCH（避免关键技能在占位目的地上报错） */
  private shouldReturnClarificationForHardGaps(state: OrchestratorState): boolean {
    const allowPartial = state.metadata?.allow_partial === true;
    if (allowPartial) {
      // 意图编译错误必须始终阻止下游阶段执行（即使设置了 allow_partial 也不例外）。
      const hasCompileError =
        state.gaps?.some((g) => g.severity === 'HARD' && (g.type === 'INTENT_COMPILE_ERROR' || g.type === 'SPEC_TYPE_ERROR')) ??
        false;
      if (
        hasCompileError &&
        state.clarification_questions &&
        state.clarification_questions.length > 0
      ) {
        return true;
      }
      const hasHardDestinationGap =
        state.gaps?.some((g) => g.severity === 'HARD' && g.type === 'MISSING_DESTINATION') ??
        false;
      return !!(
        hasHardDestinationGap &&
        state.clarification_questions &&
        state.clarification_questions.length > 0
      );
    }
    const hasHardGaps = state.gaps?.some((g) => g.severity === 'HARD');
    return !!(
      hasHardGaps &&
      state.clarification_questions &&
      state.clarification_questions.length > 0
    );
  }

  private djb2Fingerprint(value: unknown): string {
    const stable = JSON.stringify(value, (_k, v) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return Object.keys(v as any)
          .sort()
          .reduce((acc: any, key) => {
            acc[key] = (v as any)[key];
            return acc;
          }, {});
      }
      return v;
    });
    let h = 5381;
    for (let i = 0; i < stable.length; i++) h = (h * 33) ^ stable.charCodeAt(i);
    return `djb2:${(h >>> 0).toString(16)}`;
  }

  /**
   * 将 RouteAndRunRequestDto 转换为 TripPlanRequest
   */
  private convertToTripPlanRequest(
    request: RouteAndRunRequestDto,
    _state: OrchestratorState,
  ): TripPlanRequest {
    // 提取目的地（扩展规则匹配）
    let destination: string | { lat: number; lng: number } | undefined;

    const structIn = request.structured_travel_input;
    const structDest =
      typeof structIn?.destination === 'string' ? structIn.destination.trim() : '';
    const structOrigin =
      typeof structIn?.origin === 'string' ? structIn.origin.trim() : '';

    // 国内常见城市（先于国家级关键词，便于「上海美食2天」等短句命中目的地）
    const domesticCityPatterns: Array<{ pattern: RegExp; value: string }> = [
      { pattern: /上海/, value: '上海' },
      { pattern: /北京/, value: '北京' },
      { pattern: /广州/, value: '广州' },
      { pattern: /深圳/, value: '深圳' },
      { pattern: /杭州/, value: '杭州' },
      { pattern: /成都/, value: '成都' },
      { pattern: /重庆/, value: '重庆' },
      { pattern: /西安/, value: '西安' },
      { pattern: /南京/, value: '南京' },
      { pattern: /苏州/, value: '苏州' },
      { pattern: /武汉/, value: '武汉' },
      { pattern: /厦门/, value: '厦门' },
      { pattern: /青岛/, value: '青岛' },
      { pattern: /天津/, value: '天津' },
      { pattern: /香港|hong\s*kong/i, value: '香港' },
      { pattern: /澳门|macau/i, value: '澳门' },
      { pattern: /台北|台湾|taiwan/i, value: '台北' },
      { pattern: /东京|tokyo/i, value: '东京' },
      { pattern: /大阪|osaka/i, value: '大阪' },
      { pattern: /京都|kyoto/i, value: '京都' },
      { pattern: /首尔|seoul/i, value: '首尔' },
    ];
    for (const { pattern, value } of domesticCityPatterns) {
      if (pattern.test(request.message)) {
        destination = value;
        break;
      }
    }

    const destinationPatterns = [
      { pattern: /冰岛|iceland/i, value: '冰岛' },
      { pattern: /尼泊尔|nepal/i, value: '尼泊尔' },
      { pattern: /瑞士|switzerland/i, value: '瑞士' },
      { pattern: /日本|japan/i, value: '日本' },
      { pattern: /韩国|korea|south korea/i, value: '韩国' },
      { pattern: /泰国|thailand/i, value: '泰国' },
      { pattern: /新加坡|singapore/i, value: '新加坡' },
      { pattern: /马来西亚|malaysia/i, value: '马来西亚' },
      { pattern: /印度尼西亚|indonesia/i, value: '印度尼西亚' },
      { pattern: /菲律宾|philippines/i, value: '菲律宾' },
      { pattern: /越南|vietnam/i, value: '越南' },
    ];
    if (!destination) {
      for (const { pattern, value } of destinationPatterns) {
        if (pattern.test(request.message)) {
          destination = value;
          break;
        }
      }
    }

    // 提取日期（改进的规则）
    let start_date: string | undefined;
    let date_range: { start_date: string; end_date: string } | undefined;
    let days: number | undefined;

    // 匹配日期范围（如 "2024-01-01 到 2024-01-07" 或 "2024-01-01 - 2024-01-07"）
    const dateRangeMatch = request.message.match(/(\d{4})-(\d{2})-(\d{2})\s*(?:到|至|-|~)\s*(\d{4})-(\d{2})-(\d{2})/);
    if (dateRangeMatch) {
      const startDateStr = `${dateRangeMatch[1]}-${dateRangeMatch[2]}-${dateRangeMatch[3]}`;
      const endDateStr = `${dateRangeMatch[4]}-${dateRangeMatch[5]}-${dateRangeMatch[6]}`;
      date_range = {
        start_date: startDateStr,
        end_date: endDateStr,
      };
      start_date = startDateStr;
    } else {
      // 匹配单个日期
      const dateMatch = request.message.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        start_date = dateMatch[0];
      }
    }

    // 相对日期兜底（今天/明天/后天）
    if (!start_date) {
      const now = new Date();
      const relativeDays =
        /后天/.test(request.message)
          ? 2
          : /明天/.test(request.message)
            ? 1
            : /今天|今日/.test(request.message)
              ? 0
              : undefined;
      if (relativeDays !== undefined) {
        const d = new Date(now);
        d.setDate(now.getDate() + relativeDays);
        start_date = d.toISOString().slice(0, 10);
      }
    }

    // 提取天数（改进的规则：匹配 "N天"、"N日"、"N晚" 等）
    const daysPatterns = [
      /(\d+)\s*天/,
      /(\d+)\s*日/,
      /(\d+)\s*晚/,
      /(\d+)\s*days?/i,
      /(\d+)\s*nights?/i,
    ];
    for (const pattern of daysPatterns) {
      const daysMatch = request.message.match(pattern);
      if (daysMatch) {
        const extractedDays = parseInt(daysMatch[1], 10);
        if (extractedDays > 0 && extractedDays <= 30) {
          days = extractedDays;
          break;
        }
      }
    }

    // 中文天数兜底（如：一日/两日/三天）
    if (!days) {
      const zhDayPatterns: Array<{ pattern: RegExp; value: number }> = [
        { pattern: /一日|一天/, value: 1 },
        { pattern: /两日|两天|二日|二天/, value: 2 },
        { pattern: /三日|三天/, value: 3 },
        { pattern: /四日|四天/, value: 4 },
        { pattern: /五日|五天/, value: 5 },
        { pattern: /六日|六天/, value: 6 },
        { pattern: /七日|七天/, value: 7 },
      ];
      const matched = zhDayPatterns.find((x) => x.pattern.test(request.message));
      if (matched) {
        days = matched.value;
      }
    }

    // 如果没有提取到天数，但有日期范围，计算天数
    if (!days && date_range) {
      const start = new Date(date_range.start_date);
      const end = new Date(date_range.end_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 0 && diffDays <= 30) {
        days = diffDays;
      }
    }

    // 提取人数（简单规则）
    let partyCount = 1;
    const countPatterns = [
      /(\d+)\s*人/,
      /(\d+)\s*位/,
      /(\d+)\s*个/,
      /(\d+)\s*persons?/i,
      /(\d+)\s*people/i,
    ];
    for (const pattern of countPatterns) {
      const countMatch = request.message.match(pattern);
      if (countMatch) {
        const extractedCount = parseInt(countMatch[1], 10);
        if (extractedCount > 0 && extractedCount <= 20) {
          partyCount = extractedCount;
          break;
        }
      }
    }

    // 提取交通模式（如果有明确指定）
    let mode: 'walk' | 'drive' | 'transit' | 'mixed' = 'mixed';
    if (/步行|走路|walk/i.test(request.message)) {
      mode = 'walk';
    } else if (/开车|自驾|drive|car/i.test(request.message)) {
      mode = 'drive';
    } else if (/公交|地铁|transit|public transport/i.test(request.message)) {
      mode = 'transit';
    }

    // 提取车辆类型（用于准入类约束与 INTAKE predictive simulation）
    const vehicle_type: '2WD' | '4WD' | undefined = /4wd|4x4|四驱|四驱车/i.test(request.message)
      ? '4WD'
      : /2wd|两驱/i.test(request.message)
        ? '2WD'
        : undefined;

    // 未命中关键词表时：从「在X的…行程」抽取 X（覆盖 Reykjavik、雷克雅未克市区等）
    if (
      !destination ||
      (typeof destination === 'string' && (destination === '未指定' || !destination.trim()))
    ) {
      const geo = request.message.match(/在\s*([^，。！？\n]{1,60}?)\s*的/);
      if (geo) {
        const raw = geo[1].trim().replace(/\s+/g, ' ');
        if (
          raw.length >= 2 &&
          raw.length <= 56 &&
          !/^(这里|那里|这边|那边|本地)$/u.test(raw)
        ) {
          destination = raw;
        }
      }
    }

    // 结构化输入最后覆盖 NL，保证澄清回合显式目的地生效
    if (structDest.length >= 2) {
      destination = structDest;
    }

    return {
      request_id: request.request_id,
      // Carry raw NL message forward for deterministic intake compile & predictive simulation.
      // This is intentionally duplicated from the API request and treated as non-authoritative hint.
      message: request.message,
      origin: structOrigin.length >= 1 ? structOrigin : '起点', // 默认值，实际应该从 message 或上下文提取
      destination: destination || '未指定',
      date_range,
      start_date,
      days,
      mode,
      party: {
        count: partyCount,
      },
      ...(vehicle_type ? { constraints: { vehicle_type } } : {}),
    };
  }

  /**
   * INTAKE 步骤：解析请求 & 缺口识别
   * P3 B: 优先经 Kernel.executeIntake（IntakeExecutor 封装 PlannerAgent），否则降级到直接调用
   */
  private async executeIntakeStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'INTAKE';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 INTAKE 步骤...`);

    try {
      let tripPlanRequest = this.convertToTripPlanRequest(request, state);

      // Constraint Zone (Temporal hard deadlines): make them explicitly visible to downstream LLM/planning skills.
      // We keep it as a high-weight system hint embedded in TripPlanRequest.message (best-effort, backwards compatible).
      const hardDeadlines = (request as any)?.emergency_constraints?.hard_deadlines as Record<string, string> | undefined;
      if (hardDeadlines && typeof hardDeadlines === 'object' && Object.keys(hardDeadlines).length > 0) {
        const lines = Object.entries(hardDeadlines)
          .slice(0, 10)
          .map(([k, v]) => `- ${String(k)} 截止于 ${String(v)}`);
        const sysHint =
          `[SYSTEM_MESSAGE][CONSTRAINT_ZONE][TEMPORAL_DEADLINE]\n` +
          `注意：以下 POI/Segment 受到物理环境限制（如日落），必须在指定时间前结束。\n` +
          `${lines.join('\n')}\n` +
          `如果当前计划冲突，请优先尝试调换行程顺序（例如将上午的室内活动挪至傍晚，或将高风险户外活动提前）。\n`;
        tripPlanRequest.message = `${sysHint}\n${tripPlanRequest.message ?? request.message ?? ''}`.trim();
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Orchestrator',
          inputs_summary: 'emergency_constraints.hard_deadlines → Constraint Zone system hint',
          outputs_summary: `TEMPORAL_DEADLINES=${Object.keys(hardDeadlines).length}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'CONSTRAINT_ZONE_TEMPORAL_DEADLINE',
            hard_deadlines: hardDeadlines,
          },
        });
      }

      // 闭环：消费澄清回合答案 → 组合放宽补丁 / 或用户批准终止
      const clarificationAnswers = (request as any).clarification_answers as any[] | undefined;
      if (this.clarificationHandler && Array.isArray(clarificationAnswers) && clarificationAnswers.length > 0) {
        const { tripPlanRequest: patched, applied, terminalIntent, fingerprint, earlyWarningProceedAtOwnRisk, didPatch } =
          this.clarificationHandler.applyRelaxationsFromAnswers(tripPlanRequest, clarificationAnswers);
        // 防御性：记录 fingerprint 与重试次数到 DSO.systemState（用于识别无效重复尝试）
        if (this.decisionKernel && (state as any).decisionState) {
          // no-op: decisionState 不在 state 上；留给 STATE_UPDATE 后统一写入
        }
        if (terminalIntent) {
          state.metadata = {
            ...(state.metadata ?? {}),
            terminal_intent: terminalIntent,
            last_relaxation_fingerprint: fingerprint,
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → TerminalIntent',
            outputs_summary: 'CONSENSUS_REACHED: NO_FEASIBLE_PATH',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CONSENSUS_REACHED_NO_FEASIBLE_PATH',
              terminal_intent: terminalIntent,
              fingerprint,
            },
          });
        } else if (applied.length > 0 || didPatch) {
          tripPlanRequest = patched;
          state.metadata = {
            ...(state.metadata ?? {}),
            applied_relaxations: applied,
            last_relaxation_fingerprint: fingerprint,
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → CompositeRelaxationPatch',
            outputs_summary: `RELAXATION_APPLIED: ${applied.map((a) => a.id).join('+')}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'RELAXATION_APPLIED',
              applied_relaxations: applied,
              fingerprint,
            },
          });
        }

        if (earlyWarningProceedAtOwnRisk) {
          const ew = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
          // 此时我们可能还没有 VERIFY 报告；保持绑定的稳定性和轻量级。
          const evidence = collectDecisionEvidenceSummaries(undefined);
          const fp = computeDecisionEvidenceFingerprint(evidence);
          state.metadata = {
            ...(state.metadata ?? {}),
            early_warning_acknowledged: true,
            early_warning_proceed_at: new Date().toISOString(),
            ...(fingerprint ? { last_relaxation_fingerprint: fingerprint } : {}),
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → EARLY_WARNING_PROCEED_AT_OWN_RISK',
            outputs_summary: 'USER_PROCEEDED_AT_OWN_RISK: no TripPlanRequest patch; downstream POI/PLAN_GEN allowed',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'EARLY_WARNING_PROCEED_AT_OWN_RISK',
              early_warning_id: ew?.early_warning_id,
              event: 'PROCEED_AT_OWN_RISK',
              evidence_fingerprint: fp.evidence_fingerprint,
              acknowledged_violations: fp.acknowledged_violations,
              max_violation_slack: fp.max_violation_slack,
            },
          });
        }

        // 行为分析：记录用户在澄清问题上的“选择/拒绝”（用于 EARLY_WARNING → PLAN_GEN 的认知差语料）
        const ewAnswer = clarificationAnswers.find((a) => a?.questionId === 'early_warning_relaxations');
        const pgAnswer = clarificationAnswers.find((a) => a?.questionId === 'plan_gen_empty_draft_relax_constraints');

        const normalizePicked = (v: any): string[] => {
          if (Array.isArray(v)) return v.map(String).filter(Boolean);
          if (typeof v === 'string') return [v].filter(Boolean);
          return [];
        };

        if (ewAnswer) {
          const ew = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
          const suggested = Array.isArray(ew?.suggested_actions)
            ? ew!.suggested_actions.map((s) => String(s?.relaxation_type ?? '')).filter(Boolean)
            : [];
          const chosen = normalizePicked(ewAnswer.value);
          const rejected = suggested.filter((x) => !chosen.includes(x));
          const proceed = chosen.includes('proceed_at_own_risk');
          const evidence = proceed ? collectDecisionEvidenceSummaries(undefined) : [];
          const fp = proceed ? computeDecisionEvidenceFingerprint(evidence) : undefined;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → EARLY_WARNING_USER_CHOICE',
            outputs_summary: `EARLY_WARNING_USER_CHOICE: chosen=${chosen.join(',') || '∅'} rejected=${rejected.join(',') || '∅'}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'EARLY_WARNING_USER_CHOICE',
              early_warning_id: ew?.early_warning_id,
              suggested_actions: suggested,
              chosen_actions: chosen,
              rejected_actions: rejected,
              ...(proceed && fp
                ? {
                    event: 'PROCEED_AT_OWN_RISK',
                    evidence_fingerprint: fp.evidence_fingerprint,
                    acknowledged_violations: fp.acknowledged_violations,
                    max_violation_slack: fp.max_violation_slack,
                  }
                : {}),
            },
          });

          // Conversion Learning: CLARIFICATION_FEEDBACK — bind the choice to the option snapshot at presentation time.
          const snap = (state.decision_log ?? [])
            .slice()
            .reverse()
            .find((e) => e?.metadata?.system_action === 'EARLY_WARNING_INTERCEPT')?.metadata?.options_snapshot as any[] | undefined;
          const top = Array.isArray(snap)
            ? snap
                .filter((o) => o && typeof o === 'object' && typeof (o as any).metadata?.score === 'number')
                .sort((a, b) => ((b as any).metadata.score as number) - ((a as any).metadata.score as number))[0]
            : undefined;
          const topValue = top ? String((top as any).value ?? '') : '';
          const reward = proceed ? -1 : topValue && chosen.includes(topValue) ? 1 : 0;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → CLARIFICATION_FEEDBACK (EARLY_WARNING)',
            outputs_summary: `CLARIFICATION_FEEDBACK: q=early_warning_relaxations reward=${reward}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CLARIFICATION_FEEDBACK',
              questionId: 'early_warning_relaxations',
              early_warning_id: ew?.early_warning_id,
              dominant_cid: (top as any)?.metadata?.dominant_cid ?? (ew as any)?.conflict_type,
              fingerprint: (state.metadata as any)?.last_relaxation_fingerprint,
              oscillation_k: 0,
              options_snapshot: Array.isArray(snap) ? snap : [],
              chosen_actions: chosen,
              top_scored_value: topValue || undefined,
              reward,
            },
          });

          // 回灌到 CaseStore：记录 shown/chosen_top/proceeded/rejected（best-effort，不阻塞）
          if (this.localCaseStore && Array.isArray(snap)) {
            const sig = SignatureBuilder.buildConversionSignature({
              conflict_type: ((ew as any)?.conflict_type ?? 'MIXED') as any,
              primary_violation_type: (top as any)?.metadata?.dominant_cid,
              region_id: (state.trip_plan_request as any)?.region_id,
              start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
            }) as any;
            Promise.resolve()
              .then(() => {
                for (const o of snap) {
                  const v = String((o as any)?.value ?? '');
                  if (!v) continue;
                  this.localCaseStore!.recordConversion({ signature: sig, action: v as any, kind: 'shown' });
                }
                if (proceed) this.localCaseStore!.recordConversion({ signature: sig, action: 'proceed_at_own_risk', kind: 'proceeded' });
                if (topValue && chosen.includes(topValue)) this.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'chosen_top' });
                // targeted rejection: only count top-scored action rejected when user didn't pick it.
                if (topValue && !chosen.includes(topValue)) {
                  this.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'rejected' });
                }
              })
              .catch(() => undefined);
          }
        }

        if (pgAnswer) {
          const chosen = normalizePicked(pgAnswer.value);
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → PLAN_GEN_USER_CHOICE',
            outputs_summary: `PLAN_GEN_USER_CHOICE: chosen=${chosen.join(',') || '∅'}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'PLAN_GEN_USER_CHOICE',
              chosen_actions: chosen,
            },
          });

          const snap = (state.decision_log ?? [])
            .slice()
            .reverse()
            .find((e) => e?.metadata?.system_action === 'PLAN_GEN_EMPTY_DRAFT_CLARIFICATION')?.metadata?.options_snapshot as any[] | undefined;
          const top = Array.isArray(snap)
            ? snap
                .filter((o) => o && typeof o === 'object' && typeof (o as any).metadata?.score === 'number')
                .sort((a, b) => ((b as any).metadata.score as number) - ((a as any).metadata.score as number))[0]
            : undefined;
          const topValue = top ? String((top as any).value ?? '') : '';
          const reward = chosen.includes('accept_no_solution') ? -1 : topValue && chosen.includes(topValue) ? 1 : 0;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → CLARIFICATION_FEEDBACK (PLAN_GEN)',
            outputs_summary: `CLARIFICATION_FEEDBACK: q=plan_gen_empty_draft_relax_constraints reward=${reward}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CLARIFICATION_FEEDBACK',
              questionId: 'plan_gen_empty_draft_relax_constraints',
              dominant_cid: (top as any)?.metadata?.dominant_cid,
              fingerprint: (state.metadata as any)?.last_relaxation_fingerprint,
              oscillation_k: 0,
              options_snapshot: Array.isArray(snap) ? snap : [],
              chosen_actions: chosen,
              top_scored_value: topValue || undefined,
              reward,
            },
          });

          if (this.localCaseStore && Array.isArray(snap)) {
            const sig = SignatureBuilder.buildConversionSignature({
              conflict_type: 'MIXED',
              primary_violation_type: (top as any)?.metadata?.dominant_cid,
              region_id: (state.trip_plan_request as any)?.region_id,
              start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
            }) as any;
            Promise.resolve()
              .then(() => {
                for (const o of snap) {
                  const v = String((o as any)?.value ?? '');
                  if (!v) continue;
                  this.localCaseStore!.recordConversion({ signature: sig, action: v as any, kind: 'shown' });
                }
                if (topValue && chosen.includes(topValue)) this.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'chosen_top' });
                if (topValue && !chosen.includes(topValue)) {
                  this.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'rejected' });
                }
              })
              .catch(() => undefined);
          }
        }
      }

      state.trip_plan_request = tripPlanRequest;
      state.metadata.intake_user_message = request.message;

      if (this.decisionKernel) {
        const intakeCtx: import('../../decision/kernel/interfaces/phase-executor.interface').IntakeExecutorContext = {
          requestId: state.request_id,
          userId: request.user_id,
          tripPlanRequest: tripPlanRequest as any,
          orchestratorState: state,
        };
        const dso = this.decisionKernel.createInitialState(state.request_id, {
          evaluationRunId: request.meta?.run_id,
        });
        const result = await this.decisionKernel.executeIntake(dso, intakeCtx);

        state.gaps = result.gaps as OrchestratorState['gaps'];
        state.clarification_questions = result.clarificationQuestions as any;
        if ((result as any).simulation) {
          (state.metadata as any) = { ...(state.metadata ?? {}), intake_simulation: (result as any).simulation };
        }
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Planner',
          inputs_summary: `用户请求: ${request.message.substring(0, 100)}...`,
          outputs_summary: `意图: ${result.intent ?? 'PLAN_TRIP'}, 缺口数量: ${result.gaps.length}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            gaps: result.gaps,
            candidate_structure: result.candidate_structure,
            clarification_questions_count: result.clarificationQuestions?.length || 0,
          },
        });
      } else {
        // P3 D.1: 降级路径统一为 util 规则识别，不再直接调用 plannerAgent
        const gaps = identifyGapsFromRequest(tripPlanRequest);
        state.gaps = gaps as OrchestratorState['gaps'];
        const hardGaps = gaps.filter((g) => g.severity === 'HARD');
        if (hardGaps.length > 0) {
          state.clarification_questions = generateClarificationQuestions(hardGaps, tripPlanRequest);
        }
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Orchestrator',
          inputs_summary: `用户请求: ${request.message.substring(0, 100)}...`,
          outputs_summary: `意图: PLAN_TRIP（规则识别）, 缺口数量: ${gaps.length}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            gaps,
            clarification_questions_count: state.clarification_questions?.length || 0,
          },
        });
      }

      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'INTAKE', 'Planner');
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] INTAKE 步骤失败: ${error?.message}`);
      throw error;
    }
  }

  /**
   * VERIFY 后同步 confidence 到 DSO
   * 基于验证问题数、errors 计算 [0,1]
   */
  private syncConfidenceAfterVerify(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): DecisionState | undefined {
    if (!this.decisionKernel || !decisionState) return decisionState;
    const verifyErrors = state.errors.filter((e) => e.step === 'VERIFY');
    const hasVerificationIssues = state.decision_log.some(
      (e) => e.step === 'VERIFY' && e.outputs_summary?.includes('个问题'),
    );
    let confidence = 0.9;
    if (verifyErrors.length > 0) confidence -= 0.2 * verifyErrors.length;
    if (hasVerificationIssues) confidence -= 0.1;
    return this.decisionKernel.setConfidence(decisionState, Math.max(0.1, confidence));
  }

  /**
   * RESEARCH 阶段：KERNEL_NATIVE_EXECUTION 时走 Kernel.executeResearch，否则走 callback
   */
  private async executeResearchPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    if (
      this.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) &&
      this.decisionKernel &&
      decisionState &&
      state.trip_plan_request
    ) {
      const stepStartTime = Date.now();
      const ctx = {
        requestId: state.request_id,
        routeDirectionId: request.route_direction_id ?? undefined,
        userId: request.user_id,
        tripPlanRequest: state.trip_plan_request,
      };
      const { newState, researchData } = await this.decisionKernel.executeResearch(decisionState, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      state.research_data = researchData;
      state.current_step = 'RESEARCH';
      state.decision_log.push({
        request_id: state.request_id,
        step: 'RESEARCH',
        actor: 'Orchestrator',
        inputs_summary: 'Kernel 原生 RESEARCH',
        outputs_summary: `收集了 ${Object.keys(researchData).length} 类数据`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime, data_types: Object.keys(researchData) },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'RESEARCH', 'LocalInsight');
      return newState;
    }
    return this.executePhaseViaKernel(decisionState, state, 'RESEARCH', () =>
      this.executeResearchStep(request, context, state, llmProvider, decisionState),
    );
  }

  /**
   * RESEARCH 产出的 POI 列表上应用 DSO.poiPlanning：先按 slug 匹配已有 POI，再排除，最后必要时 fallback 占位（冰岛）
   */
  private applyPoiPlanningToResearchPois(
    pois: any[],
    decisionState: DecisionState | undefined,
    destinationCountry: string | undefined,
  ): { pois: any[]; excludedFilteredCount: number } {
    const slice = decisionState?.poiPlanning;
    if (!slice?.poiPlan || destinationCountry !== 'IS') {
      return { pois, excludedFilteredCount: 0 };
    }
    let out = [...pois];
    let excludedFilteredCount = 0;
    for (const slug of slice.poiPlan.excludedPoiIds ?? []) {
      const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
      if (!kws?.length) continue;
      out = out.filter((p) => {
        const n = `${p?.name ?? ''} ${p?.nameCN ?? ''}`.toLowerCase();
        const drop = kws.some((k) => n.includes(k.toLowerCase()));
        if (drop) excludedFilteredCount++;
        return !drop;
      });
    }
    const matchedSlugs = new Set<string>();
    const usedPoiKeys = new Set<string>();
    const regionId = slice.routeIntent?.regionId;
    for (const slug of slice.poiPlan.requiredAnchorPoiIds ?? []) {
      const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
      if (!kws?.length) continue;
      const pool = out.filter((p) => {
        const k = poiPlanningRowIdentityKey(p);
        return k && !usedPoiKeys.has(k);
      });
      let found: any =
        pool.find(
          (p) =>
            researchPoiHasStableId(p) &&
            regionId === 'golden_circle' &&
            goldenCircleEntityStrongMatch(p, slug),
        ) ?? pool.find((p) => keywordMatchResearchPoiToSlug(p, slug));
      if (found) {
        const isRetrieved =
          researchPoiHasStableId(found) &&
          regionId === 'golden_circle' &&
          goldenCircleEntityStrongMatch(found, slug);
        found.poi_planning_anchor_slug = slug;
        found.poi_planning_anchor_source = isRetrieved ? 'retrieved' : 'matched_existing';
        found.source = found.source ?? 'poi_planning_matched_existing';
        found.poi_planning_admission_protected = true;
        found.poi_planning_score_reasons = [
          ...(found.poi_planning_score_reasons ?? []),
          POI_PLANNING_SCORE_REASON.ANCHOR_MATCHED_EXISTING,
          POI_PLANNING_SCORE_REASON.REQUIRED_ANCHOR,
        ];
        matchedSlugs.add(slug);
        const pk = poiPlanningRowIdentityKey(found);
        if (pk) usedPoiKeys.add(pk);
      }
    }
    const signatures = new Set(
      out.map((p) => `${p?.name ?? ''} ${p?.nameCN ?? ''}`.toLowerCase()),
    );
    for (const slug of slice.poiPlan.requiredAnchorPoiIds ?? []) {
      if (matchedSlugs.has(slug)) continue;
      const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
      if (!kws?.length) continue;
      const primary = kws[0];
      const stub = {
        name: primary,
        nameCN: primary,
        category: 'ATTRACTION',
        poi_planning_anchor_slug: slug,
        source: 'poi_planning_fallback',
        poi_planning_anchor_source: 'fallback',
        poi_planning_admission_protected: true,
        poi_planning_score_reasons: [
          POI_PLANNING_SCORE_REASON.ANCHOR_FALLBACK_PLACEHOLDER,
          POI_PLANNING_SCORE_REASON.REQUIRED_ANCHOR,
        ],
      };
      out.unshift(stub);
      signatures.add(primary.toLowerCase());
    }
    return { pois: out, excludedFilteredCount };
  }

  /** Phase 2.6：enforce 阶段与 merge 占位符同形，保证 passesHardPoiGuards（IS） */
  private buildPoiPlanningAnchorFallbackStub(slug: string): Record<string, unknown> {
    const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
    const primary = kws?.[0] ?? slug;
    return {
      name: primary,
      nameCN: primary,
      category: 'ATTRACTION',
      poi_planning_anchor_slug: slug,
      source: 'poi_planning_fallback',
      poi_planning_anchor_source: 'fallback',
      poi_planning_admission_protected: true,
      poi_planning_score_reasons: [
        POI_PLANNING_SCORE_REASON.ANCHOR_FALLBACK_PLACEHOLDER,
        POI_PLANNING_SCORE_REASON.REQUIRED_ANCHOR,
      ],
    };
  }

  /**
   * POI_SELECTION：对 RESEARCH 产出的 POI 筛选排序；消费 DSO.poiPlanning 与 score_reason。
   */
  private async executePoiSelectionStep(
    state: OrchestratorState,
    decisionState?: DecisionState,
  ): Promise<{ needsClarification: boolean; allowWithFallback: boolean }> {
    const stepStartTime = Date.now();
    state.current_step = 'POI_SELECTION';

    const rawPoiEvidence = state.research_data?.poi_evidence;
    const asArray = Array.isArray(rawPoiEvidence)
      ? rawPoiEvidence
      : Array.isArray((rawPoiEvidence as any)?.pois)
        ? (rawPoiEvidence as any).pois
        : [];

    const destinationRaw =
      typeof state.trip_plan_request?.destination === 'string'
        ? state.trip_plan_request.destination
        : '';
    const poiPolicy = this.resolvePoiPolicy(
      state.metadata?.poi_policy,
      state.metadata?.require_poi_data === true,
    );
    const requirePoiData = poiPolicy === 'strict';
    const destinationCountry = this.inferCountryFromDestination(destinationRaw);
    const destinationCity = this.normalizeText(destinationRaw);

    const deduped = this.dedupePois(asArray);
    const planningAug = this.applyPoiPlanningToResearchPois(
      deduped,
      decisionState,
      destinationCountry,
    );
    const withPlanning = planningAug.pois;
    if (planningAug.excludedFilteredCount > 0) {
      (state.metadata as Record<string, unknown>).poiPlanningExcludedFilteredCount =
        planningAug.excludedFilteredCount;
    }
    const sliceMeta = decisionState?.poiPlanning;
    if (sliceMeta?.budgetGateApplied) {
      (state.metadata as Record<string, unknown>).poiPlanningBudgetGateApplied = true;
      (state.metadata as Record<string, unknown>).poiPlanningFeasibility =
        sliceMeta.schedulePlan?.feasibility;
      (state.metadata as Record<string, unknown>).poiPlanningEnrichmentDisabled = true;
    }
    const poiPlanSlice = decisionState?.poiPlanning;
    const scoredRows = withPlanning
      .filter((poi: any) =>
        this.passesHardPoiGuards(poi, destinationCountry, destinationRaw),
      )
      .map((poi: any, idx: number) => {
        const riskLevel = poi?.metadata?.risk_level;
        const riskPenalty =
          riskLevel === 'HIGH' ? 2 : riskLevel === 'MEDIUM' ? 1 : 0;
        const hasOpeningHours = !!poi?.opening_hours;
        const openingHoursBonus = hasOpeningHours ? 1 : 0;
        const localityScore = this.poiLocalityScore(
          poi,
          destinationCountry,
          destinationCity,
        );
        const dataCompletenessBonus =
          poi?.address && poi?.name ? 0.5 : 0;
        let optionalBoost = 0;
        if (
          !poiPlanSlice?.budgetGateApplied &&
          poiPlanSlice?.poiPlan?.optionalCandidatePoiIds?.length &&
          destinationCountry === 'IS'
        ) {
          const hay = `${poi?.name ?? ''} ${poi?.nameCN ?? poi?.name ?? ''}`;
          for (const slug of poiPlanSlice.poiPlan.optionalCandidatePoiIds) {
            const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
            if (!kws?.length) continue;
            if (
              kws.some(
                (k) =>
                  hay.includes(k) ||
                  hay.toLowerCase().includes(k.toLowerCase()),
              )
            ) {
              optionalBoost = 2;
              poi.poi_planning_score_reasons = [
                ...(poi.poi_planning_score_reasons ?? []),
                POI_PLANNING_SCORE_REASON.OPTIONAL_BOOST,
              ];
              break;
            }
          }
        }
        const anchorBoost = poi?.poi_planning_anchor_slug ? 3 : 0;
        return {
          poi,
          idx,
          localityScore,
          openingHoursBonus,
          dataCompletenessBonus,
          riskPenalty,
          score:
            localityScore +
            openingHoursBonus +
            dataCompletenessBonus +
            optionalBoost +
            anchorBoost -
            riskPenalty -
            idx * 0.01,
        };
      })
      .sort((a, b) => b.score - a.score);
    const startCoordinates = this.tryExtractStartCoordinates(
      state.trip_plan_request?.origin,
    );
    const rankedPois = scoredRows.map((x) => x.poi);
    const requiredAnchors = poiPlanSlice?.poiPlan?.requiredAnchorPoiIds ?? [];
    const topNLimit = 8;
    let scored = this.selectClusteredPois(
      rankedPois,
      topNLimit,
      startCoordinates,
      destinationRaw,
    );
    /** Phase 2.6：最后一跳强制锚点进入 TopN（候选来自 rankedPois；与聚类解耦） */
    if (destinationCountry === 'IS' && requiredAnchors.length > 0) {
      const beforeLen = scored.length;
      scored = enforceRequiredAnchorsTopN(
        scored,
        rankedPois,
        requiredAnchors,
        topNLimit,
        {
          createFallbackForSlug: (slug) =>
            this.buildPoiPlanningAnchorFallbackStub(slug),
        },
      );
      this.logger.debug(
        `[POI_PLANNING_ADMISSION] required=${JSON.stringify(requiredAnchors)} clustered_len=${beforeLen} final_len=${scored.length}`,
      );
    }

    const admissionDiag: PoiPlanningAdmissionDiagnosticsInput | undefined =
      buildPoiPlanningAdmissionDiagnostics(
        decisionState?.poiPlanning,
        withPlanning,
        rankedPois,
        scored,
      ) ?? undefined;

    this.recordPoiPlanningOutcomeAfterSelection(state, decisionState, scored, admissionDiag);

    if (state.metadata?.show_poi_trace) {
      const selectedForTrace = scored
        .slice(0, 4)
        .map((x) => this.toPoiTraceNode(x));
      const metaObs = state.metadata as Record<string, unknown>;
      state.metadata.poi_trace = {
        ...(state.metadata.poi_trace || {}),
        policy: poiPolicy,
        sourceHint: state.metadata?.poi_source_hint,
        inputCount: asArray.length,
        selectedCount: scored.length,
        selected_region: destinationRaw || undefined,
        destination_country: destinationCountry,
        recall_raw_research: asArray.length,
        recall_after_route_augment: asArray.length,
        after_dedupe: deduped.length,
        after_hard_guards: scoredRows.length,
        selected_after_rank: scored.length,
        country_filter_applied: Boolean(destinationCountry),
        /** Phase 1.6：固定可观测块（与 docs/POI_REGION_INTENT_EVAL.md 对齐） */
        poi_planning_trace: decisionState?.poiPlanning
          ? {
              regionId: decisionState.poiPlanning.routeIntent?.regionId,
              resolution: decisionState.poiPlanning.resolution,
              feasibility: decisionState.poiPlanning.schedulePlan?.feasibility,
              budgetGateApplied: decisionState.poiPlanning.budgetGateApplied,
              appliedBackoffSteps: decisionState.poiPlanning.appliedBackoffSteps,
              narrationHint: decisionState.poiPlanning.narrationHint,
            }
          : undefined,
        poiPlanningExcludedFilteredCount: metaObs.poiPlanningExcludedFilteredCount,
        poiPlanningEnrichmentDisabled: metaObs.poiPlanningEnrichmentDisabled,
        score_reasons_top: scoredRows.slice(0, 8).map((x: any) => ({
          rank: x.idx + 1,
          reasons: x.poi?.poi_planning_score_reasons ?? [],
        })),
        debug_scores: scoredRows.slice(0, 12).map((x: any) => ({
          slot: `RANK_${x.idx + 1}`,
          desiredType: String(x.poi?.category ?? x.poi?.type ?? 'poi'),
          poiName: String(x.poi?.name ?? ''),
          typeScore: 0,
          timeScore: x.openingHoursBonus,
          ratingScore: 0,
          affordabilityScore: x.dataCompletenessBonus,
          nameHintScore: 0,
          commuteDistanceKm: undefined,
          commuteMinutes: undefined,
          commutePenalty: x.riskPenalty,
          timeWindowPenalty: 0,
          totalScore: Number((x.score ?? 0).toFixed(2)),
          score_reasons: x.poi?.poi_planning_score_reasons ?? [],
        })),
        commute_matrix:
          state.metadata?.show_commute_matrix === true
            ? this.buildPoiTraceCommuteMatrix(
                selectedForTrace,
                state.trip_plan_request?.mode as any,
                startCoordinates,
              )
            : undefined,
      };
    }

    const commuteBudgetMinutes = 240;
    const estimatedCommuteMinutes = this.estimateNearestTotalCommuteMinutes(
      scored.map((x) => this.toPoiTraceNode(x)),
      state.trip_plan_request?.mode as any,
      startCoordinates,
    );
    if (estimatedCommuteMinutes > commuteBudgetMinutes) {
      const destinationExample = destinationRaw || '雷克雅未克';
      state.gaps = [
        ...(state.gaps || []),
        {
          type: 'MISSING_DESTINATION',
          severity: 'HARD',
          detail: `估算单日通勤约 ${estimatedCommuteMinutes} 分钟，超过预算 ${commuteBudgetMinutes} 分钟，请补充更具体的城市/区域（例如：${destinationExample} 市区）`,
        } as any,
      ];
      state.clarification_questions = [
        {
          id: 'destination_scope_refine',
          question:
            '当前目的地范围过大，单日通勤过长。请选择更聚焦的区域继续规划：',
          type: 'single_choice',
          options: [
            `${destinationExample} 市区`,
            `${destinationExample} 南部`,
            `${destinationExample} 西部`,
            '我来手动输入具体城市/区域',
          ],
          required: true,
        } as any,
      ];
      if (state.metadata?.show_poi_trace) {
        state.metadata.poi_trace = {
          ...(state.metadata.poi_trace || {}),
          commute_budget_minutes: commuteBudgetMinutes,
          estimated_commute_minutes: estimatedCommuteMinutes,
          over_budget: true,
        };
      }
      return {
        needsClarification: true,
        allowWithFallback: false,
      };
    }

    const minPoiRequired = 2;
    if (scored.length > 0 && scored.length < minPoiRequired) {
      const destinationExample = destinationRaw || '雷克雅未克';
      state.gaps = [
        ...(state.gaps || []),
        {
          type: 'MISSING_DESTINATION',
          severity: 'HARD',
          detail: `当前可执行 POI 仅 ${scored.length} 个（至少需要 ${minPoiRequired} 个），请补充更具体的城市/区域（例如：${destinationExample} 市区）`,
        } as any,
      ];
      state.clarification_questions = [
        {
          id: 'destination_scope_too_sparse',
          question:
            '当前目的地范围过大或过散，候选点不足以生成可执行单日行程。请选择更聚焦区域：',
          type: 'single_choice',
          options: [
            `${destinationExample} 市区`,
            `${destinationExample} 近郊`,
            `${destinationExample} 南部`,
            '我来手动输入具体城市/区域',
          ],
          required: true,
        } as any,
      ];
      if (state.metadata?.show_poi_trace) {
        state.metadata.poi_trace = {
          ...(state.metadata.poi_trace || {}),
          min_poi_required: minPoiRequired,
          selected_too_sparse: true,
        };
      }
      return {
        needsClarification: true,
        allowWithFallback: false,
      };
    }

    if (destinationCountry && scored.length === 0) {
      const destinationExample = destinationRaw ? `${destinationRaw} ${this.countryDisplayName(destinationCountry)}` : 'Tokyo, Japan';
      const fallbackDecision = {
        verdict: 'ALLOW_WITH_FALLBACK',
        reason: 'NO_POI_DATA',
      };
      state.gaps = [
        ...(state.gaps || []),
        {
          type: 'MISSING_DESTINATION',
          severity: 'HARD',
          detail: `未找到与目的地国家(${destinationCountry})一致的 POI，请明确国家/城市（例如：${destinationExample}）`,
        } as any,
      ];
      state.clarification_questions = [
        this.buildPoiCountryClarificationQuestion(destinationRaw, destinationCountry) as any,
      ];
      state.metadata.fallback_decision = fallbackDecision;
      state.metadata.fallback_explain = {
        summary: '由于缺少POI数据，系统采用城市探索策略',
        reasoning: [
          `目的地明确（${destinationRaw || '未提供'}）`,
          '未获取到可用POI数据',
          '触发Fallback机制',
        ],
      };
      if (requirePoiData) {
        state.gaps = [
          ...(state.gaps || []),
          {
            type: 'MISSING_DESTINATION',
            severity: 'HARD',
            detail: '已启用 require_poi_data：POI 数据为空，需补充目的地或扩展检索范围',
          } as any,
        ];
        return {
          needsClarification: true,
          allowWithFallback: false,
        };
      }
    }

    if (state.research_data && rawPoiEvidence) {
      if (Array.isArray(rawPoiEvidence)) {
        state.research_data.poi_evidence = scored;
      } else {
        state.research_data.poi_evidence = {
          ...(rawPoiEvidence as Record<string, unknown>),
          pois: scored,
        };
      }
    }

    state.decision_log.push({
      request_id: state.request_id,
      step: 'POI_SELECTION',
      actor: 'Planner',
      inputs_summary: `候选POI数量: ${asArray.length}`,
      outputs_summary: `已选择POI数量: ${scored.length}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        destination: destinationRaw || undefined,
        destination_country: destinationCountry || undefined,
        input_count: asArray.length,
        deduped_count: deduped.length,
        selected_count: scored.length,
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    await this.generateDecisionStepForStep(state, 'POI_SELECTION', 'Planner');
    const allowWithFallback = poiPolicy !== 'strict' && !!(destinationRaw && scored.length === 0);
    return {
      needsClarification: false,
      allowWithFallback,
    };
  }

  /** Phase 2.0：DSO slice 摘要，写入 metadata 与 observability，便于无 DSO 回放对齐 */
  private compactPoiPlanningSliceForOutcome(slice: PoiPlanningDecisionSlice | undefined):
    | {
        regionId?: string;
        feasibility?: 'ok' | 'tight' | 'failed';
        resolution?: PoiPlanningDecisionSlice['resolution'];
        appliedBackoffSteps?: string[];
        budgetGateApplied?: boolean;
      }
    | undefined {
    if (!slice) return undefined;
    return {
      regionId: slice.routeIntent?.regionId,
      feasibility: slice.schedulePlan?.feasibility,
      resolution: slice.resolution,
      appliedBackoffSteps: slice.appliedBackoffSteps,
      budgetGateApplied: slice.budgetGateApplied,
    };
  }

  /** POI_SELECTION 最终 TopN（聚类后）→ slug 与 outcome 指标 */
  private recordPoiPlanningOutcomeAfterSelection(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    scoredPois: unknown[],
    admissionDiagnostics?: PoiPlanningAdmissionDiagnosticsInput,
  ): void {
    const slugs = extractPlanningSlugsFromPois(scoredPois);
    const fb = countPoiPlanningFallbackInPois(scoredPois);
    const report = buildPoiPlanningOutcomePhaseReport(decisionState?.poiPlanning, slugs, {
      phase: 'poi_selection',
      scoredPoisForRank: scoredPois,
      fallbackAnchorCount: fb,
      admissionDiagnostics,
    });
    const meta = state.metadata as Record<string, unknown>;
    const prev = (meta.poiPlanningOutcome ?? {}) as Record<string, unknown>;
    meta.poiPlanningOutcome = {
      ...prev,
      slice: this.compactPoiPlanningSliceForOutcome(decisionState?.poiPlanning),
      poiSelection: report,
    };
  }

  /** PLAN/REPAIR 之后最终 itinerary → slug 与 outcome 指标（与 poiSelection 对照） */
  private recordPoiPlanningOutcomeAfterItinerary(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): void {
    const slugs = extractPlanningSlugsFromItinerary(state.itinerary);
    const itineraryItems: MinimalItineraryItem[] =
      state.itinerary?.days?.flatMap((d) => (d.items ?? []) as MinimalItineraryItem[]) ?? [];
    const report = buildPoiPlanningOutcomePhaseReport(decisionState?.poiPlanning, slugs, {
      phase: 'itinerary_final',
      itineraryItemsForReasons: itineraryItems,
      fallbackAnchorCount: 0,
    });
    const meta = state.metadata as Record<string, unknown>;
    const prev = (meta.poiPlanningOutcome ?? {}) as Record<string, unknown>;
    meta.poiPlanningOutcome = {
      ...prev,
      slice: this.compactPoiPlanningSliceForOutcome(decisionState?.poiPlanning),
      itineraryFinal: report,
    };
    if (state.metadata?.show_poi_trace) {
      state.metadata.poi_trace = {
        ...(state.metadata.poi_trace || {}),
        poi_planning_outcome: meta.poiPlanningOutcome,
      };
    }
  }

  private resolvePoiPolicy(
    explicitPolicy: unknown,
    requirePoiData: boolean,
  ): 'strict' | 'fallback' | 'explore' {
    if (typeof explicitPolicy === 'string') {
      const p = explicitPolicy.trim().toLowerCase();
      if (p === 'strict' || p === 'fallback' || p === 'explore') return p;
    }
    if (requirePoiData) return 'strict';
    return 'fallback';
  }

  private relaxGateForPartialIfEligible(state: OrchestratorState): void {
    if (state.metadata?.allow_partial !== true) return;
    if (state.gate_result?.gate_result !== 'BLOCK') return;
    const violations = state.gate_result?.violations || [];
    if (!this.isDateOnlyDataMissingViolation(violations)) return;

    state.gate_result = {
      ...state.gate_result,
      gate_result: 'ADJUST_REQUIRED',
      required_adjustments: [
        ...(state.gate_result?.required_adjustments || []),
        {
          action: 'CHANGE_DATES',
          why: 'allow_partial=true：缺少日期时先生成草案，再补充日期确认',
        } as any,
      ],
    };
    state.metadata.gate_relaxed_for_partial = true;
    state.decision_log.push({
      request_id: state.request_id,
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: 'allow_partial 下日期缺口门控降级',
      outputs_summary: 'Gate 从 BLOCK 降级为 ADJUST_REQUIRED，继续生成草案',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: { duration_ms: 0, downgraded: true },
    });
  }

  private isDateOnlyDataMissingViolation(
    violations: Array<{ type?: string; detail?: string; severity?: string }>,
  ): boolean {
    if (!violations.length) return false;
    return violations.every((v) => {
      if (String(v?.type) !== 'DATA_MISSING') return false;
      const d = String(v?.detail || '');
      return /日期|date_range|start_date/i.test(d);
    });
  }

  private applyFallbackPlan(state: OrchestratorState): void {
    const destination =
      typeof state.trip_plan_request?.destination === 'string'
        ? state.trip_plan_request.destination
        : '目的地';
    const query = state.decision_log.find((log) => log.step === 'INTAKE')?.inputs_summary || '';
    const strategyHint = this.normalizeFallbackStrategyHint(
      state.metadata?.fallback_strategy_hint,
    );
    const strategy = strategyHint ?? chooseFallbackStrategy(query);
    const researchPoiEvidence = state.research_data?.poi_evidence;
    const includeDebugScores = state.metadata?.fallback_debug_scores === true;
    const includeCommuteMatrix = state.metadata?.show_commute_matrix === true;
    const fallbackPlan = buildFallbackPlan(destination, strategy, {
      researchPoiEvidence,
      includeDebugScores,
      includeCommuteMatrix,
      tripPlanRequest: state.trip_plan_request,
    });
    const fallbackPlans = buildFallbackPlans(destination, {
      researchPoiEvidence,
      tripPlanRequest: state.trip_plan_request,
    });
    const mergedFallbackPlans = [
      fallbackPlan,
      ...fallbackPlans.filter((p) => p.strategy !== fallbackPlan.strategy),
    ];
    const fallbackItinerary = fallbackPlanToItinerary(
      state.request_id,
      state.trip_plan_request,
      fallbackPlan,
    );

    state.itinerary = fallbackItinerary;
    state.clarification_questions = [];
    state.gaps = [];
    state.metadata.fallback_used = true;
    state.metadata.fallback_template_version = getFallbackTemplateVersion();
    state.metadata.fallback_data_source = fallbackPlan.data_source;
    state.metadata.fallback_source_confidence = fallbackPlan.source_confidence;
    state.metadata.fallback_pacing_mode = fallbackPlan.pacing_mode;
    state.metadata.fallback_plan = fallbackPlan;
    state.metadata.fallback_plans = mergedFallbackPlans;
    state.metadata.fallback_selected_strategy = fallbackPlan.strategy;
    state.metadata.fallback_explain = {
      summary:
        fallbackPlan.explain?.summary || '由于缺少POI数据，系统采用城市探索策略',
      reasoning: [
        `目的地明确（${destination}）`,
        '未获取到可用POI数据',
        '触发Fallback机制',
        ...(fallbackPlan.explain?.reasoning || []),
      ],
      objective: fallbackPlan.explain?.objective || '最大体验密度 + 节奏合理',
      planScore: fallbackPlan.plan_score,
      dataSource: fallbackPlan.data_source,
      sourceConfidence: fallbackPlan.source_confidence,
      pacingMode: fallbackPlan.pacing_mode,
      policy: this.resolvePoiPolicy(
        state.metadata?.poi_policy,
        state.metadata?.require_poi_data === true,
      ),
    };
    if (state.metadata?.show_poi_trace) {
      state.metadata.poi_trace = {
        ...(state.metadata.poi_trace || {}),
        provider: fallbackPlan.data_source,
      };
    }
    state.decision_log.push({
      request_id: state.request_id,
      step: 'PLAN_GEN',
      actor: 'Planner',
      inputs_summary: 'POI 数据缺失，触发 fallback plan',
      outputs_summary: `生成 fallback 行程，策略=${fallbackPlan.strategy}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: 0,
        fallback: true,
        strategy: fallbackPlan.strategy,
      },
    });
  }

  private normalizeFallbackStrategyHint(input: unknown):
    | 'CITY_WALK'
    | 'CLASSIC'
    | 'HOT_SPOTS'
    | 'BALANCED'
    | undefined {
    if (typeof input !== 'string') return undefined;
    const value = input.trim().toUpperCase();
    if (value === 'CITY_WALK' || value === 'CLASSIC' || value === 'HOT_SPOTS' || value === 'BALANCED') {
      return value;
    }
    return undefined;
  }

  private normalizeText(v: string): string {
    return v.trim().toLowerCase();
  }

  private inferCountryFromDestination(destination: string): string | undefined {
    const d = this.normalizeText(destination);
    if (!d) return undefined;
    if (/东京|大阪|京都|日本|tokyo|osaka|kyoto|japan/.test(d)) return 'JP';
    if (/首尔|韩国|seoul|korea/.test(d)) return 'KR';
    if (/上海|北京|广州|深圳|杭州|成都|重庆|中国|china/.test(d)) return 'CN';
    /** 冰岛：POI_SELECTION / poiPlanning 冰岛分支依赖 ISO 国家码 IS */
    if (/冰岛|iceland|reykjav[ií]k|雷克雅未克/.test(d)) return 'IS';
    return undefined;
  }

  private buildPoiCountryClarificationQuestion(destination: string, destinationCountry: string): Record<string, unknown> {
    const normalizedDestination = destination?.trim() || '该目的地';
    const countryLabel = this.countryDisplayName(destinationCountry);
    const quickOptionLabel = `${normalizedDestination} ${countryLabel}`;
    const quickOptionValue = this.toStableOptionValue(normalizedDestination, destinationCountry);

    return {
      id: 'question-poi-country',
      question: '请确认目的地国家/城市',
      type: 'single_choice',
      options: [
        { value: quickOptionValue, label: quickOptionLabel },
        { value: 'manual', label: '其他（手动输入）' },
      ],
      required: true,
      hint: '用于限制 POI 检索范围，避免匹配到同名异地',
      conditionalInputs: [
        {
          triggerValue: 'manual',
          inputType: 'text',
          label: '请输入目的地国家/城市',
          placeholder: `例如：${normalizedDestination}, ${countryLabel}`,
          required: true,
          hint: '建议格式：城市 + 国家',
          paramKey: 'destination_disambiguation',
        },
      ],
    };
  }

  private countryDisplayName(countryCode?: string): string {
    const code = String(countryCode || '').toUpperCase();
    if (!code) return '国家/地区';
    const map: Record<string, string> = {
      JP: '日本',
      KR: '韩国',
      CN: '中国',
      US: '美国',
      GB: '英国',
      FR: '法国',
      DE: '德国',
      IT: '意大利',
      ES: '西班牙',
    };
    return map[code] ?? code;
  }

  private toStableOptionValue(destination: string, countryCode: string): string {
    const normalized = this.normalizeText(destination)
      .replace(/\s+/g, '_')
      .replace(/[^\w\u4e00-\u9fa5]/g, '');
    return `${normalized || 'destination'}_${countryCode.toLowerCase()}`;
  }

  private dedupePois(pois: any[]): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const poi of pois) {
      const key = [
        String(poi?.place_id ?? poi?.id ?? ''),
        String(poi?.name ?? poi?.nameCN ?? '').trim().toLowerCase(),
        String(poi?.address ?? '').trim().toLowerCase(),
      ].join('|');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(poi);
    }
    return out;
  }

  private passesHardPoiGuards(
    poi: any,
    destinationCountry?: string,
    destinationRaw?: string,
  ): boolean {
    if (
      destinationCountry === 'IS' &&
      (poi?.poi_planning_anchor_slug ||
        poi?.source === 'poi_planning_fallback' ||
        poi?.source === 'poi_planning_matched_existing')
    ) {
      return true;
    }
    const riskLevel = String(poi?.metadata?.risk_level ?? '').toUpperCase();
    if (riskLevel === 'HIGH') return false;
    if (!poi?.name) return false;
    if (!poi?.address && !poi?.coordinates) return false;
    const category = String(poi?.category ?? poi?.type ?? '').toUpperCase();
    if (
      /(HOSPITAL|TRANSIT_HUB|GAS_STATION|CLINIC|AIRPORT_SERVICE|HOTEL|LODGING|ACCOMMODATION)/.test(
        category,
      )
    ) {
      return false;
    }
    if (!this.isPoiWithinDestinationBounds(poi, destinationRaw)) return false;
    if (!destinationCountry) return true;
    const poiCountry = String(
      poi?.countryCode ??
        poi?.country_code ??
        poi?.metadata?.countryCode ??
        '',
    ).toUpperCase();
    if (poiCountry && poiCountry !== destinationCountry) return false;
    return true;
  }

  private selectClusteredPois(
    candidates: any[],
    limit: number,
    startCoordinates?: { lat: number; lng: number },
    destinationRaw?: string,
  ): any[] {
    if (!Array.isArray(candidates) || candidates.length <= 1) {
      return Array.isArray(candidates) ? candidates.slice(0, limit) : [];
    }
    const maxLegKm = /冰岛|iceland/i.test(String(destinationRaw ?? '')) ? 60 : 35;
    const selected: any[] = [];
    const anchors: Array<{ lat: number; lng: number }> = [];
    if (startCoordinates) anchors.push(startCoordinates);
    for (const poi of candidates) {
      if (selected.length >= limit) break;
      const lat = Number(poi?.coordinates?.lat ?? poi?.lat ?? NaN);
      const lng = Number(poi?.coordinates?.lng ?? poi?.lng ?? NaN);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        selected.push(poi);
        continue;
      }
      if (anchors.length === 0) {
        selected.push(poi);
        anchors.push({ lat, lng });
        continue;
      }
      const nearest = Math.min(
        ...anchors.map((a) => this.haversineKm(a, { lat, lng })),
      );
      if (nearest <= maxLegKm) {
        selected.push(poi);
        anchors.push({ lat, lng });
      }
    }
    if (selected.length === 0) return candidates.slice(0, limit);
    return selected.slice(0, limit);
  }

  private toPoiTraceNode(
    poi: any,
  ): { name: string; coordinates?: { lat: number; lng: number } } {
    const lat = Number(poi?.coordinates?.lat ?? poi?.lat ?? NaN);
    const lng = Number(poi?.coordinates?.lng ?? poi?.lng ?? NaN);
    return {
      name: String(poi?.name ?? ''),
      coordinates:
        Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
    };
  }

  private tryExtractStartCoordinates(
    origin: unknown,
  ): { lat: number; lng: number } | undefined {
    if (!origin || typeof origin !== 'object') return undefined;
    const lat = Number((origin as any)?.lat ?? NaN);
    const lng = Number((origin as any)?.lng ?? NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    return { lat, lng };
  }

  private haversineKm(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
  ): number {
    const toRadians = (v: number): number => (v * Math.PI) / 180;
    const earthRadius = 6371;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(a.lat)) *
        Math.cos(toRadians(b.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return earthRadius * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  }

  private estimateCommuteMinutesFromMode(
    km: number,
    mode?: 'walk' | 'drive' | 'transit' | 'mixed',
  ): number {
    const kmh =
      mode === 'walk' ? 4.5 : mode === 'drive' ? 24 : mode === 'transit' ? 16 : 10;
    return Math.max(5, Math.round((km / Math.max(1, kmh)) * 60));
  }

  private buildPoiTraceCommuteMatrix(
    selected: Array<{ name: string; coordinates?: { lat: number; lng: number } }>,
    mode?: 'walk' | 'drive' | 'transit' | 'mixed',
    startCoordinates?: { lat: number; lng: number },
  ): {
    mode?: 'walk' | 'drive' | 'transit' | 'mixed';
    from_start?: boolean;
    nodes?: string[];
    minutes?: number[][];
  } | undefined {
    const valid = selected.filter((x) => !!x.coordinates);
    if (valid.length === 0) return undefined;
    const n = valid.length;
    const rows: number[][] = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => 0),
    );
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const km = this.haversineKm(valid[i].coordinates!, valid[j].coordinates!);
        rows[i][j] = this.estimateCommuteMinutesFromMode(km, mode);
      }
    }
    const nodes = valid.map((x) => x.name);
    if (!startCoordinates) {
      return { mode, from_start: false, nodes, minutes: rows };
    }
    const startRow = valid.map((x) => {
      const km = this.haversineKm(startCoordinates, x.coordinates!);
      return this.estimateCommuteMinutesFromMode(km, mode);
    });
    return {
      mode,
      from_start: true,
      nodes: ['START', ...nodes],
      minutes: [startRow, ...rows],
    };
  }

  private estimateNearestTotalCommuteMinutes(
    selected: Array<{ name: string; coordinates?: { lat: number; lng: number } }>,
    mode?: 'walk' | 'drive' | 'transit' | 'mixed',
    startCoordinates?: { lat: number; lng: number },
  ): number {
    const valid = selected.filter((x) => !!x.coordinates);
    if (valid.length <= 1) return 0;
    const remaining = valid.map((x) => x.coordinates!) as Array<{
      lat: number;
      lng: number;
    }>;
    let current = startCoordinates ?? remaining[0];
    let total = 0;
    const visited = new Set<number>();
    while (visited.size < remaining.length) {
      let bestIdx = -1;
      let bestMinutes = Infinity;
      for (let i = 0; i < remaining.length; i += 1) {
        if (visited.has(i)) continue;
        const km = this.haversineKm(current, remaining[i]);
        const m = this.estimateCommuteMinutesFromMode(km, mode);
        if (m < bestMinutes) {
          bestMinutes = m;
          bestIdx = i;
        }
      }
      if (bestIdx < 0 || !Number.isFinite(bestMinutes)) break;
      total += bestMinutes;
      current = remaining[bestIdx];
      visited.add(bestIdx);
    }
    return total;
  }

  private isPoiWithinDestinationBounds(poi: any, destinationRaw?: string): boolean {
    const d = this.normalizeText(String(destinationRaw ?? ''));
    if (!d) return true;
    const lat = Number(poi?.coordinates?.lat ?? poi?.lat ?? NaN);
    const lng = Number(poi?.coordinates?.lng ?? poi?.lng ?? NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;

    // Iceland
    if (/冰岛|iceland/.test(d)) {
      return lat >= 63 && lat <= 67.8 && lng >= -25.5 && lng <= -13.0;
    }
    // Tokyo
    if (/东京|tokyo/.test(d)) {
      return lat >= 35.4 && lat <= 35.9 && lng >= 139.4 && lng <= 140.1;
    }
    return true;
  }

  private poiLocalityScore(
    poi: any,
    destinationCountry?: string,
    destinationCity?: string,
  ): number {
    let score = 0;
    const address = this.normalizeText(String(poi?.address ?? ''));
    const name = this.normalizeText(String(poi?.name ?? ''));
    const poiCountry = String(
      poi?.countryCode ??
        poi?.country_code ??
        poi?.metadata?.countryCode ??
        '',
    ).toUpperCase();

    if (destinationCountry && poiCountry) {
      score += poiCountry === destinationCountry ? 2 : -3;
    }

    if (destinationCity) {
      if (name.includes(destinationCity)) score += 2;
      if (address.includes(destinationCity)) score += 1.5;
    }
    return score;
  }

  /**
   * GATE_EVAL 阶段：KERNEL_NATIVE_EXECUTION 时走 Kernel.executeGateEval，否则走 callback
   */
  private async executeGateEvalPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    if (
      this.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) &&
      this.decisionKernel &&
      decisionState &&
      state.trip_plan_request
    ) {
      const stepStartTime = Date.now();
      const ctx = {
        requestId: state.request_id,
        routeDirectionId: request.route_direction_id ?? undefined,
        userId: request.user_id,
        tripPlanRequest: state.trip_plan_request,
        researchData: state.research_data,
      };
      const { newState, gateResult } = await this.decisionKernel.executeGateEval(decisionState, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      state.gate_result = {
        gate_result: gateResult.gate_result,
        violations: gateResult.violations as GateResult['violations'],
        required_adjustments: gateResult.required_adjustments as GateResult['required_adjustments'],
        confidence: gateResult.confidence,
        evidence_refs: [],
      };
      state.current_step = 'GATE_EVAL';
      state.decision_log.push({
        request_id: state.request_id,
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: 'Kernel 原生 GATE_EVAL',
        outputs_summary: `Gate 结果: ${gateResult.gate_result}, 违规数: ${gateResult.violations.length}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'GATE_EVAL', 'Gatekeeper');
      return newState;
    }
    return this.executePhaseViaKernel(decisionState, state, 'GATE_EVAL', () =>
      this.executeGateEvalStep(request, context, state, llmProvider),
    );
  }

  /**
   * PLAN_GEN 阶段：KERNEL_NATIVE_EXECUTION 时走 Kernel.executePlanGen
   */
  private async executePlanGenPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    if (this.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) && this.decisionKernel && decisionState && state.trip_plan_request) {
      const stepStartTime = Date.now();
      let dsoForPlan = decisionState;
      if (
        dsoForPlan.systemState?.pendingMigrations?.length &&
        (dsoForPlan.tripState?.planDraft as { days?: unknown[] } | undefined)?.days?.length
      ) {
        dsoForPlan = this.decisionKernel.applyPrePlanMigrationInjections(dsoForPlan);
        state.decision_log.push({
          request_id: state.request_id,
          step: 'CONTEXT_BUILD',
          actor: 'Orchestrator',
          inputs_summary: '消费 DSO.systemState.pendingMigrations → 注入既有 planDraft',
          outputs_summary: `剩余待迁移条目=${dsoForPlan.systemState?.pendingMigrations?.length ?? 0}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: { duration_ms: 0 },
        });
      }
      const ctx = {
        requestId: state.request_id,
        tripPlanRequest: state.trip_plan_request,
        researchData: state.research_data,
        gateResult: state.gate_result as any,
      };
      const { newState, itinerary } = await this.decisionKernel.executePlanGen(dsoForPlan, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      state.itinerary = itinerary as Itinerary;
      state.current_step = 'PLAN_GEN';
      const pgFail = newState.systemState?.planGenTerminalFailure;
      state.decision_log.push({
        request_id: state.request_id,
        step: 'PLAN_GEN',
        actor: 'Planner',
        inputs_summary: 'Kernel 原生 PLAN_GEN',
        outputs_summary:
          itinerary.days.length > 0
            ? `生成了 ${itinerary.days.length} 天的行程`
            : `未生成任何日程天（${pgFail?.message ?? 'planGenTerminalFailure'}）`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          ...(pgFail
            ? {
                system_action: SYSTEM_ORCHESTRATOR_ACTIONS.PLAN_GEN_EMPTY_DRAFT_HALT,
                planGenTerminalFailure: pgFail,
              }
            : {}),
        },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'PLAN_GEN', 'Planner');
      if (this.trajectoryCollection && state.itinerary && state.gate_result) {
        try {
          let complianceResult = state.compliance_result;
          if (!complianceResult && this.complianceAgent) {
            try {
              complianceResult = await this.complianceAgent.checkCompliance(state.itinerary, state.gate_result, state);
            } catch {
              complianceResult = { risk_warnings: [], disclaimers: [], required_confirmations: [] };
            }
          } else if (!complianceResult) {
            complianceResult = { risk_warnings: [], disclaimers: [], required_confirmations: [] };
          }
          await this.trajectoryCollection.collectTrajectory({
            requestId: state.request_id,
            tripId: (request as any).trip_id,
            plan: state.itinerary,
            decisionTrace: state.decision_log,
            researchData: state.research_data || {},
            gateResult: state.gate_result,
            complianceResult: complianceResult as any,
            modelVersion: 'v1.0',
            countryCode: undefined,
          });
        } catch (e: any) {
          this.logger.warn(`[Claude Orchestrator] 轨迹收集失败: ${e?.message}`);
        }
      }
      return newState;
    }
    return this.executePhaseViaKernel(decisionState, state, 'PLAN_GEN', () =>
      this.executePlanGenStep(request, context, state, llmProvider),
    );
  }

  /**
   * VERIFY 阶段：KERNEL_NATIVE_EXECUTION 时走 Kernel.executeVerify
   */
  private async executeVerifyPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    if (this.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) && this.decisionKernel && decisionState && state.itinerary) {
      const stepStartTime = Date.now();
      const ctx = {
        requestId: state.request_id,
        tripPlanRequest: state.trip_plan_request,
        itinerary: state.itinerary as any,
        researchData: state.research_data,
      };
      const { newState, issues } = await this.decisionKernel.executeVerify(decisionState, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      const fatalIssues = (issues as Array<{ class?: string; message?: string }>).filter((i) => i?.class === 'FATAL');
      const conflictIssues = (issues as Array<{ class?: string }>).filter((i) => i?.class === 'CONFLICT');
      const advisoryIssues = (issues as Array<{ class?: string }>).filter((i) => i?.class === 'ADVISORY');

      // FATAL 的终止由主链在 VERIFY 后统一处理（避免在 phase 内 throw 导致非预期降级）。

      // CONFLICT/ADVISORY：不一定阻塞 DONE。当前工程口径：只要有 issues 就进入 errors（后续 REPAIR gate 用）。
      // ADVISORY 未来可从 errors 中剥离为 warnings；先保持兼容。
      if (issues.length > 0) {
        state.errors.push({
          step: 'VERIFY',
          error_code: 'VERIFICATION_ISSUES',
          message: `发现 ${issues.length} 个验证问题`,
          timestamp: new Date().toISOString(),
        });
      }
      state.current_step = 'VERIFY';
      state.decision_log.push({
        request_id: state.request_id,
        step: 'VERIFY',
        actor: 'Orchestrator',
        inputs_summary: 'Kernel 原生 VERIFY',
        outputs_summary:
          issues.length > 0
            ? `fatal=${fatalIssues.length} conflict=${conflictIssues.length} advisory=${advisoryIssues.length}`
            : '验证通过',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime, issues, guardian: 'DR_DRE' as GuardianType },
      });

      // Hard opening-hours audit proof (C1 strict): materialize a stable evidence bundle for temporal_opening_v1.
      // Source of truth: Kernel verify issues + (itinerary + research_data.opening_hours_evidence) for human-readable windows.
      try {
        const poiClosed = (issues as any[]).filter((i) => i?.code === 'POI_CLOSED' && i?.entityRef?.type === 'POI');
        if (poiClosed.length > 0 && state.itinerary && state.research_data?.opening_hours_evidence) {
          const ohData = state.research_data.opening_hours_evidence;
          const openingHoursMap = new Map<string, any>();
          const rows = Array.isArray(ohData) ? ohData : Array.isArray((ohData as any)?.opening_hours) ? (ohData as any).opening_hours : [];
          for (const r of rows) {
            if (r && r.poi_id && r.opening_hours) openingHoursMap.set(String(r.poi_id), r);
          }
          const day0 = (state.itinerary as any)?.days?.[0];
          const dayDate = String(day0?.date ?? '');
          const items: any[] = Array.isArray(day0?.items) ? day0.items : [];
          for (const it of items) {
            const poiId = String(it?.location_ref?.place_id ?? '');
            if (!poiId) continue;
            const hit = poiClosed.find((x) => String(x?.entityRef?.id ?? '') === String(it?.id ?? ''));
            if (!hit) continue;
            const oh = openingHoursMap.get(poiId);
            const openWindow = oh?.opening_hours ?? (oh?.open_time && oh?.close_time ? `${oh.open_time}-${oh.close_time}` : undefined) ?? 'UNKNOWN';
            state.decision_log.push({
              request_id: state.request_id,
              step: 'VERIFY',
              actor: 'Orchestrator',
              inputs_summary: 'temporal_opening_v1: opening hours hard check',
              outputs_summary: `POI_CLOSED: ${String(it?.location_ref?.name ?? poiId)} @ ${String(it?.start_window ?? '')}-${String(it?.end_window ?? '')}`,
              evidence_refs: oh?.evidence_id ? [String(oh.evidence_id)] : [],
              timestamp: new Date().toISOString(),
              metadata: {
                rule_id: 'temporal_opening_v1',
                details: {
                  evidence: {
                    type: 'opening_hours',
                    source: 'OPENING_HOURS',
                    poi_id: poiId,
                    date: dayDate || undefined,
                    timezone: 'UTC',
                    planned_start: dayDate && it?.start_window ? `${dayDate}T${String(it.start_window)}:00.000Z` : null,
                    planned_end: dayDate && it?.end_window ? `${dayDate}T${String(it.end_window)}:00.000Z` : null,
                    open_window: openWindow,
                    is_violated: true,
                    item_id: String(it?.id ?? ''),
                  },
                },
              },
            } as any);
          }
        }
      } catch {
        // best-effort only
      }

      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'VERIFY', 'CoreDecision');
      return newState;
    }
    return this.executePhaseViaKernel(decisionState, state, 'VERIFY', () =>
      this.executeVerifyStep(request, context, state, llmProvider),
    );
  }

  /**
   * REPAIR 阶段：KERNEL_NATIVE_EXECUTION 时走 Kernel.executeRepair
   */
  private async executeRepairPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined> {
    if (this.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) && this.decisionKernel && decisionState && state.itinerary && state.gate_result) {
      const stepStartTime = Date.now();
      const ctx = {
        requestId: state.request_id,
        tripPlanRequest: state.trip_plan_request,
        researchData: state.research_data,
        gateResult: state.gate_result as any,
        itinerary: state.itinerary as any,
        alternatives: state.alternatives,
      };
      const { newState, itinerary, repairApplied } = await this.decisionKernel.executeRepair(decisionState, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      if (itinerary) state.itinerary = itinerary as Itinerary;
      state.current_step = 'REPAIR';
      state.decision_log.push({
        request_id: state.request_id,
        step: 'REPAIR',
        actor: 'LocalInsight',
        inputs_summary: 'Kernel 原生 REPAIR',
        outputs_summary: repairApplied ? '已应用修复方案' : '无需修复或修复失败',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime, repair_applied: repairApplied, guardian: 'NEPTUNE' as GuardianType },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      await this.generateDecisionStepForStep(state, 'REPAIR', 'LocalInsight');

      // Observability: best-effort score sample even for non-terminal REPAIR exits (oscillation/max-iter/utility-compensation)
      try {
        const audit_report = AuditReportGenerator.generate(newState, state);
        const score = (audit_report as any)?.session_consistency_score;
        if (typeof score === 'number') {
          this.promMetrics?.recordSessionConsistencyScore({
            score,
            dominant_cid: (audit_report as any)?.dominant_cid,
            phase: 'REPAIR',
          });
        }

        // LogicOps: emit a single atomic audit event when REPAIR produced actionable traces or a score.
        // This allows P0/P1/P2 matrix to light up even when the run returns OK (non-terminal).
        const hasRealTraces =
          Array.isArray((audit_report as any)?.repair_traces) && (audit_report as any).repair_traces.length > 0;
        if (hasRealTraces || typeof score === 'number') {
          const drift = (audit_report as any)?.predictive_feedback_then_repair?.drift_vector;
          const deltaReason = String(drift?.delta_reason ?? '').trim();
          const deltaUtility = Number(drift?.delta_utility);
          const delta_reason_kind =
            deltaReason === 'aligned'
              ? ('aligned' as const)
              : deltaReason
                ? ('mismatch' as const)
                : ('unknown' as const);
          const is_intent_revised = Boolean((audit_report as any)?.predictive_feedback_then_repair?.intent_revision_flag);
          const utility_drift_severity = (() => {
            if (!Number.isFinite(deltaUtility)) return 'unknown' as const;
            const a = Math.abs(deltaUtility);
            if (a <= 5) return 'low' as const;
            if (a <= 20) return 'medium' as const;
            return 'high' as const;
          })();

          this.logger.log(
            JSON.stringify({
              event: 'decision_os_audit_report',
              phase: 'REPAIR',
              terminal: false,
              request_id: state.request_id,
              dominant_cid: (audit_report as any)?.dominant_cid,
              session_consistency_score: (audit_report as any)?.session_consistency_score,
              delta_reason_kind,
              is_intent_revised,
              utility_drift_severity,
              audit_report,
            }),
          );
        }
      } catch {
        // best-effort only
      }

      return newState;
    }
    return this.executePhaseViaKernel(decisionState, state, 'REPAIR', () =>
      this.executeRepairStep(request, context, state, llmProvider),
    );
  }

  /**
   * Phase B: Conductor 只调 Kernel - 执行阶段并原子同步
   */
  private async executePhaseViaKernel(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    phaseName: string,
    executeFn: () => Promise<void>,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) {
      await executeFn();
      return this.executeStateUpdateStep(state, decisionState) ?? decisionState;
    }
    const stepStartTime = Date.now();
    const updated = await this.decisionKernel.executePhase(decisionState, state, phaseName, executeFn);
    const derived = decisionStateToOrchestratorState(updated, state);
    Object.assign(state, derived);
    state.decision_log.push({
      request_id: state.request_id,
      step: 'STATE_UPDATE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: `Phase B: ${phaseName} 执行后原子同步`,
      outputs_summary: `version=${updated.systemState?.version}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: { duration_ms: Date.now() - stepStartTime },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    return updated;
  }

  /**
   * 从 ContextPackage 提取 WorldModelContext（P3: world.buildContext 与 DSO 打通）
   * 查找 type=WORLD_MODEL 且 data 含 physical/human/routeDirection 的 block
   */
  private extractWorldModelFromContextPackage(decisionState: DecisionState | undefined): { physical?: unknown; human?: unknown; routeDirection?: unknown } | undefined {
    const pkg = decisionState?.contextPackage;
    if (!pkg?.blocks?.length) return undefined;
    const block = pkg.blocks.find((b: any) => b.type === 'WORLD_MODEL' && b.data?.physical);
    return block?.data;
  }

  /**
   * INTAKE 后 userIntent 已合并进 patch：解析区域意图并写入 DSO.poiPlanning（命中黄金圈等则自动产出骨架）
   */
  private applyPoiPlanningToPatch(
    patch: DecisionStatePatch,
    decisionState: DecisionState,
    state: OrchestratorState,
  ): void {
    if (!this.regionAnchorPlanning) return;
    const ui = patch.userIntent ?? decisionState.userIntent;
    if (!ui) return;
    const q = (state.metadata as { intake_user_message?: string }).intake_user_message;
    const userRoute: Partial<UserRouteIntent> = {
      regionId: ui.regionId,
      mustIncludePoiIds: ui.mustIncludePoiIds,
      excludePoiIds: ui.excludePoiIds,
      totalBudgetMinutes: ui.totalBudgetMinutes,
      pace: ui.pace,
      styleTags: ui.styleTags,
      availableStartTime: ui.availableStartTime,
      availableEndTime: ui.availableEndTime,
    };
    const slice = this.regionAnchorPlanning.resolveAndBuildSlice(userRoute, q);
    if (slice) {
      patch.poiPlanning = slice;
      const meta = state.metadata as Record<string, unknown>;
      meta.poiPlanningFeasibility = slice.schedulePlan?.feasibility;
      meta.poiPlanningBudgetGateApplied = slice.budgetGateApplied === true;
      meta.poiPlanningResolution = slice.resolution;
      this.logger.debug(
        `[STATE_UPDATE] poiPlanning region=${slice.routeIntent?.regionId ?? 'n/a'} anchors=${slice.poiPlan?.requiredAnchorPoiIds?.join(',') ?? ''} budgetGate=${slice.budgetGateApplied}`,
      );
    }
  }

  /**
   * STATE_UPDATE 步骤：Phase 2.3 显式同步，专利权利要求 7 原子提交
   */
  private async executeStateUpdateStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) return decisionState;

    state.current_step = 'STATE_UPDATE';
    const stepStartTime = Date.now();
    this.logger.debug(`[Claude Orchestrator] 执行 STATE_UPDATE 步骤（原子提交）...`);

    const patch = this.isDsoAsPrimary()
      ? buildPatchFromDSOPrimary(decisionState, state)
      : orchestratorStateToDecisionStatePatch(state);
    patch.systemState = {
      ...patch.systemState,
      requestId: state.request_id,
      currentPhase: 'STATE_UPDATE',
      lastUpdatedAt: new Date().toISOString(),
    };
    this.applyPoiPlanningToPatch(patch, decisionState, state);
    // Scheme C: 世界模型三段式，从 patch + decisionState 构建 worldStateSummary（P3: research_data 补全，world.buildContext 优先）
    const { buildWorldStateSummaryFromDso } = await import('../../decision/kernel/world-state-summary.types');
    const mergedForSummary = {
      environmentState: patch.environmentState ?? decisionState.environmentState,
      userIntent: patch.userIntent ?? decisionState.userIntent,
    };
    const worldFromContext = this.extractWorldModelFromContextPackage(decisionState);
    const worldStateSummary = buildWorldStateSummaryFromDso(
      mergedForSummary,
      state.research_data,
      worldFromContext ?? (state as any).world_model_context,
    );
    if (Object.keys(worldStateSummary).length > 0) {
      patch.worldStateSummary = worldStateSummary;
    }

    const requestId = state.request_id;
    const getLatestState = this.dsoLatestStateProvider
      ? () => this.dsoLatestStateProvider!.getLatest(requestId)
      : undefined;

    // P3 A.1: 经 Kernel.executeStateUpdate 封装（原子提交 + 冲突回退）
    const { newState: updated } = await this.decisionKernel.executeStateUpdate(decisionState, patch, {
      getLatestState,
      maxRetries: 3,
    });

    // DSO 为主时：派生 OrchestratorState 兼容字段
    const derived = decisionStateToOrchestratorState(updated, state);
    Object.assign(state, derived);

    state.decision_log.push({
      request_id: state.request_id,
      step: 'STATE_UPDATE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: 'OrchestratorState 投影为 DSO patch，原子提交',
      outputs_summary: `已更新: userIntent=${!!patch.userIntent}, constraints=${!!patch.constraints}, environmentState=${!!patch.environmentState}, version=${updated.systemState?.version}; userIntent.destination before→after: ${JSON.stringify({
        before: decisionState.userIntent?.destination ?? null,
        after: patch.userIntent?.destination ?? updated.userIntent?.destination ?? null,
      })}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        state_update_user_intent_destination: {
          before: decisionState.userIntent?.destination ?? null,
          after: patch.userIntent?.destination ?? updated.userIntent?.destination ?? null,
        },
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();

    return updated;
  }

  /**
   * RESEARCH 步骤：调用 skills 获取硬数据
   * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
   * @deprecated 优先使用 Kernel.executeResearch。此降级路径将逐步废弃，见 P3 阶段 D.2
   */
  private async executeResearchStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
    decisionState?: DecisionState,
  ): Promise<void> {
    state.current_step = 'RESEARCH';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 RESEARCH 步骤...`);

    try {
      const researchData: Record<string, any> = {};
      const evidenceRefs: string[] = [];

      // 调用 Skills 收集数据
      if (this.skillsRegistry && state.trip_plan_request) {
        const tripRequest = state.trip_plan_request;

        // 1. 交通搜索（transport.search）- CRITICAL
        try {
          const transportSkill = this.skillsRegistry.getSkill('transport.search');
          if (
            transportSkill &&
            typeof tripRequest.origin === 'string' &&
            typeof tripRequest.destination === 'string' &&
            !isUnresolvedDestinationPlaceholder(tripRequest.destination)
          ) {
            const transportResult = await transportSkill.execute({
              origin: tripRequest.origin,
              destination: tripRequest.destination,
              mode: tripRequest.mode || 'mixed',
            });
            researchData.transport_evidence = transportResult;
            if (transportResult?.evidence_id) {
              evidenceRefs.push(transportResult.evidence_id);
            }
          }
        } catch (error: any) {
          const strategy = getSkillFailureStrategy('transport.search', error);
          
          // 如果是依赖缺失，标记为缺失但继续执行（降级）
          if (strategy.shouldDegrade && strategy.shouldMarkMissing) {
            this.logger.warn(`[Claude Orchestrator] transport.search 依赖缺失，降级处理: ${error?.message}`);
            researchData.transport_evidence = { 
              missing: true, 
              error: error?.message,
              degraded: true,
              degradation_reason: 'TransportRoutingService 未注入',
            };
            // 继续执行，不抛出错误
          } else if (strategy.shouldReject) {
            // 如果是执行失败，拒绝请求
            this.logger.error(`[Claude Orchestrator] ${strategy.errorMessage}`);
            throw new Error(strategy.errorMessage);
          } else if (strategy.shouldMarkMissing) {
            // 如果是重要技能失败，标记缺失但继续执行
            this.logger.warn(`[Claude Orchestrator] transport.search 失败: ${error?.message}`);
            researchData.transport_evidence = { missing: true, error: error?.message };
          }
        }

        // 2. POI 搜索（poi.search）- IMPORTANT（Phase 3：golden_circle 时 query 增强 + 第二路锚点检索）
        try {
          const poiSkill = this.skillsRegistry.getSkill('poi.search');
          if (poiSkill) {
            const destinationRaw = typeof tripRequest.destination === 'string'
              ? tripRequest.destination
              : 'destination'; // 如果是坐标，使用默认查询
            const normalizedDestination = destinationRaw.trim().toLowerCase();
            const ambiguousCityCountryMap: Record<string, string> = {
              '东京': '日本',
              tokyo: 'Japan',
              '大阪': '日本',
              osaka: 'Japan',
              '京都': '日本',
              kyoto: 'Japan',
              '首尔': '韩国',
              seoul: 'Korea',
            };
            const countryHint = ambiguousCityCountryMap[normalizedDestination];
            const destinationQuery = countryHint
              ? `${destinationRaw} ${countryHint}`
              : destinationRaw;
            const lat =
              typeof tripRequest.destination === 'object' ? tripRequest.destination.lat : undefined;
            const lng =
              typeof tripRequest.destination === 'object' ? tripRequest.destination.lng : undefined;
            const plan = buildCandidateRetrievalQueryPlan(
              request.message ?? '',
              destinationQuery,
              decisionState?.poiPlanning,
            );
            const boost =
              plan.boostedTerms.length > 0 ? ` ${plan.boostedTerms.slice(0, 12).join(' ')}` : '';
            const scenicQuery = `${destinationQuery} attractions landmark museum sightseeing${boost}`;
            const generalQuery =
              plan.boostedTerms.length > 0
                ? `${destinationQuery} ${plan.boostedTerms.slice(0, 8).join(' ')}`
                : destinationQuery;

            const scenicResult = await poiSkill.execute({
              query: scenicQuery,
              limit: 12,
              lat,
              lng,
              category: 'ATTRACTION',
            } as any);
            const generalResult = await poiSkill.execute({
              query: generalQuery,
              limit: 12,
              lat,
              lng,
            } as any);
            const scenicPois = Array.isArray(scenicResult?.pois)
              ? scenicResult.pois
              : Array.isArray(scenicResult)
                ? scenicResult
                : [];
            const generalPois = Array.isArray(generalResult?.pois)
              ? generalResult.pois
              : Array.isArray(generalResult)
                ? generalResult
                : [];
            let merged = mergeResearchPoiLists(scenicPois, generalPois, 16);
            if (plan.regionTags.includes('golden_circle') && plan.boostedTerms.length > 0) {
              const anchorQuery = `Iceland Golden Circle ${plan.boostedTerms.slice(0, 10).join(' ')}`;
              const anchorResult = await poiSkill.execute({
                query: anchorQuery,
                limit: 12,
                lat,
                lng,
                category: 'ATTRACTION',
              } as any);
              const anchorPois = Array.isArray(anchorResult?.pois)
                ? anchorResult.pois
                : Array.isArray(anchorResult)
                  ? anchorResult
                  : [];
              merged = mergeResearchPoiLists(anchorPois, merged, 22);
            }
            /** Phase 3.2：第四路专补 Geysir / Gullfoss 召回（合并优先） */
            if (plan.regionTags.includes('golden_circle')) {
              const pairResult = await poiSkill.execute({
                query: GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY,
                limit: 14,
                lat,
                lng,
                category: 'ATTRACTION',
              } as any);
              const pairPois = Array.isArray(pairResult?.pois)
                ? pairResult.pois
                : Array.isArray(pairResult)
                  ? pairResult
                  : [];
              merged = mergeResearchPoiLists(pairPois, merged, 30);
            }
            researchData.poi_evidence = merged;
            merged.forEach((poi: any) => {
              if (poi?.evidence_id) evidenceRefs.push(poi.evidence_id);
            });
          }
        } catch (error: any) {
          const strategy = getSkillFailureStrategy('poi.search', error);
          this.logger.warn(`[Claude Orchestrator] poi.search 失败: ${error?.message}`);
          if (strategy.shouldMarkMissing) {
            researchData.poi_evidence = { missing: true, error: error?.message };
          }
        }

        // 3. 开放时间查询（opening_hours.get）- IMPORTANT
        try {
          const openingHoursSkill = this.skillsRegistry.getSkill('opening_hours.get');
          if (openingHoursSkill && researchData.poi_evidence && !researchData.poi_evidence.missing) {
            // 提取 POI IDs（兼容新旧格式）
            let poiIds: string[] = [];
            if (Array.isArray(researchData.poi_evidence)) {
              poiIds = researchData.poi_evidence.slice(0, 5).map((poi: any) => 
                poi.poi_id || poi.id || poi.place_id
              ).filter(Boolean);
            } else if (researchData.poi_evidence.pois && Array.isArray(researchData.poi_evidence.pois)) {
              poiIds = researchData.poi_evidence.pois.slice(0, 5).map((poi: any) => 
                poi.poi_id || poi.id || poi.place_id
              ).filter(Boolean);
            }
            
            if (poiIds.length > 0) {
              const openingHoursResult = await openingHoursSkill.execute({
                poi_ids: poiIds,
              });
              researchData.opening_hours_evidence = openingHoursResult.opening_hours || openingHoursResult;
              
              // 提取证据引用
              if (openingHoursResult.opening_hours && Array.isArray(openingHoursResult.opening_hours)) {
                openingHoursResult.opening_hours.forEach((item: any) => {
                  if (item.evidence_id) evidenceRefs.push(item.evidence_id);
                });
              }
            }
          }
        } catch (error: any) {
          const strategy = getSkillFailureStrategy('opening_hours.get', error);
          this.logger.warn(`[Claude Orchestrator] opening_hours.get 失败: ${error?.message}`);
          if (strategy.shouldMarkMissing) {
            researchData.opening_hours_evidence = { missing: true, error: error?.message };
          }
        }

        // 4. DEM 指标（使用现有的 dem.get.profile）- OPTIONAL
        try {
          const demSkill = this.skillsRegistry.getSkill('dem.get.profile');
          if (demSkill && tripRequest.destination) {
            const demResult = await demSkill.execute({
              destination: tripRequest.destination,
            });
            researchData.dem_metrics = demResult;
          }
        } catch (error: any) {
          const strategy = getSkillFailureStrategy('dem.get.profile', error);
          if (strategy.shouldIgnore) {
            this.logger.debug(`[Claude Orchestrator] dem.get.profile 失败（已忽略）: ${error?.message}`);
          } else {
            this.logger.warn(`[Claude Orchestrator] dem.get.profile 失败: ${error?.message}`);
          }
        }

        // 5. 风险检查（使用现有的 geo.check.hazard.zones）- OPTIONAL
        try {
          const riskSkill = this.skillsRegistry.getSkill('geo.check.hazard.zones');
          if (riskSkill && tripRequest.destination) {
            // 如果目的地是坐标
            const coords = typeof tripRequest.destination === 'object' 
              ? tripRequest.destination 
              : undefined;
            
            if (coords) {
              const riskResult = await riskSkill.execute({
                lat: coords.lat,
                lng: coords.lng,
              });
              researchData.risk_assessment = riskResult;
            }
          }
        } catch (error: any) {
          const strategy = getSkillFailureStrategy('geo.check.hazard.zones', error);
          if (strategy.shouldIgnore) {
            this.logger.debug(`[Claude Orchestrator] geo.check.hazard.zones 失败（已忽略）: ${error?.message}`);
          } else {
            this.logger.warn(`[Claude Orchestrator] geo.check.hazard.zones 失败: ${error?.message}`);
          }
        }

        // 6. 领域智能体——世界模型数据
        await this.collectWorldModelData(tripRequest, researchData, evidenceRefs);

        // 7. 护城河扩展：预测数据（并行获取）
        await this.collectPredictionData(tripRequest, researchData, evidenceRefs, request);
      }

      state.research_data = researchData;

      state.decision_log.push({
        request_id: state.request_id,
        step: 'RESEARCH',
        actor: 'Orchestrator',
        inputs_summary: '开始数据收集',
        outputs_summary: `收集了 ${Object.keys(researchData).length} 类数据，证据数量: ${evidenceRefs.length}`,
        evidence_refs: evidenceRefs,
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          data_types: Object.keys(researchData),
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();

      // P0: 生成 Decision Step（Decision-First Engine 集成）
      await this.generateDecisionStepForStep(state, 'RESEARCH', 'LocalInsight');
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] RESEARCH 步骤失败: ${error?.message}`);
      throw error;
    }
  }

  /**
   * GATE_EVAL 步骤：执行 Should-Exist Gate 决策
   * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
   * 强制：Gate 在 Plan 之前执行
   * @deprecated 优先使用 Kernel.executeGateEval。此降级路径将逐步废弃，见 P3 阶段 D.2
   */
  private async executeGateEvalStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'GATE_EVAL';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 GATE_EVAL 步骤...`);

    try {
      // ========== 1. 准备度检查（新增） ==========
      let readinessCheckResult: any = null;
      let readinessBlockers: any[] = [];
      let readinessMust: any[] = [];
      let rulesNeedingDecision: any[] = [];

      if (this.readinessService && state.trip_plan_request) {
        try {
          const destination = typeof state.trip_plan_request.destination === 'string'
            ? state.trip_plan_request.destination
            : `${state.trip_plan_request.destination.lat},${state.trip_plan_request.destination.lng}`;

          // 构建 TripContext
          const tripContext = this.extractTripContextFromState(state);

          // 提取坐标（如果有）
          const geoLat = typeof state.trip_plan_request.destination === 'object'
            ? state.trip_plan_request.destination.lat
            : undefined;
          const geoLng = typeof state.trip_plan_request.destination === 'object'
            ? state.trip_plan_request.destination.lng
            : undefined;

          // 执行准备度检查
          readinessCheckResult = await this.readinessService.checkFromDestination(
            destination,
            tripContext,
            {
              enhanceWithGeo: !!(geoLat && geoLng),
              geoLat,
              geoLng,
              lang: 'zh', // 默认使用中文
            }
          );

          // 提取 blocker 和 must
          readinessBlockers = readinessCheckResult.findings.flatMap((f: any) => f.blockers || []);
          readinessMust = readinessCheckResult.findings.flatMap((f: any) => f.must || []);

          // 检查是否有需要用户决策的规则
          if (this.userDecisionService) {
            rulesNeedingDecision = [...readinessBlockers, ...readinessMust].filter((item: any) => {
              // 检查是否有 userDecision 且有问题列表
              return item.userDecision?.questions && item.userDecision.questions.length > 0;
            });
          }

          this.logger.debug(
            `[Claude Orchestrator] 准备度检查完成: ` +
            `blockers=${readinessBlockers.length}, ` +
            `must=${readinessMust.length}, ` +
            `需要用户决策=${rulesNeedingDecision.length}`
          );
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] 准备度检查失败: ${error?.message}`, error?.stack);
          // 准备度检查失败不影响 Gate 评估，继续执行
        }
      }

      // ========== 1.5. 护城河扩展：失败风险预测检查 ==========
      if (
        this.failureRiskPredictionService &&
        state.research_data?.failure_risk_prediction &&
        request.route_direction_id
      ) {
        try {
          const failureRiskPrediction = state.research_data.failure_risk_prediction;
          const highRiskDays = failureRiskPrediction.predictions.filter(
            (p: any) => p.riskLevel === 'HIGH',
          );

          if (highRiskDays.length > 0) {
            // 如果有高风险日期，添加到violations
            if (!readinessBlockers) {
              readinessBlockers = [];
            }
            readinessBlockers.push({
              type: 'FAILURE_RISK',
              severity: 'HARD',
              message: {
                zh: `预测到第${highRiskDays.map((d: any) => d.day).join(', ')}天存在高风险，建议调整行程日期`,
                en: `High risk predicted for days ${highRiskDays.map((d: any) => d.day).join(', ')}, consider adjusting dates`,
              },
              evidence: [
                {
                  sourceId: `failure_risk_prediction_${Date.now()}`,
                  source: 'FailureRiskPredictionService',
                },
              ],
            });

            this.logger.debug(
              `[Claude Orchestrator] 失败风险预测检查: 发现${highRiskDays.length}个高风险日期`,
            );
          }
        } catch (error: any) {
          this.logger.warn(
            `[Claude Orchestrator] 失败风险预测检查失败: ${error?.message}`,
            error?.stack,
          );
          // 失败风险预测检查失败不影响 Gate 评估，继续执行
        }
      }

      // ========== 2. 根据准备度检查结果决定 Gate 结果 ==========
      // 如果有 blocker 且不需要用户决策，直接 BLOCK
      if (readinessBlockers.length > 0 && rulesNeedingDecision.length === 0) {
        state.gate_result = {
          gate_result: 'BLOCK',
          violations: readinessBlockers.map((item: any) => ({
            type: 'SAFETY' as const,
            severity: 'HARD' as const,
            detail: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
            evidence_refs: item.evidence?.map((e: any) => e.sourceId) || [],
          })),
          required_adjustments: [],
          confidence: 0.9,
          evidence_refs: readinessBlockers.flatMap((item: any) => item.evidence?.map((e: any) => e.sourceId) || []),
        };

        // 生成准备度检查的决策日志条目（按三人格分类）
        if (this.readinessService) {
          const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(
            readinessCheckResult,
            state.request_id
          );
          state.decision_log.push(...readinessDecisionLogs);
        }

        // 添加汇总日志
        state.decision_log.push({
          request_id: state.request_id,
          step: 'GATE_EVAL',
          actor: 'Gatekeeper',
          inputs_summary: '评估行程可行性（准备度检查）',
          outputs_summary: `Gate 结果: BLOCK（准备度检查发现 ${readinessBlockers.length} 个阻塞项）`,
          evidence_refs: state.gate_result.evidence_refs || [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            readiness_blockers: readinessBlockers,
            guardian: 'ABU' as GuardianType,
          },
        });

        state.metadata.last_updated_at = new Date().toISOString();
        return;
      }

      // 如果有需要用户决策的规则，返回 NEED_USER_CONFIRM
      if (rulesNeedingDecision.length > 0) {
        state.gate_result = {
          gate_result: 'NEED_USER_CONFIRM',
          violations: [],
          required_adjustments: [],
          confidence: 0.8,
          evidence_refs: [],
          readiness_questions: rulesNeedingDecision.map((item: any) => ({
            ruleId: item.id,
            questions: item.userDecision.questions,
            category: item.category,
            severity: item.severity,
          })),
        };

        // 生成准备度检查的决策日志条目（按三人格分类）
        if (readinessCheckResult) {
          if (this.readinessService) {
            const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(
              readinessCheckResult,
              state.request_id
            );
            state.decision_log.push(...readinessDecisionLogs);
          }
        }

        // 添加用户决策汇总日志
        state.decision_log.push({
          request_id: state.request_id,
          step: 'GATE_EVAL',
          actor: 'Gatekeeper',
          inputs_summary: '评估行程可行性（准备度检查）',
          outputs_summary: `Gate 结果: NEED_USER_CONFIRM（需要用户回答 ${rulesNeedingDecision.length} 个规则的问题）`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            readiness_questions: rulesNeedingDecision.map((item: any) => ({
              ruleId: item.id,
              questionCount: item.userDecision.questions.length,
              category: item.category,
            })),
            guardian: 'ABU' as GuardianType,
          },
        });

        state.metadata.last_updated_at = new Date().toISOString();
        return;
      }

      // ========== 3. 调用 Gatekeeper Agent 执行其他 Gate 评估 ==========
      if (this.gatekeeperAgent && state.trip_plan_request) {
        const gateResult = await this.gatekeeperAgent.evaluateGate(
          state.trip_plan_request,
          state.research_data || {},
          state,
        );

        // 合并准备度检查的 must 项到 required_adjustments
        if (readinessMust.length > 0) {
          gateResult.required_adjustments = [
            ...gateResult.required_adjustments,
            ...readinessMust.map((item: any) => ({
              action: 'REPLACE_SEGMENT' as const, // 默认操作，实际应该根据规则类型调整
              why: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
              alternatives: [],
            })),
          ];

          // 如果有 must 项，确保 gate_result 是 ADJUST_REQUIRED
          if (gateResult.gate_result === 'ALLOW' && readinessMust.length > 0) {
            gateResult.gate_result = 'ADJUST_REQUIRED';
          }
        }

        state.gate_result = gateResult;
      } else {
        // 降级：使用默认 GateResult
        state.gate_result = {
          gate_result: readinessMust.length > 0 ? 'ADJUST_REQUIRED' : 'ALLOW',
          violations: [],
          required_adjustments: readinessMust.map((item: any) => ({
            action: 'REPLACE_SEGMENT' as const,
            why: typeof item.message === 'string' ? item.message : item.message.zh || item.message.en || '',
            alternatives: [],
          })),
          confidence: 0.8,
          evidence_refs: [],
        };
      }

      // ========== 4. 记录决策日志（包含准备度检查信息） ==========
      // 生成准备度检查的决策日志条目（按三人格分类）
      if (readinessCheckResult && this.readinessService) {
        const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(
          readinessCheckResult,
          state.request_id
        );
        state.decision_log.push(...readinessDecisionLogs);
      }

      const readinessSummary = readinessCheckResult
        ? `准备度: blockers=${readinessBlockers.length}, must=${readinessMust.length}`
        : '';

      state.decision_log.push({
        request_id: state.request_id,
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: `评估行程可行性${readinessSummary ? `（${readinessSummary}）` : ''}`,
        outputs_summary: `Gate 结果: ${state.gate_result.gate_result}, 置信度: ${state.gate_result.confidence}, 违规数: ${state.gate_result.violations.length}`,
        evidence_refs: state.gate_result.evidence_refs || [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          violations: state.gate_result.violations,
          adjustments: state.gate_result.required_adjustments,
          guardian: 'ABU' as GuardianType, // 三人格映射（Gatekeeper → Abu）
          readiness_check: readinessCheckResult
            ? {
                totalBlockers: readinessCheckResult.summary.totalBlockers,
                totalMust: readinessCheckResult.summary.totalMust,
                totalShould: readinessCheckResult.summary.totalShould,
                totalOptional: readinessCheckResult.summary.totalOptional,
              }
            : undefined,
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();

      // P0: 生成 Decision Step（Decision-First Engine 集成）
      await this.generateDecisionStepForStep(state, 'GATE_EVAL', 'Gatekeeper');
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] GATE_EVAL 步骤失败: ${error?.message}`);
      throw error;
    }
  }

  /**
   * 从 OrchestratorState 提取 TripContext
   * 
   * 用于准备度检查
   */
  private extractTripContextFromState(state: OrchestratorState): TripContext {
    const request = state.trip_plan_request;
    if (!request) {
      // 返回最小化的 TripContext
      return {
        traveler: {},
        trip: {},
        itinerary: {
          countries: [],
        },
      };
    }

    // 提取目的地国家代码
    const destination = typeof request.destination === 'string'
      ? request.destination
      : 'UNKNOWN';
    
    const countryCode = destination.split('-')[0] || destination.split(',')[0] || 'UNKNOWN';

    // 构建 TravelerProfile
    const traveler: TravelerProfile = {
      nationality: undefined, // 可以从 request 或其他地方提取
      residencyCountry: undefined,
      tags: [],
      budgetLevel: request.constraints?.budget?.total
        ? request.constraints.budget.total > 5000
          ? 'high'
          : request.constraints.budget.total > 2000
          ? 'medium'
          : 'low'
        : undefined,
      riskTolerance: undefined,
    };

    // 构建 ItineraryInfo
    const itinerary: ItineraryInfo = {
      countries: [countryCode],
      activities: [], // 可以从 research_data 或其他地方提取
      season: request.date_range?.start_date
        ? this.extractSeason(request.date_range.start_date)
        : undefined,
    };

    // 构建 TripContext
    return {
      traveler,
      trip: {
        startDate: request.date_range?.start_date || request.start_date,
        endDate: request.date_range?.end_date,
      },
      itinerary,
    };
  }

  /**
   * 从日期提取季节
   */
  private extractSeason(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const month = date.getMonth() + 1; // 0-11 -> 1-12

      // 简化版季节判断（北半球）
      if (month >= 3 && month <= 5) return 'spring';
      if (month >= 6 && month <= 8) return 'summer';
      if (month >= 9 && month <= 11) return 'autumn';
      return 'winter';
    } catch {
      return 'all';
    }
  }

  /**
   * CONTEXT_BUILD 步骤：Phase 2.3 在 PLAN 前构建 Context Package
   * P3 A.2: 经 Kernel.executeContextBuild 封装
   */
  private async executeContextBuildStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) return decisionState;

    state.current_step = 'CONTEXT_BUILD';
    const stepStartTime = Date.now();
    this.logger.debug(`[Claude Orchestrator] 执行 CONTEXT_BUILD 步骤...`);

    const tripId = state.metadata?.tripId as string | undefined;
    const destinationCountryCode =
      !tripId && request.message
        ? this.extractCountryCodeFromMessage(request.message)
        : undefined;
    const overrides = {
      tripId,
      userId: state.metadata?.userId as string | undefined,
      userQuery: request.message,
      phase: 'PLANNING' as const,
      agent: 'PLANNER' as const,
      destinationCountryCode,
    };

    try {
      const { newState, contextPackage: pkg } = await this.decisionKernel.executeContextBuild(decisionState, overrides);
      state.decision_log.push({
        request_id: state.request_id,
        step: 'CONTEXT_BUILD' as OrchestrationStep,
        actor: 'Orchestrator' as SubAgentType,
        inputs_summary: 'DSO + userQuery',
        outputs_summary: pkg ? `Context 已构建: blocks=${(pkg as any).blocks?.length ?? 0}` : '跳过（无 ContextEngineer）',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      return newState;
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] CONTEXT_BUILD 失败: ${error?.message}`);
      state.decision_log.push({
        request_id: state.request_id,
        step: 'CONTEXT_BUILD' as OrchestrationStep,
        actor: 'Orchestrator' as SubAgentType,
        inputs_summary: 'DSO',
        outputs_summary: `失败: ${error?.message}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime, error: true },
      });
      state.metadata.last_updated_at = new Date().toISOString();
      return decisionState;
    }
  }

  /**
   * P1: Itinerary → TdfpmDayContext 简化转换（至少 drivingHours）
   */
  private itineraryToTdfpmDayContexts(itinerary: Itinerary): TdfpmDayContext[] {
    const contexts: TdfpmDayContext[] = [];
    for (const day of itinerary.days || []) {
      let drivingHours = 0;
      let departureHour = 8;
      for (const item of day.items || []) {
        const mins = item.metadata?.duration_minutes;
        if (mins != null && (item.type === 'DRIVE' || item.type === 'TRANSIT')) {
          drivingHours += mins / 60;
        } else if (mins != null && item.type === 'WALK') {
          drivingHours += (mins / 60) * 0.3;
        }
        if (item.start_window) {
          const m = item.start_window.match(/(\d{1,2}):(\d{2})|T(\d{2})/);
          if (m) departureHour = parseInt(m[1] ?? m[3] ?? '8', 10);
        }
      }
      if (drivingHours === 0 && day.items?.length) {
        drivingHours = 2;
      }
      contexts.push({
        drivingHours: Math.min(drivingHours, 12),
        roadType: 'highway',
        departureHour,
      });
    }
    return contexts;
  }

  /**
   * OPTIMIZE 步骤：Phase 2.3 抽取 Optimization Hints
   * P3 A.3: 经 Kernel.executeOptimize 封装；TDFPM fatigue 由 Orchestrator 预计算后传入
   */
  private async executeOptimizeStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) return decisionState;

    state.current_step = 'OPTIMIZE';
    const stepStartTime = Date.now();
    this.logger.debug(`[Claude Orchestrator] 执行 OPTIMIZE 步骤...`);

    // TDFPM: 预计算 fatigue 传入 Kernel（Kernel 无 TdfpmCalculator 依赖）
    let fatigue: number | undefined;
    const planDraft = decisionState.tripState?.planDraft as Itinerary | undefined;
    if (planDraft?.days?.length && this.tdfpmCalculator) {
      try {
        const contexts = this.itineraryToTdfpmDayContexts(planDraft);
        const scores = contexts.map((ctx) => this.tdfpmCalculator!.computeFatigueScore(ctx).fatigueScore);
        const maxScore = Math.max(...scores, 0);
        fatigue = Math.min(1, maxScore / 100);
        this.logger.debug(`[Claude Orchestrator] TDFPM fatigue: maxScore=${maxScore}, fatigue=${fatigue.toFixed(2)}`);
      } catch (e: any) {
        this.logger.warn(`[Claude Orchestrator] TDFPM 计算失败: ${e?.message}`);
      }
    }

    const { newState, optimizationHints: hints } = await this.decisionKernel.executeOptimize(decisionState, {
      fatigue,
    });

    const summarizeOptimizeOutputs = (): string => {
      if (!hints) return '无 Hints';
      const eu = hints.expectedUtility;
      const fp = hints.feasibilityProbability;
      const ci = hints.confidenceInterval;
      const rec = hints.recommendedAlternativeId ?? 'N/A';
      const altN = hints.alternatives?.length ?? 0;
      return [
        `method=${hints.method ?? 'N/A'}`,
        `recommended=${rec}`,
        `alts=${altN}`,
        eu !== undefined ? `E[U]=${eu.toFixed(3)}` : undefined,
        fp !== undefined ? `P(feasible)=${fp.toFixed(2)}` : undefined,
        ci ? `CI95=[${ci.lower.toFixed(2)},${ci.upper.toFixed(2)}]` : undefined,
        hints.strategyDirection ? `dir=${hints.strategyDirection}` : undefined,
      ]
        .filter(Boolean)
        .join(' | ');
    };

    state.decision_log.push({
      request_id: state.request_id,
      step: 'OPTIMIZE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: 'DSO (environmentState, tripState)',
      outputs_summary: summarizeOptimizeOutputs(),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        guardian: 'DR_DRE',
        alternatives_considered: hints?.alternatives?.length ?? undefined,
        expected_utility: hints?.expectedUtility,
        feasibility_probability: hints?.feasibilityProbability,
        optimization_method: hints?.method,
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    return newState;
  }

  /**
   * PLAN_GEN 步骤：生成结构化行程草案
   * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
   * @deprecated 优先使用 Kernel.executePlanGen。此降级路径将逐步废弃，见 P3 阶段 D.2
   */
  private async executePlanGenStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'PLAN_GEN';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 PLAN_GEN 步骤...`);

    try {
      // 调用 itinerary.generate Skill 生成行程
      if (this.skillsRegistry && state.trip_plan_request) {
        try {
          const itinerarySkill = this.skillsRegistry.getSkill('itinerary.generate');
          if (itinerarySkill) {
            const itineraryResult = await itinerarySkill.execute({
              request: state.trip_plan_request,
              research_data: state.research_data,
              gate_result: state.gate_result,
            });
            // 类型转换：Skill 返回的结果需要转换为 Itinerary
            if (itineraryResult && typeof itineraryResult === 'object' && 'request_id' in itineraryResult && 'days' in itineraryResult) {
              state.itinerary = itineraryResult as Itinerary;
            } else {
              // 降级：生成空行程
              state.itinerary = {
                request_id: state.request_id,
                days: [],
              };
            }
          } else {
            // 降级：生成空行程
            state.itinerary = {
              request_id: state.request_id,
              days: [],
            };
          }
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] itinerary.generate 失败: ${error?.message}`);
          // 降级：生成空行程
          state.itinerary = {
            request_id: state.request_id,
            days: [],
          };
        }
      } else {
        // 降级：生成空行程
        state.itinerary = {
          request_id: state.request_id,
          days: [],
        };
      }

      state.decision_log.push({
        request_id: state.request_id,
        step: 'PLAN_GEN',
        actor: 'Planner',
        inputs_summary: '生成行程草案',
        outputs_summary: `生成了 ${state.itinerary.days.length} 天的行程`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();

      // P0: 生成 Decision Step（Decision-First Engine 集成）
      await this.generateDecisionStepForStep(state, 'PLAN_GEN', 'Planner');

      // Iterative Deployment: 收集轨迹（PLAN_GEN 完成后）
      if (this.trajectoryCollection && state.itinerary && state.gate_result) {
        try {
          const context = request as any; // 获取 context
          const tripId = context.trip_id || undefined;
          const countryCode = state.trip_plan_request?.destination 
            ? (typeof state.trip_plan_request.destination === 'string' 
                ? undefined 
                : undefined) // TODO: 从 destination 提取 countryCode
            : undefined;

          // 如果没有 compliance_result，生成一个默认的（从 gate_result 推导）
          let complianceResult = state.compliance_result;
          if (!complianceResult && this.complianceAgent && state.itinerary) {
            try {
              complianceResult = await this.complianceAgent.checkCompliance(
                state.itinerary,
                state.gate_result,
                state,
              );
            } catch (error: any) {
              this.logger.warn(`[Claude Orchestrator] Compliance 检查失败，使用默认值: ${error?.message}`);
              // 使用默认的 compliance result
              complianceResult = {
                risk_warnings: [],
                disclaimers: [],
                required_confirmations: [],
              };
            }
          } else if (!complianceResult) {
            // 如果没有 complianceAgent，使用默认值
            complianceResult = {
              risk_warnings: [],
              disclaimers: [],
              required_confirmations: [],
            };
          }

          await this.trajectoryCollection.collectTrajectory({
            requestId: state.request_id,
            tripId,
            plan: state.itinerary,
            decisionTrace: state.decision_log,
            researchData: state.research_data || {},
            gateResult: state.gate_result,
            complianceResult: complianceResult as any,
            modelVersion: 'v1.0', // TODO: 从配置或上下文获取
            countryCode,
          });
          this.logger.debug(`[Claude Orchestrator] 轨迹已收集: requestId=${state.request_id}`);
        } catch (error: any) {
          // 轨迹收集失败不应该影响主流程
          this.logger.warn(`[Claude Orchestrator] 轨迹收集失败: ${error?.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] PLAN_GEN 步骤失败: ${error?.message}`);
      throw error;
    }
  }

  /**
   * VERIFY 步骤：验证开放时间冲突/换乘 buffer/可达性/疲劳阈值
   * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
   * @deprecated 优先使用 Kernel.executeVerify。此降级路径将逐步废弃，见 P3 阶段 D.2
   */
  private async executeVerifyStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'VERIFY';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 VERIFY 步骤...`);

    try {
      const verificationIssues: string[] = [];

      // 调用验证 Skills（itinerary.verify）
      if (this.skillsRegistry && state.itinerary) {
        try {
          const verifySkill = this.skillsRegistry.getSkill('itinerary.verify');
          if (verifySkill) {
            const verifyResult = await verifySkill.execute({
              itinerary: state.itinerary,
              research_data: state.research_data,
            });
            
            if (verifyResult?.issues && Array.isArray(verifyResult.issues)) {
              verificationIssues.push(...verifyResult.issues);
            }
          }
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] itinerary.verify 失败: ${error?.message}`);
        }
      }

      // 记录验证结果
      if (verificationIssues.length > 0) {
        state.errors.push({
          step: 'VERIFY',
          error_code: 'VERIFICATION_ISSUES',
          message: `发现 ${verificationIssues.length} 个验证问题`,
          timestamp: new Date().toISOString(),
        });
      }

      state.decision_log.push({
        request_id: state.request_id,
        step: 'VERIFY',
        actor: 'Orchestrator',
        inputs_summary: '验证行程可行性',
        outputs_summary: verificationIssues.length > 0 
          ? `发现 ${verificationIssues.length} 个问题` 
          : '验证通过',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          issues: verificationIssues,
          guardian: 'DR_DRE' as GuardianType, // P1 改进：三人格映射（VERIFY → Dr.Dre，节奏与体感验证）
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();

      // P0: 生成 Decision Step（Decision-First Engine 集成）
      await this.generateDecisionStepForStep(state, 'VERIFY', 'CoreDecision');
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] VERIFY 步骤失败: ${error?.message}`);
      state.errors.push({
        step: 'VERIFY',
        error_code: 'VERIFICATION_ERROR',
        message: error?.message || '验证失败',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * REPAIR 步骤：替换POI/改路线/加buffer/换交通/降级
   * 降级路径：KERNEL_NATIVE_EXECUTION=false 时由 executePhaseViaKernel 调用
   * @deprecated 优先使用 Kernel.executeRepair。此降级路径将逐步废弃，见 P3 阶段 D.2
   */
  private async executeRepairStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'REPAIR';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 REPAIR 步骤...`);

    try {
      let repairApplied = false;
      const repairActions: string[] = [];

      // 1. 调用 LocalInsight Agent 生成替代方案
      if (this.localInsightAgent && state.trip_plan_request && state.gate_result) {
        try {
          const alternatives = await this.localInsightAgent.suggestAlternatives(
            state.trip_plan_request,
            state.gate_result,
            state,
          );
          
          if (alternatives.alternative_pois.length > 0 || alternatives.alternative_routes.length > 0) {
            repairApplied = true;
            repairActions.push(`生成了 ${alternatives.alternative_pois.length} 个替代 POI 和 ${alternatives.alternative_routes.length} 条替代路线`);
            state.alternatives = alternatives;
          }
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] LocalInsight Agent 失败: ${error?.message}`);
        }
      }

      // 2. 调用 repair.apply Skill 应用修复
      if (this.skillsRegistry && state.itinerary && state.gate_result) {
        try {
          const repairSkill = this.skillsRegistry.getSkill('repair.apply');
          if (repairSkill && state.gate_result.required_adjustments.length > 0) {
            const repairResult = await repairSkill.execute({
              itinerary: state.itinerary,
              adjustments: state.gate_result.required_adjustments,
              alternatives: state.alternatives,
            });
            
            if (repairResult?.repaired) {
              repairApplied = true;
              repairActions.push('已应用修复方案');
              state.itinerary = repairResult.itinerary;
            }
          }
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] repair.apply 失败: ${error?.message}`);
        }
      }

      state.decision_log.push({
        request_id: state.request_id,
        step: 'REPAIR',
        actor: 'LocalInsight',
        inputs_summary: '修复行程问题',
        outputs_summary: repairApplied 
          ? repairActions.join('；') 
          : '无需修复或修复失败',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          repair_applied: repairApplied,
          guardian: 'NEPTUNE' as GuardianType, // P1 改进：三人格映射（REPAIR → Neptune，空间结构修复）
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();

      // P0: 生成 Decision Step（Decision-First Engine 集成）
      await this.generateDecisionStepForStep(state, 'REPAIR', 'LocalInsight');
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] REPAIR 步骤失败: ${error?.message}`);
      state.errors.push({
        step: 'REPAIR',
        error_code: 'REPAIR_ERROR',
        message: error?.message || '修复失败',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * NARRATE 步骤：产出用户可读解释（不得改硬字段）
   * P3 C: 优先经 Kernel.executeNarrate（NarrateExecutor 封装 NarratorAgent），否则降级到直接调用
   */
  private async executeNarrateStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    _provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'NARRATE';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 NARRATE 步骤...`);

    try {
      if (this.decisionKernel && state.itinerary && state.gate_result) {
        const narrateCtx: import('../../decision/kernel/interfaces/phase-executor.interface').NarrateExecutorContext = {
          requestId: state.request_id,
          userId: request.user_id,
          orchestratorState: state,
        };
        const dso = this.decisionKernel.createInitialState(state.request_id, {
          evaluationRunId: request.meta?.run_id,
        });
        const result = await this.decisionKernel.executeNarrate(dso, narrateCtx);
        state.narration = result.narration as any;
      } else {
        // P3 D.1: 降级路径统一为空叙述，不再直接调用 narratorAgent
        state.narration = {
          user_friendly_summary: '',
          day_by_day_narrative: [],
          highlights: [],
          tips: [],
        };
      }

      state.decision_log.push({
        request_id: state.request_id,
        step: 'NARRATE',
        actor: 'Narrator',
        inputs_summary: '生成用户可读解释',
        outputs_summary: state.narration 
          ? `已生成 ${state.narration?.day_by_day_narrative?.length || 0} 天的叙述` 
          : '已生成行程说明',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] NARRATE 步骤失败: ${error?.message}`);
      // Narrate 失败不影响整体流程，记录错误但继续
      state.errors.push({
        step: 'NARRATE',
        error_code: 'NARRATION_ERROR',
        message: error?.message || '叙述生成失败',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * FEEDBACK 步骤：专利反馈学习模块，记录决策日志
   * P3 A.4: 经 Kernel.executeFeedback 封装
   */
  private async executeFeedbackStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined> {
    if (!this.decisionKernel || !decisionState) return decisionState;

    state.current_step = 'FEEDBACK';
    const patch = this.isDsoAsPrimary()
      ? buildPatchFromDSOPrimary(decisionState, state)
      : orchestratorStateToDecisionStatePatch(state);

    const { newState: synced } = await this.decisionKernel.executeFeedback(decisionState, patch);

    state.decision_log.push({
      request_id: state.request_id,
      step: 'FEEDBACK' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: 'DSO 决策日志写入 RLHF',
      outputs_summary: `已记录: confidence=${synced.confidence ?? 'N/A'}, version=${synced.systemState?.version ?? 'N/A'}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
    });
    state.metadata.last_updated_at = new Date().toISOString();

    return synced;
  }

  /**
   * 步骤 8: HALLUCINATION_DETECTION - 防幻觉检测
   */
  private async executeHallucinationDetectionStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
  ): Promise<void> {
    if (!this.hallucinationDetection) {
      this.logger.debug(`[Claude Orchestrator] HallucinationDetectionService 未注入，跳过防幻觉检测`);
      return;
    }

    const stepStartTime = Date.now();
    this.logger.debug(`[Claude Orchestrator] 执行 HALLUCINATION_DETECTION 步骤...`);

    try {
      // 对narration进行防幻觉检测
      if (state.narration) {
        const detectionResult = await this.hallucinationDetection.detectHallucinations(
          state.narration,
          context,
        );

        // 使用清理后的输出
        if (detectionResult.cleanedOutput) {
          state.narration = detectionResult.cleanedOutput as any;
        }

        // 如果有幻觉风险，记录警告
        if (detectionResult.hallucinationRisks.length > 0) {
          // 在state中添加warnings字段（如果不存在）
          if (!state.metadata.warnings) {
            state.metadata.warnings = [];
          }

          (state.metadata.warnings as any[]).push({
            type: 'HALLUCINATION_RISK',
            message: detectionResult.userNotification.message,
            items: detectionResult.hallucinationRisks.map(r => ({
              text: r.text,
              confidence: r.confidence,
              action: r.action,
            })),
          });

          this.logger.warn(
            `[Claude Orchestrator] 检测到 ${detectionResult.hallucinationRisks.length} 个幻觉风险`,
          );
        }

        // 记录决策日志
        state.decision_log.push({
          request_id: state.request_id,
          step: 'HALLUCINATION_DETECTION',
          actor: 'HallucinationDetection',
          inputs_summary: '检测LLM生成内容中的事实声明',
          outputs_summary: `检测到 ${detectionResult.statistics.totalClaims} 个声明，${detectionResult.statistics.verifiedClaims} 个已验证，${detectionResult.statistics.hallucinationRisks} 个幻觉风险`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            statistics: detectionResult.statistics,
          },
        });
      }

      state.metadata.last_updated_at = new Date().toISOString();
    } catch (error: any) {
      this.logger.error(
        `[Claude Orchestrator] HALLUCINATION_DETECTION 步骤失败: ${error?.message}`,
      );
      // 防幻觉检测失败不影响整体流程，记录错误但继续
      state.errors.push({
        step: 'HALLUCINATION_DETECTION',
        error_code: 'HALLUCINATION_DETECTION_ERROR',
        message: error?.message || '防幻觉检测失败',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 生成 Decision Step（P0: Decision-First Engine 集成）
   * 
   * 在每个状态机步骤执行后调用，生成对应的业务层决策步骤
   */
  private async generateDecisionStepForStep(
    state: OrchestratorState,
    orchestrationStep: OrchestrationStep,
    subAgent?: SubAgentType,
  ): Promise<void> {
    if (!this.decisionDraftGenerator) {
      // DecisionDraftGenerator 未注入时静默跳过
      return;
    }

    try {
      const decisionStep = await this.decisionDraftGenerator.generateDecisionStepFromOrchestrationState(
        state,
        orchestrationStep,
        subAgent,
      );

      if (decisionStep) {
        // 初始化 decision_steps 数组（如果不存在）
        if (!state.decision_steps) {
          state.decision_steps = [];
        }
        state.decision_steps.push(decisionStep);
        this.logger.debug(`[Claude Orchestrator] 生成 Decision Step: type=${decisionStep.type}, step=${orchestrationStep}`);
      }
    } catch (error: any) {
      // Decision Step 生成失败不应阻塞主流程
      this.logger.warn(`[Claude Orchestrator] Decision Step 生成失败，跳过: ${error?.message}`);
    }
  }

  /**
   * 格式化澄清问题为简单字符串（向后兼容）
   * 
   * 将结构化澄清问题转换为简单的文本格式，用于向后兼容
   */
  private formatClarificationMessage(questions?: ClarificationQuestion[]): string {
    if (!questions || questions.length === 0) {
      return '';
    }

    const messages: string[] = [];
    messages.push('为了更好地规划您的行程，请回答以下问题：\n');

    questions.forEach((q, index) => {
      messages.push(`${index + 1}. ${q.question}`);
      if (q.hint) {
        messages.push(`   ${q.hint}`);
      }
      if (q.options && q.options.length > 0) {
        const optionLabels = q.options.map((opt: any) =>
          typeof opt === 'string' ? opt : opt?.label || opt?.value || String(opt),
        );
        messages.push(`   选项：${optionLabels.join('、')}`);
      }
      messages.push('');
    });

    return messages.join('\n');
  }

  private violationTypeToCn(type: string): string {
    const t = String(type || '').toUpperCase();
    if (t === 'REACHABILITY') return '准入类';
    if (t === 'SCOPE') return '空间类';
    if (t === 'SAFETY') return '安全类';
    if (t === 'FAILURE_RISK') return '风险类';
    return type;
  }

  /**
   * 构建成功结果
   * @param decisionState DSO（含 confidence/history/decisionMeta），供 RLHF/分析/前端使用
   */
  private buildSuccessResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
  ): OrchestrationResult {
    const hasClarificationQuestions = state.clarification_questions && state.clarification_questions.length > 0;
    this.finalizeHarnessTraceFromOrchestration(
      decisionState,
      hasClarificationQuestions ? 'NEED_USER_CONFIRM' : 'DONE',
    );

    // 如果有澄清问题，说明需要用户提供更多信息
    const answerText = hasClarificationQuestions
      ? '为了更好地规划您的行程，请回答以下问题。'
      : (state.itinerary
        ? `已为您生成 ${state.itinerary.days.length} 天的行程安排。`
        : '处理完成。');

    this.logger.log(`[Claude Orchestrator] 构建成功结果: decision_log.length=${state.decision_log.length}, current_step=${state.current_step}`);

    return {
      success: !hasClarificationQuestions, // 如果有澄清问题，success 为 false（需要用户输入）
      result: {
        state,
        itinerary: state.itinerary,
        gate_result: state.gate_result,
        decision_log: state.decision_log,
        // Phase 2.5: DSO 供 RLHF/模型评估/异常检测
        ...(decisionState && { decisionState }),
        // 如果有澄清问题，填充到结果中
        ...(hasClarificationQuestions && state.clarification_questions ? {
          needsUserConfirmation: true,
          clarificationQuestions: state.clarification_questions,
          // 向后兼容：生成简单字符串格式的澄清消息
          clarificationMessage: this.formatClarificationMessage(state.clarification_questions),
        } : {}),
      },
      answerText,
      stepsExecuted: state.decision_log.map(log => ({
        stepId: log.step,
        success: true,
        duration: log.metadata?.duration_ms || 0,
      })),
      totalDuration: Date.now() - startTime,
      decisionLog: state.decision_log,
    };
  }

  /**
   * 构建被阻止的结果
   */
  private buildBlockedResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
  ): OrchestrationResult {
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'BLOCKED');
    const violations = state.gate_result?.violations || [];
    const answerText = `行程规划被阻止。原因：${violations.map(v => v.detail).join('；')}`;

    // 如果有澄清问题，也包含在结果中（虽然被阻止，但可能需要用户提供替代方案）
    const hasClarificationQuestions = state.clarification_questions && state.clarification_questions.length > 0;

    return {
      success: false,
      result: {
        state,
        gate_result: state.gate_result,
        decision_log: state.decision_log,
        ...(decisionState && { decisionState }),
        // 如果有澄清问题，填充到结果中
        ...(hasClarificationQuestions && state.clarification_questions ? {
          needsUserConfirmation: true,
          clarificationQuestions: state.clarification_questions,
          clarificationMessage: this.formatClarificationMessage(state.clarification_questions),
        } : {}),
      },
      answerText,
      stepsExecuted: state.decision_log.map(log => ({
        stepId: log.step,
        success: true,
        duration: log.metadata?.duration_ms || 0,
      })),
      totalDuration: Date.now() - startTime,
      decisionLog: state.decision_log,
    };
  }

  /**
   * 构建澄清结果（需要用户提供更多信息）
   */
  private buildClarificationResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
  ): OrchestrationResult {
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'NEED_USER_CONFIRM');
    const answerText = '为了更好地规划您的行程，请回答以下问题。';

    return {
      success: false, // 需要用户输入，所以 success 为 false
      result: {
        state,
        needsUserConfirmation: true,
        clarificationQuestions: state.clarification_questions || [],
        clarificationMessage: this.formatClarificationMessage(state.clarification_questions || []),
        gaps: state.gaps,
      },
      answerText,
      stepsExecuted: state.decision_log.map(log => ({
        stepId: log.step,
        success: true,
        duration: log.metadata?.duration_ms || 0,
      })),
      totalDuration: Date.now() - startTime,
      decisionLog: state.decision_log,
    };
  }

  /**
   * 构建错误结果
   */
  private buildErrorResult(
    state: OrchestratorState,
    error: any,
    startTime: number,
    decisionState?: DecisionState,
  ): OrchestrationResult {
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'FAILED');
    // 🆕 检查是否是超时错误
    const isTimeout = error?.message?.startsWith('TIMEOUT:') || 
                      error?.code === 'ECONNABORTED' ||
                      state.current_step === 'TIMEOUT';
    
    const answerText = isTimeout
      ? `请求超时，已执行到步骤: ${state.current_step}。请缩小范围或稍后重试。`
      : `处理过程中出现错误：${error?.message || '未知错误'}`;
    
    this.logger.log(`[Claude Orchestrator] 构建错误结果: current_step=${state.current_step}, decision_log.length=${state.decision_log.length}, isTimeout=${isTimeout}`);
    
    return {
      success: false,
      result: {
        state,
        errors: state.errors,
        errorType: isTimeout ? 'TIMEOUT_ERROR' as any : undefined,
        ...(decisionState && { decisionState }),
      },
      answerText,
      stepsExecuted: state.decision_log.map(log => ({
        stepId: log.step,
        success: log.step !== 'FAILED' && log.step !== 'TIMEOUT',
        duration: log.metadata?.duration_ms || 0,
      })),
      totalDuration: Date.now() - startTime,
      decisionLog: state.decision_log, // 🆕 确保决策日志被包含
    };
  }

  private buildTerminalNoSolutionResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
  ): OrchestrationResult {
    this.finalizeHarnessTraceFromOrchestration(decisionState, 'FAILED');

    const tf = decisionState?.systemState?.planGenTerminalFailure;
    const violations = (decisionState as any)?.constraints?.violations ?? state.gate_result?.violations ?? [];
    const vStr = Array.isArray(violations)
      ? violations
          .slice(0, 3)
          .map((v: any) => `${v?.type ?? 'CONSTRAINT'}: ${v?.detail ?? ''}`.trim())
          .filter(Boolean)
          .join('；')
      : '';

    const answerText =
      `基于您的确认，系统已停止规划（CONSENSUS_REACHED: NO_FEASIBLE_PATH）。` +
      `在不放宽约束（加天数/换车/删必去点）的前提下，当前物理/业务冲突不可逾越。` +
      (tf?.message ? ` 终止原因：${tf.message}.` : '') +
      (vStr ? ` 冲突摘要：${vStr}` : '');

    // If user terminates early (accept_no_solution), we may not have reached the RESEARCH-stage
    // PREDICTIVE_FAILURE_REPORT emission. Synthesize it from INTAKE simulation so the terminal
    // audit can still carry drift_vector / session_consistency_score for LogicOps.
    try {
      const existingEw = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
      const hasPfr = Boolean((existingEw as any)?.predictive_failure_report);
      const intakeSim = (state.metadata as any)?.intake_simulation as
        | { simulatedRepairTraces?: import('../services/route-feasibility.types').SimulatedRepairTrace[] }
        | undefined;
      const simTraces = intakeSim?.simulatedRepairTraces ?? [];
      if (!hasPfr && Array.isArray(simTraces) && simTraces.length > 0) {
        const predictive_failure_report = {
          card_type: 'PREDICTIVE_FAILURE_REPORT' as const,
          correlationId: undefined as unknown as string | undefined,
          audit_text: formatPredictiveFailureReport(simTraces),
          simulated_repair_traces: simTraces,
        };
        const mergedEw: EarlyWarning = existingEw
          ? { ...existingEw, predictive_failure_report }
          : {
              early_warning_id: `pred-${state.request_id}`,
              risk_level: 'MEDIUM',
              conflict_type: 'MIXED',
              evidence_summary: 'INTAKE_PREDICTIVE_SIMULATION',
              suggested_actions: [],
              predictive_failure_report,
            };
        (state.metadata as any) = { ...(state.metadata ?? {}), early_warning: mergedEw };
      }
    } catch {
      // best-effort only
    }

    const audit_report = AuditReportGenerator.generate(decisionState, state);

    // Observability: record session consistency score for dashboards / alerts
    try {
      const score = (audit_report as any)?.session_consistency_score;
      if (typeof score === 'number') {
        this.promMetrics?.recordSessionConsistencyScore({
          score,
          dominant_cid: (audit_report as any)?.dominant_cid,
          phase: 'REPAIR',
        });
      }
    } catch {
      // best-effort only
    }

    // Observability (Logs): emit a single atomic audit event for Loki drill-down.
    // Important: only emit on terminal reports to avoid I/O explosion.
    try {
      const drift = (audit_report as any)?.predictive_feedback_then_repair?.drift_vector;
      const deltaReason = String(drift?.delta_reason ?? '').trim();
      const deltaUtility = Number(drift?.delta_utility);
      const delta_reason_kind =
        deltaReason === 'aligned' ? ('aligned' as const) : deltaReason ? ('mismatch' as const) : ('unknown' as const);
      const is_intent_revised = Boolean((audit_report as any)?.predictive_feedback_then_repair?.intent_revision_flag);
      const utility_drift_severity = (() => {
        if (!Number.isFinite(deltaUtility)) return 'unknown' as const;
        const a = Math.abs(deltaUtility);
        if (a <= 5) return 'low' as const;
        if (a <= 20) return 'medium' as const;
        return 'high' as const;
      })();

      const payload = {
        event: 'decision_os_audit_report',
        request_id: state.request_id,
        dominant_cid: (audit_report as any)?.dominant_cid,
        session_consistency_score: (audit_report as any)?.session_consistency_score,
        delta_reason_kind,
        is_intent_revised,
        utility_drift_severity,
        audit_report,
      };
      this.logger.log(JSON.stringify(payload));
    } catch {
      // best-effort only
    }

    // In-Memory Precedents (CBR): 异步抽取并聚合 gold_sample 到本地判例库（不阻塞返回）
    if (this.localCaseStore) {
      Promise.resolve()
        .then(() => {
          const rec = auditReportToCaseRecord({ audit_report: audit_report as any, request_id: state.request_id });
          if (rec) this.localCaseStore!.saveCase(rec);
        })
        .catch(() => undefined);
    }

    if (this.cbrAggregator) {
      void this.cbrAggregator
        .ingestAuditReport(audit_report as any, state.request_id)
        .catch((err) =>
          this.logger.warn(
            `CBR background ingest failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    return {
      success: false,
      result: {
        state,
        needsUserConfirmation: false,
        terminal: {
          type: 'TERMINAL_NO_SOLUTION',
          planGenTerminalFailure: tf,
          violations,
          audit_report,
        } as any,
        ...(decisionState && { decisionState }),
      } as any,
      answerText,
      stepsExecuted: state.decision_log.map((log) => ({
        stepId: log.step,
        success: true,
        duration: log.metadata?.duration_ms || 0,
      })),
      totalDuration: Date.now() - startTime,
      decisionLog: state.decision_log,
    };
  }

  /**
   * 收集世界模型数据（通过 Domain Agents）
   */
  private async collectWorldModelData(
    tripRequest: TripPlanRequest,
    researchData: Record<string, any>,
    evidenceRefs: string[],
  ): Promise<void> {
    this.logger.debug(`[Orchestrator] Collecting world model data via Domain Agents`);
    const promises: Promise<void>[] = [];

    // GeoAgent
    if (this.geoAgent && typeof tripRequest.destination === 'object') {
      const coords = tripRequest.destination;
      promises.push(
        this.geoAgent.analyzeTerrain([{ lat: coords.lat, lng: coords.lng }])
          .then(r => { researchData.geo_terrain = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
          .catch(e => this.logger.warn(`[GeoAgent] Failed: ${e?.message}`))
      );
    }

    // WeatherAgent
    if (this.weatherAgent && typeof tripRequest.destination === 'object' && tripRequest.date_range) {
      const coords = tripRequest.destination;
      promises.push(
        this.weatherAgent.getForecast(
          { lat: coords.lat, lng: coords.lng },
          { start: tripRequest.date_range.start_date, end: tripRequest.date_range.end_date }
        ).then(r => { researchData.weather_forecast = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
          .catch(e => this.logger.warn(`[WeatherAgent] Failed: ${e?.message}`))
      );
    }

    // CostAgent
    if (this.costAgent && tripRequest.destination && tripRequest.date_range) {
      const dest = typeof tripRequest.destination === 'string' ? tripRequest.destination : 'destination';
      promises.push(
        this.costAgent.estimateTripCost(
          dest,
          { start: tripRequest.date_range.start_date, end: tripRequest.date_range.end_date },
          tripRequest.party?.count || 2
        ).then(r => { researchData.cost_estimate = r; r.evidence.forEach(e => evidenceRefs.push(e.evidence_id)); })
          .catch(e => this.logger.warn(`[CostAgent] Failed: ${e?.message}`))
      );
    }

    await Promise.all(promises);
  }

  /**
   * 收集预测数据（护城河扩展）
   */
  private async collectPredictionData(
    tripRequest: TripPlanRequest,
    researchData: Record<string, any>,
    evidenceRefs: string[],
    request: RouteAndRunRequestDto,
  ): Promise<void> {
    this.logger.debug(`[Orchestrator] Collecting prediction data (护城河扩展)`);

    const promises: Promise<void>[] = [];

    // 1. 天气预测
    if (this.weatherPredictionService && tripRequest.date_range) {
      promises.push(
        this.weatherPredictionService
          .predictWeather('IS', {
            start: new Date(tripRequest.date_range.start_date),
            end: new Date(tripRequest.date_range.end_date),
          })
          .then((predictions) => {
            researchData.weather_predictions = predictions;
            evidenceRefs.push(`weather_predictions_${Date.now()}`);
          })
          .catch((e) =>
            this.logger.warn(`[WeatherPredictionService] Failed: ${e?.message}`),
          ),
      );
    }

    // 2. 失败风险预测
    if (
      this.failureRiskPredictionService &&
      tripRequest.date_range &&
      request.route_direction_id
    ) {
      promises.push(
        this.failureRiskPredictionService
          .predictFailureRisk(
            request.route_direction_id,
            {
              userId: request.user_id,
              riskTolerance: tripRequest.party_profile?.risk_tolerance as any,
              fitness: tripRequest.party_profile?.fitness as any,
            },
            {
              start: new Date(tripRequest.date_range.start_date),
              end: new Date(tripRequest.date_range.end_date),
            },
          )
          .then((prediction) => {
            researchData.failure_risk_prediction = prediction;
            evidenceRefs.push(`failure_risk_prediction_${Date.now()}`);

            // 提前预警高风险日期
            const highRiskDays = prediction.predictions
              .filter((p) => p.riskLevel === 'HIGH')
              .map((p) => p.day);

            if (highRiskDays.length > 0) {
              if (!researchData.warnings) {
                researchData.warnings = [];
              }
              researchData.warnings.push({
                type: 'HIGH_RISK_DAYS',
                days: highRiskDays,
                message: `预测到第${highRiskDays.join(', ')}天存在高风险`,
              });
            }
          })
          .catch((e) =>
            this.logger.warn(`[FailureRiskPredictionService] Failed: ${e?.message}`),
          ),
      );
    }

    await Promise.all(promises);

    // 缺口修复：聚合 weather_risk (0-1) 写入 research_data，供 DSO environmentState.weatherRisk
    const weatherRisk = this.computeWeatherRisk(researchData);
    if (weatherRisk !== undefined) {
      researchData.weather_risk = weatherRisk;
      this.logger.debug(`[Orchestrator] 聚合 weather_risk=${weatherRisk.toFixed(2)}`);
    }
  }

  /**
   * 从 research_data 聚合 weather_risk（缺口解决方案）
   * 数据源：failure_risk_prediction、weather_predictions、weather_forecast
   */
  private computeWeatherRisk(researchData: Record<string, any>): number | undefined {
    return aggregateWeatherRisk(researchData);
  }
}
