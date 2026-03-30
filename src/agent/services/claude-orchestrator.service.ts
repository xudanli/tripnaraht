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
import { SkillInputValidatorService } from './skill-input-validator.service';
import { HallucinationDetectionService } from './hallucination-detection.service';
import { TrajectoryCollectionService } from '../training/services/trajectory-collection.service';
import { ReadinessService } from '../../trips/readiness/services/readiness.service';
import { UserDecisionService } from '../../trips/readiness/services/user-decision.service';
import { TripContext, TravelerProfile, ItineraryInfo } from '../../trips/readiness/types/trip-context.types';
import { DecisionDraftGeneratorService } from '../../decision-draft/services/decision-draft-generator.service';
// Domain Agents (World Model Layer)
import { GeoAgentService } from './domain-agents/geo-agent.service';
import { WeatherAgentService } from './domain-agents/weather-agent.service';
import { CostAgentService } from './domain-agents/cost-agent.service';
import { ExperienceAgentService } from './domain-agents/experience-agent.service';
import { TokenStatsService } from './token-stats.service';
// Phase 2.1: Decision Kernel
import { DecisionKernelService } from '../../decision/kernel/decision-kernel.service';
import { TdfpmCalculatorService } from '../../trips/decision/services/tdfpm-calculator.service';
import type { TdfpmDayContext } from '../../trips/decision/services/tdfpm-calculator.service';
import {
  orchestratorStateToDecisionStatePatch,
  decisionStateToOrchestratorState,
  buildPatchFromDSOPrimary,
} from '../../decision/kernel/orchestrator-state-mapper';
import { DecisionState } from '../../decision/kernel/decision-state.types';
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
    @Optional() private trajectoryCollection?: TrajectoryCollectionService,
    @Optional() private readonly readinessService?: ReadinessService,
    @Optional() private readonly userDecisionService?: UserDecisionService,
    @Optional() private readonly decisionDraftGenerator?: DecisionDraftGeneratorService,
    // Domain Agents (World Model Layer)
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
   * 智能编排主入口
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
          const smResult = await this.orchestrateWithStateMachine(request, context, smDeadline);
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
      },
    };

    // Phase 2.1: 初始化 DecisionState (DSO)，与 OrchestratorState 并行维护
    // Phase 2.4: DECISION_KERNEL_ENABLED=false 可回滚到无 Kernel 路径
    // P1: DECISION_KERNEL_AB_PERCENT 设置时按 hash 分流（如 10 表示 10% 实验组）
    let decisionState: DecisionState | undefined;
    if (this.decisionKernel && this.isKernelEnabledForRequest(request)) {
      decisionState = this.decisionKernel.createInitialState(request.request_id);
      this.logger.debug(`[Claude Orchestrator] DSO 已初始化: requestId=${request.request_id}`);
    }

    try {
      // 步骤 1: INTAKE - 解析请求 & 缺口识别
      await this.executeIntakeStep(request, context, state, llmProvider);

      // 步骤 2: STATE_UPDATE - Phase 2.3 显式 DSO 同步
      decisionState = await this.executeStateUpdateStep(state, decisionState) ?? decisionState;

      // HARD 缺口 + 已生成澄清问题：必须在 RESEARCH 之前返回，避免 transport.search 等技能在「未指定」上失败
      if (this.shouldReturnClarificationForHardGaps(state)) {
        this.logger.debug(
          `[Claude Orchestrator] HARD 缺口且已有澄清问题，跳过 RESEARCH/Gate/Plan，直接返回澄清`,
        );
        return this.buildClarificationResult(state, startTime);
      }

      // 步骤 3: RESEARCH - KERNEL_NATIVE_EXECUTION 时走 Kernel.executeResearch，否则走 callback
      decisionState = await this.executeResearchPhase(decisionState, state, request, context, llmProvider);

      // 步骤 4: GATE_EVAL - KERNEL_NATIVE_EXECUTION 时走 Kernel.executeGateEval
      decisionState = await this.executeGateEvalPhase(decisionState, state, request, context, llmProvider);

      // 如果 Gate 结果为 BLOCK，直接返回
      if (state.gate_result?.gate_result === 'BLOCK') {
        return this.buildBlockedResult(state, startTime, decisionState);
      }

      // 步骤 5: CONTEXT_BUILD - Phase 2.3 在 PLAN 前构建 Context
      decisionState = await this.executeContextBuildStep(request, context, state, decisionState);

      // 步骤 6: PLAN_GEN - KERNEL_NATIVE_EXECUTION 时走 Kernel.executePlanGen
      decisionState = await this.executePlanGenPhase(decisionState, state, request, context, llmProvider);

      // 步骤 7: OPTIMIZE - Phase 2.3 抽取 Optimization Hints
      decisionState = await this.executeOptimizeStep(state, decisionState);

      // 步骤 8: VERIFY - KERNEL_NATIVE_EXECUTION 时走 Kernel.executeVerify
      decisionState = await this.executeVerifyPhase(decisionState, state, request, context, llmProvider);
      decisionState = this.syncConfidenceAfterVerify(state, decisionState) ?? decisionState;

      // 步骤 9: REPAIR - KERNEL_NATIVE_EXECUTION 时走 Kernel.executeRepair（条件执行）
      if (state.gate_result?.gate_result === 'ADJUST_REQUIRED' || state.errors.length > 0) {
        decisionState = await this.executeRepairPhase(decisionState, state, request, context, llmProvider) ?? decisionState;
      }

      // 步骤 10: NARRATE - 产出用户可读解释（不得改硬字段）
      await this.executeNarrateStep(request, context, state, llmProvider);

      // 步骤 10.5: FEEDBACK - 专利反馈学习模块，记录决策日志（异步，不阻塞）
      decisionState = await this.executeFeedbackStep(state, decisionState) ?? decisionState;

      // 步骤 11: HALLUCINATION_DETECTION - 防幻觉检测
      await this.executeHallucinationDetectionStep(request, context, state);

      // 步骤 12: DONE
      state.current_step = 'DONE';
      state.metadata.last_updated_at = new Date().toISOString();
      state.metadata.total_duration_ms = Date.now() - startTime;

      return this.buildSuccessResult(state, startTime, decisionState);
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] 状态机编排失败: ${error?.message}`, error?.stack);
      
      // 🆕 检查是否是超时错误
      const isTimeout = error?.message?.startsWith('TIMEOUT:') || 
                        error?.code === 'ECONNABORTED' ||
                        deadline?.remainingMs() <= 0;
      
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
      } else {
        state.current_step = 'FAILED';
        state.errors.push({
          step: state.current_step,
          error_code: 'ORCHESTRATION_ERROR',
          message: error?.message || '未知错误',
          timestamp: new Date().toISOString(),
        });
      }

      return this.buildErrorResult(state, error, startTime, decisionState);
    }
  }

  /** INTAKE 已标 HARD 缺口并生成澄清问题时，不得进入 RESEARCH（避免关键技能在占位目的地上报错） */
  private shouldReturnClarificationForHardGaps(state: OrchestratorState): boolean {
    const hasHardGaps = state.gaps?.some((g) => g.severity === 'HARD');
    return !!(
      hasHardGaps &&
      state.clarification_questions &&
      state.clarification_questions.length > 0
    );
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

    return {
      request_id: request.request_id,
      origin: '起点', // 默认值，实际应该从 message 或上下文提取
      destination: destination || '未指定',
      date_range,
      start_date,
      days,
      mode,
      party: {
        count: partyCount,
      },
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
      const tripPlanRequest = this.convertToTripPlanRequest(request, state);
      state.trip_plan_request = tripPlanRequest;

      if (this.decisionKernel) {
        const intakeCtx: import('../../decision/kernel/interfaces/phase-executor.interface').IntakeExecutorContext = {
          requestId: state.request_id,
          userId: request.user_id,
          tripPlanRequest: tripPlanRequest as any,
          orchestratorState: state,
        };
        const dso = this.decisionKernel.createInitialState(state.request_id);
        const result = await this.decisionKernel.executeIntake(dso, intakeCtx);

        state.gaps = result.gaps as OrchestratorState['gaps'];
        state.clarification_questions = result.clarificationQuestions as any;
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
        routeDirectionId: request.route_direction_id,
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
      this.executeResearchStep(request, context, state, llmProvider),
    );
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
        routeDirectionId: request.route_direction_id,
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
      const ctx = {
        requestId: state.request_id,
        tripPlanRequest: state.trip_plan_request,
        researchData: state.research_data,
        gateResult: state.gate_result as any,
      };
      const { newState, itinerary } = await this.decisionKernel.executePlanGen(decisionState, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
      state.itinerary = itinerary as Itinerary;
      state.current_step = 'PLAN_GEN';
      state.decision_log.push({
        request_id: state.request_id,
        step: 'PLAN_GEN',
        actor: 'Planner',
        inputs_summary: 'Kernel 原生 PLAN_GEN',
        outputs_summary: `生成了 ${itinerary.days.length} 天的行程`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime },
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
        itinerary: state.itinerary as any,
        researchData: state.research_data,
      };
      const { newState, issues } = await this.decisionKernel.executeVerify(decisionState, ctx);
      const derived = decisionStateToOrchestratorState(newState, state);
      Object.assign(state, derived);
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
        outputs_summary: issues.length > 0 ? `发现 ${issues.length} 个问题` : '验证通过',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: Date.now() - stepStartTime, issues, guardian: 'DR_DRE' as GuardianType },
      });
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
      outputs_summary: `已更新: userIntent=${!!patch.userIntent}, constraints=${!!patch.constraints}, environmentState=${!!patch.environmentState}, version=${updated.systemState?.version}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: { duration_ms: Date.now() - stepStartTime },
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

        // 2. POI 搜索（poi.search）- IMPORTANT
        try {
          const poiSkill = this.skillsRegistry.getSkill('poi.search');
          if (poiSkill) {
            const destinationQuery = typeof tripRequest.destination === 'string' 
              ? tripRequest.destination 
              : 'destination'; // 如果是坐标，使用默认查询
            const poiResult = await poiSkill.execute({
              query: destinationQuery,
              limit: 10,
              lat: typeof tripRequest.destination === 'object' ? tripRequest.destination.lat : undefined,
              lng: typeof tripRequest.destination === 'object' ? tripRequest.destination.lng : undefined,
            });
            researchData.poi_evidence = poiResult.pois || poiResult; // 兼容新旧格式
            if (poiResult.pois && Array.isArray(poiResult.pois)) {
              poiResult.pois.forEach((poi: any) => {
                if (poi.evidence_id) evidenceRefs.push(poi.evidence_id);
              });
            }
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

        // 6. Domain Agents - World Model Data
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
        const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(
          readinessCheckResult,
          state.request_id
        );
        state.decision_log.push(...readinessDecisionLogs);

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
          const readinessDecisionLogs = this.readinessService.generateDecisionLogEntries(
            readinessCheckResult,
            state.request_id
          );
          state.decision_log.push(...readinessDecisionLogs);
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

    state.decision_log.push({
      request_id: state.request_id,
      step: 'OPTIMIZE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: 'DSO (environmentState, tripState)',
      outputs_summary: hints ? `Hints: ${JSON.stringify(hints)}` : '无 Hints',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: { duration_ms: Date.now() - stepStartTime },
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
        const dso = this.decisionKernel.createInitialState(state.request_id);
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
        messages.push(`   选项：${q.options.join('、')}`);
      }
      messages.push('');
    });

    return messages.join('\n');
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
    // 如果有澄清问题，说明需要用户提供更多信息
    const hasClarificationQuestions = state.clarification_questions && state.clarification_questions.length > 0;
    
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
  private buildClarificationResult(state: OrchestratorState, startTime: number): OrchestrationResult {
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
