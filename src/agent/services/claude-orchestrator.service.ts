// src/agent/services/claude-orchestrator.service.ts

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import { ActionRegistryService } from './action-registry.service';
import { Skill } from '../../skills/interfaces/skill.interface';
import { Deadline, withTimeout, runBounded, SimpleLruCache } from './orchestration-utils';
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
  DecisionLogEntry,
  EvidenceRef,
  PlanDiff,
  GuardianType,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import {
  PlannerAgent,
  GatekeeperAgent,
  ComplianceAgent,
  LocalInsightAgent,
  CoreDecisionAgent,
  NarratorAgent,
} from '../interfaces/sub-agent.interface';
import { ClaudePlannerAgentService } from './sub-agents/planner-agent.service';
import { ClaudeGatekeeperAgentService } from './sub-agents/gatekeeper-agent.service';
import { ClaudeComplianceAgentService } from './sub-agents/compliance-agent.service';
import { ClaudeLocalInsightAgentService } from './sub-agents/local-insight-agent.service';
import { ClaudeCoreDecisionAgentService } from './sub-agents/core-decision-agent.service';
import { ClaudeNarratorAgentService } from './sub-agents/narrator-agent.service';
import { getSkillFailureStrategy, isCriticalSkill } from '../utils/skill-importance.util';
import { ErrorType, inferErrorType, getErrorHandlingStrategy } from '../interfaces/error-types.interface';
import { ClarificationQuestion } from '../interfaces/clarification.interface';
import { SKILL_VALIDATION_RULES } from './skill-validation-rules.config';
import { SkillInputValidatorService } from './skill-input-validator.service';
import { HallucinationDetectionService } from './hallucination-detection.service';
import { TrajectoryCollectionService } from '../training/services/trajectory-collection.service';

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
  ) {
    this.logger.log(`[ClaudeOrchestratorService] 已初始化`);
    this.logger.log(`[ClaudeOrchestratorService] SkillsRegistry: ${!!this.skillsRegistry}, ActionRegistry: ${!!this.actionRegistry}`);
    this.logger.log(`[ClaudeOrchestratorService] 子 Agent: Planner=${!!this.plannerAgent}, Gatekeeper=${!!this.gatekeeperAgent}, Compliance=${!!this.complianceAgent}, LocalInsight=${!!this.localInsightAgent}, CoreDecision=${!!this.coreDecisionAgent}, Narrator=${!!this.narratorAgent}`);
    if (this.skillsRegistry) {
      const skillsCount = this.skillsRegistry.getAllSkills().length;
      this.logger.log(`[ClaudeOrchestratorService] 可用 Skills 数量: ${skillsCount}`);
    } else {
      this.logger.warn(`[ClaudeOrchestratorService] ⚠️ SkillsRegistry 未注入！`);
    }
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
        default:
          break;
      }
    }
    
    // 2. 使用系统默认提供商
    return this.llmService.getDefaultProvider();
  }

  /**
   * 获取降级提供商列表（当主提供商失败时使用）
   */
  private getFallbackProviders(primaryProvider: LlmProvider): LlmProvider[] {
    const fallbackOrder: LlmProvider[] = [
      LlmProvider.DEEPSEEK,  // 优先使用 DeepSeek（成本低、速度快）
      LlmProvider.OPENAI,     // 其次 OpenAI
      LlmProvider.GEMINI,     // 最后 Gemini
    ];
    
    // 移除主提供商，返回其他提供商作为降级选项
    return fallbackOrder.filter(p => p !== primaryProvider);
  }

  /**
   * 使用 LLM 调用，支持降级机制
   */
  private async callLlmWithFallback(
    primaryProvider: LlmProvider,
    prompt: string,
    schema: any,
    operationName: string,
  ): Promise<string> {
    // 首先尝试主提供商
    try {
      return await this.llmService.callLlmWithSchema(primaryProvider, prompt, schema);
    } catch (error: any) {
      this.logger.warn(`[Claude Orchestrator] ${operationName} 使用 ${primaryProvider} 失败: ${error?.message}`);
      
      // 如果主提供商失败，尝试降级提供商
      const fallbackProviders = this.getFallbackProviders(primaryProvider);
      for (const fallbackProvider of fallbackProviders) {
        try {
          this.logger.debug(`[Claude Orchestrator] ${operationName} 尝试降级到 ${fallbackProvider}...`);
          return await this.llmService.callLlmWithSchema(fallbackProvider, prompt, schema);
        } catch (fallbackError: any) {
          this.logger.warn(`[Claude Orchestrator] ${operationName} 使用 ${fallbackProvider} 也失败: ${fallbackError?.message}`);
          continue;
        }
      }
      
      // 所有提供商都失败，抛出最后一个错误
      throw error;
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
      
      // Fast Path: 新建行程规划直接规则路由（0 LLM调用）
      if (isCreatingNewTrip && isPlanningIntent) {
        const countryCode = this.extractCountryCodeFromMessage(request.message);
        if (countryCode) {
          this.logger.log(`[Claude Orchestrator] 🚀 Fast Path: 新建行程规划，countryCode=${countryCode}，跳过LLM调用`);
          // 使用传入的 deadline 或创建新的
          const fastPathDeadline = deadline 
            ? new Deadline(deadline.clamp(12_000, 5000)) 
            : new Deadline(12_000); // 12秒硬性止损
          const decisionLog: DecisionLogEntry[] = [];
          const stepsExecuted: OrchestrationResult['stepsExecuted'] = [];
          
          try {
            const fastResult = await this.fastPathOrchestrate(
              request,
              context,
              fastPathDeadline,
              decisionLog,
              stepsExecuted,
            );
            fastResult.totalDuration = Date.now() - startTime;
            fastResult.decisionLog = decisionLog;
            return fastResult;
          } catch (error: any) {
            this.logger.error(`[Claude Orchestrator] Fast Path 失败: ${error?.message}`);
            // 降级到原有流程
            this.logger.warn(`[Claude Orchestrator] 降级到原有LLM流程`);
          }
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
      const routingDecision = await this.decideRouting(intentAnalysis, llmProvider);
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
      const skillsPlan = await this.selectSkills(intentAnalysis, routingDecision, context, llmProvider);
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
      const executionPlan = await this.planExecution(skillsPlan, routingDecision, llmProvider);
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
  ): Promise<RoutingDecision> {
    const prompt = this.buildRoutingPrompt(intentAnalysis);
    
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
    const actualTripId = context.tripId || request.trip_id;

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
    
    return input;
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
   * 状态机流程：INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → REPAIR → NARRATE → DONE
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
      errors: [],
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
    };

    try {
      // 步骤 1: INTAKE - 解析请求 & 缺口识别
      await this.executeIntakeStep(request, context, state, llmProvider);

      // 步骤 2: RESEARCH - 调用 skills 获取硬数据
      await this.executeResearchStep(request, context, state, llmProvider);

      // 步骤 3: GATE_EVAL - 执行 Should-Exist Gate 决策（强制在 Plan 之前）
      // 注意：如果有 HARD 缺口，应该在 INTAKE 阶段生成澄清问题，不继续执行后续步骤
      const hasHardGaps = state.gaps && state.gaps.some(g => g.severity === 'HARD');
      if (hasHardGaps && state.clarification_questions && state.clarification_questions.length > 0) {
        // 如果有 HARD 缺口且已生成澄清问题，直接返回需要澄清的结果
        this.logger.debug(`[Claude Orchestrator] 检测到 HARD 缺口，返回澄清问题，不继续执行后续步骤`);
        return this.buildClarificationResult(state, startTime);
      }

      await this.executeGateEvalStep(request, context, state, llmProvider);

      // 如果 Gate 结果为 BLOCK，直接返回
      if (state.gate_result?.gate_result === 'BLOCK') {
        return this.buildBlockedResult(state, startTime);
      }

      // 步骤 4: PLAN_GEN - 生成结构化行程草案
      await this.executePlanGenStep(request, context, state, llmProvider);

      // 步骤 5: VERIFY - 验证开放时间冲突/换乘 buffer/可达性/疲劳阈值
      await this.executeVerifyStep(request, context, state, llmProvider);

      // 步骤 6: REPAIR - 替换POI/改路线/加buffer/换交通/降级（如果需要）
      if (state.gate_result?.gate_result === 'ADJUST_REQUIRED' || state.errors.length > 0) {
        await this.executeRepairStep(request, context, state, llmProvider);
      }

      // 步骤 7: NARRATE - 产出用户可读解释（不得改硬字段）
      await this.executeNarrateStep(request, context, state, llmProvider);

      // 步骤 8: HALLUCINATION_DETECTION - 防幻觉检测（新增）
      await this.executeHallucinationDetectionStep(request, context, state);

      // 步骤 9: DONE
      state.current_step = 'DONE';
      state.metadata.last_updated_at = new Date().toISOString();
      state.metadata.total_duration_ms = Date.now() - startTime;

      return this.buildSuccessResult(state, startTime);
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

      return this.buildErrorResult(state, error, startTime);
    }
  }

  /**
   * 将 RouteAndRunRequestDto 转换为 TripPlanRequest
   */
  private convertToTripPlanRequest(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
  ): TripPlanRequest {
    // 从 message 中提取信息（使用改进的规则匹配和 LLM 分析结果）
    const message = request.message.toLowerCase();
    
    // 提取目的地（扩展规则匹配）
    let destination: string | { lat: number; lng: number } | undefined;
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
    for (const { pattern, value } of destinationPatterns) {
      if (pattern.test(request.message)) {
        destination = value;
        break;
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
   */
  private async executeIntakeStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'INTAKE';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 INTAKE 步骤...`);

    try {
      // 转换为 TripPlanRequest
      const tripPlanRequest = this.convertToTripPlanRequest(request, state);
      state.trip_plan_request = tripPlanRequest;

      // 调用 Planner Agent 解析请求
      if (this.plannerAgent) {
        const analysisResult = await this.plannerAgent.analyzeRequest(tripPlanRequest, state);
        
        // 记录缺口
        state.gaps = analysisResult.gaps;
        
        // 如果有 HARD 缺口，生成结构化澄清问题
        const hardGaps = analysisResult.gaps.filter(g => g.severity === 'HARD');
        if (hardGaps.length > 0) {
          state.clarification_questions = this.generateClarificationQuestions(hardGaps, tripPlanRequest);
          this.logger.debug(`[Claude Orchestrator] 生成了 ${state.clarification_questions.length} 个结构化澄清问题`);
        }
        
        // 记录决策日志
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Planner',
          inputs_summary: `用户请求: ${request.message.substring(0, 100)}...`,
          outputs_summary: `意图: ${analysisResult.intent}, 缺口数量: ${analysisResult.gaps.length}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            gaps: analysisResult.gaps,
            candidate_structure: analysisResult.candidate_structure,
            clarification_questions_count: state.clarification_questions?.length || 0,
          },
        });
      } else {
        // 降级：使用 LLM 分析意图
        const intentAnalysis = await this.analyzeIntent(request, context, provider);
        
        // 降级情况下，也尝试识别缺口并生成澄清问题
        const gaps = this.identifyGapsFromRequest(tripPlanRequest);
        const hardGaps = gaps.filter(g => g.severity === 'HARD');
        if (hardGaps.length > 0) {
          state.gaps = gaps;
          state.clarification_questions = this.generateClarificationQuestions(hardGaps, tripPlanRequest);
          this.logger.debug(`[Claude Orchestrator] 降级模式：生成了 ${state.clarification_questions.length} 个结构化澄清问题`);
        }
        
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Orchestrator',
          inputs_summary: `用户请求: ${request.message.substring(0, 100)}...`,
          outputs_summary: `意图类型: ${intentAnalysis.intentType}, 复杂度: ${intentAnalysis.complexity}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            clarification_questions_count: state.clarification_questions?.length || 0,
          },
        });
      }

      state.metadata.last_updated_at = new Date().toISOString();
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] INTAKE 步骤失败: ${error?.message}`);
      throw error;
    }
  }

  /**
   * RESEARCH 步骤：调用 skills 获取硬数据
   */
  private async executeResearchStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    provider: LlmProvider,
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
          if (transportSkill && typeof tripRequest.origin === 'string' && typeof tripRequest.destination === 'string') {
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
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] RESEARCH 步骤失败: ${error?.message}`);
      throw error;
    }
  }

  /**
   * GATE_EVAL 步骤：执行 Should-Exist Gate 决策
   * 
   * 强制：Gate 在 Plan 之前执行
   */
  private async executeGateEvalStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'GATE_EVAL';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 GATE_EVAL 步骤...`);

    try {
      // 调用 Gatekeeper Agent 执行 Gate 评估
      if (this.gatekeeperAgent && state.trip_plan_request) {
        const gateResult = await this.gatekeeperAgent.evaluateGate(
          state.trip_plan_request,
          state.research_data || {},
          state,
        );
        state.gate_result = gateResult;
      } else {
        // 降级：使用默认 GateResult
        state.gate_result = {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 0.8,
          evidence_refs: [],
        };
      }

      state.decision_log.push({
        request_id: state.request_id,
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: '评估行程可行性',
        outputs_summary: `Gate 结果: ${state.gate_result.gate_result}, 置信度: ${state.gate_result.confidence}, 违规数: ${state.gate_result.violations.length}`,
        evidence_refs: state.gate_result.evidence_refs || [],
        timestamp: new Date().toISOString(),
        metadata: {
          duration_ms: Date.now() - stepStartTime,
          violations: state.gate_result.violations,
          adjustments: state.gate_result.required_adjustments,
          guardian: 'ABU' as GuardianType, // P1 改进：三人格映射（Gatekeeper → Abu）
        },
      });

      state.metadata.last_updated_at = new Date().toISOString();
    } catch (error: any) {
      this.logger.error(`[Claude Orchestrator] GATE_EVAL 步骤失败: ${error?.message}`);
      throw error;
    }
  }

  /**
   * PLAN_GEN 步骤：生成结构化行程草案
   */
  private async executePlanGenStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    provider: LlmProvider,
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
   */
  private async executeVerifyStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    provider: LlmProvider,
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
   */
  private async executeRepairStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    provider: LlmProvider,
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
   */
  private async executeNarrateStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    provider: LlmProvider,
  ): Promise<void> {
    state.current_step = 'NARRATE';
    const stepStartTime = Date.now();

    this.logger.debug(`[Claude Orchestrator] 执行 NARRATE 步骤...`);

    try {
      // 调用 Narrator Agent 生成用户可读的解释
      // 重要：不得修改 itinerary 的硬字段
      if (this.narratorAgent && state.itinerary && state.gate_result) {
        try {
          const narration = await this.narratorAgent.narrate(
            state.itinerary,
            state.gate_result,
            state.decision_log,
            state,
          );
          state.narration = narration;
        } catch (error: any) {
          this.logger.warn(`[Claude Orchestrator] Narrator Agent 失败: ${error?.message}`);
        }
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
   * 生成结构化澄清问题
   * 
   * 根据缺口（gaps）生成对应的结构化澄清问题
   */
  private generateClarificationQuestions(
    gaps: Array<{
      type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
      severity: 'HARD' | 'SOFT';
      detail: string;
    }>,
    tripPlanRequest: TripPlanRequest,
  ): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = [];
    let questionId = 1;

    for (const gap of gaps) {
      switch (gap.type) {
        case 'MISSING_DESTINATION':
          questions.push({
            id: `question-${questionId++}`,
            question: '请选择您的目的地',
            type: 'text',
            required: true,
            placeholder: '例如：冰岛、日本、瑞士',
            hint: '这将帮助我们为您推荐合适的景点和活动',
          });
          break;

        case 'MISSING_DATES':
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const twoYearsLater = new Date();
          twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
          
          questions.push({
            id: `question-${questionId++}`,
            question: '请选择您的出行日期',
            type: 'date',
            required: true,
            hint: '建议选择 1 个月后的日期，以便提前预订',
            validation: {
              min: tomorrow.getTime(),
              max: twoYearsLater.getTime(),
            },
          });
          
          // 如果已有开始日期，询问结束日期
          if (tripPlanRequest.start_date || tripPlanRequest.date_range?.start_date) {
            questions.push({
              id: `question-${questionId++}`,
              question: '请选择您的返回日期',
              type: 'date',
              required: true,
              hint: '返回日期必须晚于出发日期',
              validation: {
                min: tripPlanRequest.start_date 
                  ? new Date(tripPlanRequest.start_date).getTime() 
                  : tripPlanRequest.date_range?.start_date 
                    ? new Date(tripPlanRequest.date_range.start_date).getTime()
                    : tomorrow.getTime(),
                max: twoYearsLater.getTime(),
              },
            });
          }
          break;

        case 'MISSING_CONSTRAINTS':
          questions.push({
            id: `question-${questionId++}`,
            question: '同行人数',
            type: 'single_choice',
            required: true,
            options: ['1人', '2人', '3-4人', '5人以上'],
            hint: '这将影响住宿和交通安排',
          });
          
          questions.push({
            id: `question-${questionId++}`,
            question: '总预算（人民币）',
            type: 'number',
            required: true,
            placeholder: '例如：100000',
            hint: '包含机票、住宿、餐饮、活动等所有费用',
            validation: {
              min: 100,
              max: 1000000,
            },
          });
          break;

        case 'MISSING_PREFERENCES':
          questions.push({
            id: `question-${questionId++}`,
            question: '您的主要兴趣（可多选）',
            type: 'multi_choice',
            required: false,
            options: ['极光', '冰川', '温泉', '文化', '美食', '户外运动', '购物', '摄影'],
            hint: '帮助我们为您推荐合适的景点和活动',
          });
          
          questions.push({
            id: `question-${questionId++}`,
            question: '节奏偏好',
            type: 'single_choice',
            required: false,
            options: ['轻松', '平衡', '紧凑'],
            hint: '轻松：每天安排较少活动；平衡：适中安排；紧凑：尽可能多安排活动',
            default: '平衡',
          });
          break;
      }
    }

    return questions;
  }

  /**
   * 识别缺口（降级模式）
   * 
   * 当 PlannerAgent 不可用时，使用简单规则识别缺口
   */
  private identifyGapsFromRequest(tripPlanRequest: TripPlanRequest): Array<{
    type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
    severity: 'HARD' | 'SOFT';
    detail: string;
  }> {
    const gaps: Array<{
      type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
      severity: 'HARD' | 'SOFT';
      detail: string;
    }> = [];

    // 检查目的地
    if (!tripPlanRequest.destination || tripPlanRequest.destination === '未指定') {
      gaps.push({
        type: 'MISSING_DESTINATION',
        severity: 'HARD',
        detail: '缺少目的地信息',
      });
    }

    // 检查日期
    if (!tripPlanRequest.start_date && !tripPlanRequest.date_range) {
      gaps.push({
        type: 'MISSING_DATES',
        severity: 'HARD',
        detail: '缺少出行日期信息',
      });
    }

    // 检查约束（预算、人数）
    if (!tripPlanRequest.party?.count || tripPlanRequest.party.count <= 0) {
      gaps.push({
        type: 'MISSING_CONSTRAINTS',
        severity: 'HARD',
        detail: '缺少同行人数信息',
      });
    }

    return gaps;
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
   */
  private buildSuccessResult(state: OrchestratorState, startTime: number): OrchestrationResult {
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
  private buildBlockedResult(state: OrchestratorState, startTime: number): OrchestrationResult {
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

  // ==================== Fast Path Orchestration (强降超时) ====================

  /**
   * Fast Path 编排：规则路由，0 LLM调用
   * 适用于新建行程规划场景
   */
  private async fastPathOrchestrate(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    deadline: Deadline,
    decisionLog: DecisionLogEntry[],
    stepsExecuted: OrchestrationResult['stepsExecuted'],
  ): Promise<OrchestrationResult> {
    const countryCode = this.extractCountryCodeFromMessage(request.message)!;
    
    // 提取实体（避免LLM）
    const extracted = this.extractCommonEntities(request.message);
    decisionLog.push({
      request_id: request.request_id || context.requestId,
      step: 'INTAKE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: `Fast Path: 提取实体`,
      outputs_summary: `countryCode=${countryCode}, duration=${extracted.durationDays}, budget=${extracted.budget}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
    });

    // 构建默认Skills计划（规则路由）
    const skillsPlan = this.buildDefaultSkillsPlanForNewTrip(countryCode, extracted);
    decisionLog.push({
      request_id: request.request_id || context.requestId,
      step: 'INTAKE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: `Fast Path: 构建Skills计划`,
      outputs_summary: `选择了 ${skillsPlan.selectedSkills.length} 个Skills`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
    });

    // 早期验证（跳过模板变量）
    const earlyOk = await this.validateSkillsInputsFastPath(skillsPlan, context, request);
    if (!earlyOk.valid) {
      return this.buildFailResult(
        Date.now(),
        stepsExecuted,
        decisionLog,
        'MISSING_REQUIRED_PARAM',
        earlyOk.message || '缺少必需参数',
        earlyOk.missingParams || [],
        earlyOk.solutions || [],
      );
    }

    // 本地构建执行计划（拓扑排序+并行分组）
    const plan = this.buildExecutionPlanLocally(skillsPlan);
    decisionLog.push({
      request_id: request.request_id || context.requestId,
      step: 'INTAKE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: `Fast Path: 本地构建执行计划`,
      outputs_summary: `计划包含 ${plan.steps.length} 个步骤，${plan.parallelGroups.length} 个并行组`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
    });

    // 执行计划（并行+Deadline+缓存）
    const execResult = await this.executePlanWithTimeout(
      plan,
      context,
      request,
      deadline,
      stepsExecuted,
      decisionLog,
    );

    // 组装结果
    const itinerary = execResult.latestItinerary;
    const world = execResult.latestWorld;
    const gateResult = execResult.latestGate;

    return {
      success: execResult.success,
      result: execResult.success
        ? { itinerary, world, gateResult }
        : execResult.failPayload,
      answerText: execResult.answerText,
      stepsExecuted,
      totalDuration: 0,
      decisionLog,
    };
  }

  /**
   * 提取常见实体（规则提取，避免LLM）
   */
  private extractCommonEntities(message: string): {
    durationDays?: number;
    budget?: number;
    seasonMonth?: number;
    partyProfile?: any;
    userIntentTags: string[];
  } {
    const m = message || '';
    const userIntentTags: string[] = [];
    const lower = m.toLowerCase();

    // duration: "5天" "五天" "5 days"
    const durMatch = m.match(/(\d+)\s*(天|日|days?)/i);
    const durationDays = durMatch ? Number(durMatch[1]) : undefined;

    // budget: "预算2万" "2w" "20000"
    let budget: number | undefined;
    const b1 = m.match(/预算\s*([0-9]+)\s*(万|w)?/i);
    if (b1) {
      const n = Number(b1[1]);
      const unit = (b1[2] || '').toLowerCase();
      budget = unit === '万' || unit === 'w' ? n * 10_000 : n;
    }

    // season month: "1月" "January"
    let seasonMonth: number | undefined;
    const monthMatch = m.match(/(\d{1,2})\s*月/);
    if (monthMatch) {
      const mm = Number(monthMatch[1]);
      if (mm >= 1 && mm <= 12) seasonMonth = mm;
    } else {
      const monthMap: Record<string, number> = {
        jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
        apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
        aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
        nov: 11, november: 11, dec: 12, december: 12,
      };
      for (const [k, v] of Object.entries(monthMap)) {
        if (lower.includes(k)) {
          seasonMonth = v;
          break;
        }
      }
    }

    // party profile: "带娃" => family
    if (m.includes('带娃') || m.includes('亲子') || lower.includes('kids') || lower.includes('child')) {
      userIntentTags.push('family');
    }
    if (m.includes('轻松') || m.includes('悠闲') || lower.includes('relax')) {
      userIntentTags.push('relaxed');
    }
    if (m.includes('特种兵') || m.includes('暴走') || lower.includes('intense')) {
      userIntentTags.push('intense');
    }
    if (!userIntentTags.length) userIntentTags.push('general');

    const partyProfile = userIntentTags.includes('family')
      ? { pace: 'relaxed', fitness: 'medium', riskTolerance: 'low', mobilityProfile: 'stroller_possible' }
      : undefined;

    return { durationDays, budget, seasonMonth, partyProfile, userIntentTags };
  }

  /**
   * 构建默认Skills计划（新建行程规划，规则路由）
   */
  private buildDefaultSkillsPlanForNewTrip(
    countryCode: string,
    extracted: { durationDays?: number; budget?: number; seasonMonth?: number; partyProfile?: any; userIntentTags: string[] },
  ): SkillsPlan {
    const selectedSkills: SkillsPlan['selectedSkills'] = [
      {
        skillName: 'world.buildContext',
        reason: '创建新行程需构建 world 上下文',
        priority: 1,
        input: {
          countryCode,
          duration: extracted.durationDays,
          season: extracted.seasonMonth,
          partyProfile: extracted.partyProfile,
        },
      },
      {
        skillName: 'routeDirection.pickForIntent',
        reason: '根据意图标签选路线方向',
        priority: 2,
        input: {
          countryCode,
          userIntentTags: extracted.userIntentTags,
          season: extracted.seasonMonth,
        },
        dependencies: ['world.buildContext'],
      },
      {
        skillName: 'itinerary.generate',
        reason: '生成结构化行程草案',
        priority: 3,
        input: {
          world: '${world.buildContext.result.world}',
          routeDirection: '${routeDirection.pickForIntent.result.routeDirection}',
          constraints: {
            budget: extracted.budget,
            durationDays: extracted.durationDays,
          },
          preferences: {
            userIntentTags: extracted.userIntentTags,
          },
        },
        dependencies: ['world.buildContext', 'routeDirection.pickForIntent'],
      },
      // 注意：plan.gate.runThreeGuardians 需要完整的 PlanState，在 Fast Path 中暂时跳过
      // 由 itinerary.verify 负责检查可行性
      // {
      //   skillName: 'plan.gate.runThreeGuardians',
      //   reason: 'Gate 检查（需要完整 PlanState，Fast Path 中暂时跳过）',
      //   priority: 4,
      //   input: { ... },
      //   dependencies: ['itinerary.generate'],
      // },
      {
        skillName: 'itinerary.verify',
        reason: '验证开放时间/换乘 buffer/可达性/疲劳阈值（Fast Path 中替代 Gate 检查）',
        priority: 4,
        input: {
          itinerary: '${itinerary.generate.result.itinerary}',
        },
        dependencies: ['itinerary.generate'],
      },
      {
        skillName: 'repair.apply',
        reason: '如 verify 发现问题则修复',
        priority: 5,
        input: {
          itinerary: '${itinerary.generate.result.itinerary}',
          adjustments: '${itinerary.verify.result.fixes}',
        },
        dependencies: ['itinerary.verify', 'itinerary.generate'],
      },
    ];

    const executionOrder = selectedSkills
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((s) => s.skillName);

    const dependencies: Record<string, string[]> = {};
    for (const s of selectedSkills) {
      dependencies[s.skillName] = s.dependencies || [];
    }

    return { selectedSkills, executionOrder, dependencies };
  }

  /**
   * 快速验证Skills输入（跳过模板变量）
   */
  private async validateSkillsInputsFastPath(
    skillsPlan: SkillsPlan,
    context: AgentContext,
    request: RouteAndRunRequestDto,
  ): Promise<{
    valid: boolean;
    message?: string;
    missingParams?: string[];
    solutions?: string[];
  }> {
    if (!this.skillInputValidator) {
      return { valid: true };
    }

    for (const s of skillsPlan.selectedSkills) {
      // 跳过模板变量（${...}），只检查硬必填
      const input = s.input || {};
      const hasTemplateVars = JSON.stringify(input).includes('${');
      
      if (hasTemplateVars) {
        // 有模板变量，跳过验证（会在执行时解析）
        continue;
      }

      const skill = this.skillsRegistry?.getSkill(s.skillName);
      const metadata = skill?.metadata;
      const res = this.skillInputValidator.validate(s.skillName, input, metadata, {
        context,
        request,
        stepResults: {},
      });

      if (!res.valid) {
        return {
          valid: false,
          message: res.clarificationMessage || `技能输入验证失败: ${s.skillName} 缺少 ${res.missingParams?.join(', ')}`,
          missingParams: res.missingParams || [],
          solutions: res.solutions || [
            '在消息中补充缺失信息（目的地/天数/预算/人群画像等）',
            '或在代码中为缺失参数提供默认值/从上下文推断',
          ],
        };
      }
    }
    return { valid: true };
  }

  /**
   * 本地构建执行计划（拓扑排序+并行分组，避免LLM planExecution调用）
   */
  private buildExecutionPlanLocally(skillsPlan: SkillsPlan): ExecutionPlan {
    // 创建节点
    const nodes = skillsPlan.selectedSkills.map((s) => ({
      skillName: s.skillName,
      deps: (s.dependencies || []).slice(),
      input: s.input || {},
      fallback: this.defaultFallbackForSkill(s.skillName),
    }));

    // 拓扑排序
    const inDeg = new Map<string, number>();
    const out = new Map<string, string[]>();
    for (const n of nodes) {
      inDeg.set(n.skillName, 0);
      out.set(n.skillName, []);
    }
    for (const n of nodes) {
      for (const d of n.deps) {
        inDeg.set(n.skillName, (inDeg.get(n.skillName) ?? 0) + 1);
        out.get(d)?.push(n.skillName);
      }
    }

    const queue: string[] = [];
    for (const [k, v] of inDeg.entries()) if (v === 0) queue.push(k);

    const order: string[] = [];
    while (queue.length) {
      const cur = queue.shift()!;
      order.push(cur);
      for (const nxt of out.get(cur) ?? []) {
        inDeg.set(nxt, (inDeg.get(nxt) ?? 0) - 1);
        if ((inDeg.get(nxt) ?? 0) === 0) queue.push(nxt);
      }
    }

    // 如果存在循环，降级到优先级顺序
    if (order.length !== nodes.length) {
      const byPriority = skillsPlan.selectedSkills
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((s) => s.skillName);
      return this.buildExecutionPlanFromOrder(byPriority, skillsPlan);
    }

    return this.buildExecutionPlanFromOrder(order, skillsPlan);
  }

  /**
   * 从顺序构建执行计划
   */
  private buildExecutionPlanFromOrder(order: string[], skillsPlan: SkillsPlan): ExecutionPlan {
    const skillByName = new Map(skillsPlan.selectedSkills.map((s) => [s.skillName, s]));
    const steps: ExecutionStep[] = [];
    const done = new Set<string>();
    let stepNo = 1;

    while (done.size < order.length) {
      const ready: string[] = [];
      for (const name of order) {
        if (done.has(name)) continue;
        const deps = (skillByName.get(name)?.dependencies ?? []).filter(Boolean);
        if (deps.every((d) => done.has(d))) ready.push(name);
      }
      if (!ready.length) break;

      // 关键顺序：Gate必须在Generate之前，Verify在Generate之后，Repair在Verify之后
      ready.sort((a, b) => a.localeCompare(b));

      // 串行：world.buildContext 和 gate 不能并行
      const serial = ready.filter((n) =>
        ['world.buildContext', 'plan.gate.runThreeGuardians'].includes(n),
      );
      const parallel = ready.filter((n) => !serial.includes(n));

      if (serial.length) {
        const n = serial[0];
        const s = skillByName.get(n)!;
        steps.push({
          id: `step${stepNo++}`,
          type: 'skill',
          skillName: n,
          dependencies: (s.dependencies ?? []).map((dep) => this.findStepIdBySkillName(steps, dep)).filter(Boolean) as string[],
          parallel: false,
          input: s.input,
          fallback: this.defaultFallbackForSkill(n),
        });
        done.add(n);
        continue;
      }

      // 并行步骤
      for (const n of parallel) {
        const s = skillByName.get(n)!;
        steps.push({
          id: `step${stepNo++}`,
          type: 'skill',
          skillName: n,
          dependencies: (s.dependencies ?? []).map((dep) => this.findStepIdBySkillName(steps, dep)).filter(Boolean) as string[],
          parallel: true,
          input: s.input,
          fallback: this.defaultFallbackForSkill(n),
        });
        done.add(n);
      }
    }

    // 计算并行组
    const groupsMap = new Map<string, string[]>();
    for (const s of steps) {
      if (!s.parallel) continue;
      const key = JSON.stringify(s.dependencies.slice().sort());
      groupsMap.set(key, [...(groupsMap.get(key) ?? []), s.id]);
    }
    const parallelGroups = Array.from(groupsMap.values()).filter((g) => g.length >= 2);

    return {
      steps,
      parallelGroups,
      fallbackStrategy: { onError: 'continue', retryCount: 1 },
    };
  }

  private findStepIdBySkillName(steps: ExecutionStep[], skillName: string): string | undefined {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].skillName === skillName) return steps[i].id;
    }
    return undefined;
  }

  private defaultFallbackForSkill(skillName: string): ExecutionStep['fallback'] {
    if (skillName === 'world.buildContext') return { onError: 'stop' };
    if (skillName === 'plan.gate.runThreeGuardians') return { onError: 'stop' };
    if (skillName === 'itinerary.generate') return { onError: 'retry', retryCount: 1 };
    if (skillName === 'itinerary.verify') return { onError: 'continue' };
    if (skillName === 'repair.apply') return { onError: 'continue' };
    return { onError: 'continue' };
  }

  /**
   * 执行计划（并行+Deadline+缓存）
   */
  private async executePlanWithTimeout(
    plan: ExecutionPlan,
    context: AgentContext,
    request: RouteAndRunRequestDto,
    deadline: Deadline,
    stepsExecuted: OrchestrationResult['stepsExecuted'],
    decisionLog: DecisionLogEntry[],
  ): Promise<{
    success: boolean;
    latestWorld?: any;
    latestItinerary?: any;
    latestGate?: any;
    answerText: string;
    failPayload: OrchestrationResult['result'];
  }> {
    const resultsByStepId: Record<string, any> = {};
    const resultsBySkill: Record<string, any> = {};
    const stepById = new Map(plan.steps.map((s) => [s.id, s]));
    const depsMet = (step: ExecutionStep): boolean =>
      step.dependencies.every((d) => resultsByStepId[d] !== undefined);
    const pending = new Set(plan.steps.map((s) => s.id));
    const maxConcurrency = 4;

    while (pending.size) {
      if (deadline.isExpired()) throw new Error('TIMEOUT: ORCHESTRATION_DEADLINE_EXCEEDED');

      const readyIds = Array.from(pending).filter((id) => depsMet(stepById.get(id)!));
      if (!readyIds.length) break;

      const serialIds = readyIds.filter((id) => !stepById.get(id)!.parallel);
      const parallelIds = readyIds.filter((id) => stepById.get(id)!.parallel);

      // 串行执行
      if (serialIds.length) {
        const id = serialIds[0];
        const step = stepById.get(id)!;
        const out = await this.executeOneStepWithTimeout(
          step,
          context,
          request,
          deadline,
          resultsByStepId,
          resultsBySkill,
          stepsExecuted,
          decisionLog,
        );
        resultsByStepId[id] = out;
        if (step.skillName) resultsBySkill[step.skillName] = out;
        pending.delete(id);

        // 检查Gate结果（Fast Path 中暂时跳过 Gate，由 verify 检查可行性）
        // const gate = resultsBySkill['plan.gate.runThreeGuardians']?.result?.gateResult;
        // if (gate === 'REJECT') {
        //   return {
        //     success: false,
        //     answerText: 'Gate 结果为 REJECT：当前需求不可行或风险过高。',
        //     failPayload: {
        //       needsUserConfirmation: true,
        //       clarificationMessage: '当前行程需求被 Gate 拒绝（REJECT）。请调整目的地/节奏/预算/人群画像后重试。',
        //       errorType: ErrorType.VALIDATION_ERROR,
        //       missingParams: [],
        //       solutions: [
        //         '降低节奏或延长天数',
        //         '提升预算或减少跨城移动',
        //         '提供更明确的出行人群与限制条件',
        //       ],
        //     },
        //   };
        // }
        continue;
      }

      // 并行执行
      const batch = parallelIds.slice(0, maxConcurrency);
      const tasks = batch.map((id) => async () => {
        const step = stepById.get(id)!;
        const out = await this.executeOneStepWithTimeout(
          step,
          context,
          request,
          deadline,
          resultsByStepId,
          resultsBySkill,
          stepsExecuted,
          decisionLog,
        );
        return { id, step, out };
      });

      const outs = await runBounded(tasks, Math.min(maxConcurrency, batch.length));
      for (const o of outs) {
        resultsByStepId[o.id] = o.out;
        if (o.step.skillName) resultsBySkill[o.step.skillName] = o.out;
        pending.delete(o.id);
      }
    }

    const latestWorld = resultsBySkill['world.buildContext']?.result?.world;
    // Fast Path 中暂时跳过 Gate
    // const latestGate = resultsBySkill['plan.gate.runThreeGuardians']?.result;
    const latestGate = undefined;
    const verify = resultsBySkill['itinerary.verify']?.result;
    const repaired = resultsBySkill['repair.apply']?.result?.repairedItinerary;
    const generated = resultsBySkill['itinerary.generate']?.result?.itinerary;

    const itinerary = repaired ?? generated;
    
    // 分析失败原因，生成友好的错误消息和结构化的澄清问题
    if (!itinerary) {
      const failedSteps = stepsExecuted.filter(s => !s.success);
      const failedSkillNames = failedSteps.map(s => s.skillName).filter(Boolean);
      
      let clarificationMessage = '抱歉，无法生成行程规划。';
      let solutions: string[] = [];
      let clarificationQuestions: ClarificationQuestion[] = [];
      
      // 根据失败的步骤提供具体建议和结构化问题
      if (failedSkillNames.includes('world.buildContext')) {
        clarificationMessage = '无法构建目的地信息，请确认目的地名称是否正确。';
        solutions = [
          '请提供更明确的目的地名称（如：冰岛、Iceland、IS）',
          '检查目的地是否在我们的支持列表中',
          '尝试使用国家或主要城市名称',
        ];
        // 生成结构化澄清问题
        clarificationQuestions = [
          {
            id: 'question-destination',
            question: '请选择您的目的地',
            type: 'text',
            required: true,
            placeholder: '例如：冰岛、日本、瑞士',
            hint: '这将帮助我们为您推荐合适的景点和活动',
          },
        ];
      } else if (failedSkillNames.includes('routeDirection.pickForIntent')) {
        clarificationMessage = '无法选择适合的路线方向，请提供更多旅行偏好信息。';
        solutions = [
          '请描述您的旅行风格（如：轻松、紧凑、文化、自然）',
          '提供更多关于兴趣爱好的信息',
          '指定旅行季节或月份',
        ];
        // 生成结构化澄清问题
        clarificationQuestions = [
          {
            id: 'question-travel-style',
            question: '您的旅行风格',
            type: 'single_choice',
            required: true,
            options: ['轻松', '平衡', '紧凑'],
            hint: '轻松：每天安排较少活动；平衡：适中安排；紧凑：尽可能多安排活动',
            default: '平衡',
          },
          {
            id: 'question-interests',
            question: '您的主要兴趣（可多选）',
            type: 'multi_choice',
            required: false,
            options: ['极光', '冰川', '温泉', '文化', '美食', '户外运动', '购物', '摄影'],
            hint: '帮助我们为您推荐合适的景点和活动',
          },
          {
            id: 'question-season',
            question: '旅行月份',
            type: 'single_choice',
            required: false,
            options: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
            hint: '选择旅行月份有助于推荐合适的活动和景点',
          },
        ];
      } else if (failedSkillNames.includes('itinerary.generate')) {
        clarificationMessage = '无法生成行程，可能是信息不足或目的地数据不完整。';
        solutions = [
          '请提供更详细的行程需求（天数、预算、旅行者信息）',
          '尝试调整预算或天数范围',
          '检查目的地是否在我们的数据库中',
          '稍后重试，系统可能正在更新数据',
        ];
        // 生成结构化澄清问题
        clarificationQuestions = [
          {
            id: 'question-duration',
            question: '旅行天数',
            type: 'number',
            required: true,
            placeholder: '例如：5',
            hint: '请输入您计划的旅行天数',
            validation: {
              min: 1,
              max: 30,
            },
          },
          {
            id: 'question-budget',
            question: '总预算（人民币）',
            type: 'number',
            required: true,
            placeholder: '例如：20000',
            hint: '包含机票、住宿、餐饮、活动等所有费用',
            validation: {
              min: 1000,
              max: 1000000,
            },
          },
        ];
      } else if (failedSkillNames.includes('itinerary.verify')) {
        clarificationMessage = '生成的行程存在可行性问题，系统正在尝试修复。';
        solutions = [
          '请稍等，系统正在自动修复行程',
          '如果问题持续，请调整行程天数或节奏',
          '尝试提供更宽松的时间安排',
        ];
        // verify 失败通常不需要用户澄清，系统会自动修复
      } else if (failedSteps.length > 0) {
        clarificationMessage = '行程生成过程中遇到问题，请检查输入信息或稍后重试。';
        solutions = [
          '检查输入信息是否完整（目的地、天数、预算）',
          '确认目的地名称正确',
          '稍后重试',
          '如果问题持续，请联系客服',
        ];
      } else {
        clarificationMessage = '无法生成行程，请提供更详细的行程需求。';
        solutions = [
          '请包含以下信息：目的地、旅行天数、预算范围',
          '描述旅行偏好（如：带娃、轻松、紧凑）',
          '指定旅行时间（月份或日期）',
        ];
        // 生成通用澄清问题
        clarificationQuestions = [
          {
            id: 'question-destination',
            question: '请选择您的目的地',
            type: 'text',
            required: true,
            placeholder: '例如：冰岛、日本、瑞士',
            hint: '这将帮助我们为您推荐合适的景点和活动',
          },
          {
            id: 'question-duration',
            question: '旅行天数',
            type: 'number',
            required: true,
            placeholder: '例如：5',
            hint: '请输入您计划的旅行天数',
            validation: {
              min: 1,
              max: 30,
            },
          },
          {
            id: 'question-budget',
            question: '总预算（人民币）',
            type: 'number',
            required: true,
            placeholder: '例如：20000',
            hint: '包含机票、住宿、餐饮、活动等所有费用',
            validation: {
              min: 1000,
              max: 1000000,
            },
          },
        ];
      }
      
      return {
        success: false,
        latestWorld,
        latestGate,
        latestItinerary: undefined,
        answerText: clarificationMessage,
        failPayload: {
          needsUserConfirmation: true,
          clarificationMessage,
          clarificationQuestions: clarificationQuestions.length > 0 ? clarificationQuestions : undefined,
          errorType: ErrorType.UNKNOWN_ERROR,
          missingParams: [],
          solutions,
        },
      };
    }

    const answerText = verify?.valid === false
      ? '已生成行程，但发现部分可行性问题并尝试修复。'
      : '行程已生成并通过验证。';

    return {
      success: true,
      latestWorld,
      latestGate,
      latestItinerary: itinerary,
      answerText,
      failPayload: {},
    };
  }

  /**
   * 执行单个步骤（带超时+缓存）
   */
  private async executeOneStepWithTimeout(
    step: ExecutionStep,
    context: AgentContext,
    request: RouteAndRunRequestDto,
    deadline: Deadline,
    resultsByStepId: Record<string, any>,
    resultsBySkill: Record<string, any>,
    stepsExecuted: OrchestrationResult['stepsExecuted'],
    decisionLog: DecisionLogEntry[],
  ): Promise<any> {
    const started = Date.now();
    const skillName = step.skillName!;
    const skill = this.skillsRegistry?.getSkill(skillName);
    
    if (!skill) {
      const err = `Missing skill: ${skillName}`;
      stepsExecuted.push({ stepId: step.id, skillName, success: false, error: err, duration: Date.now() - started });
      throw new Error(err);
    }

    // 准备输入（解析模板变量）
    const preparedInput = this.prepareSkillInputWithTemplate(
      step.input ?? {},
      resultsByStepId,
      resultsBySkill,
      context,
      request,
    );

    // 缓存 world.buildContext
    if (skillName === 'world.buildContext') {
      const cacheKey = this.worldCacheKey(preparedInput);
      const cached = this.worldCache.get(cacheKey);
      if (cached) {
        const duration = Date.now() - started;
        stepsExecuted.push({ stepId: step.id, skillName, success: true, result: cached, duration });
        decisionLog.push({
          request_id: request.request_id || context.requestId,
          step: 'RESEARCH' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `缓存命中: ${skillName}`,
          outputs_summary: `cacheKey: ${cacheKey}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
        });
        return cached;
      }
    }

    // 每步超时预算
    const timeoutMs = this.skillTimeoutMs(skillName, deadline);
    const fallback = step.fallback ?? { onError: 'continue', retryCount: 0 };
    const retryCount = fallback.onError === 'retry' ? Math.max(0, fallback.retryCount ?? 0) : 0;

    let lastErr: any;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const out = await withTimeout(skill.execute(preparedInput), timeoutMs, `SKILL:${skillName}`);
        const duration = Date.now() - started;
        stepsExecuted.push({ stepId: step.id, skillName, success: true, result: out, duration });

        if (skillName === 'world.buildContext') {
          const cacheKey = this.worldCacheKey(preparedInput);
          this.worldCache.set(cacheKey, out);
        }

        return out;
      } catch (e: any) {
        lastErr = e;
        if (attempt < retryCount) continue;

        const duration = Date.now() - started;
        stepsExecuted.push({ stepId: step.id, skillName, success: false, error: e?.message || String(e), duration });

        if (fallback.onError === 'stop') throw e;
        return { error: e?.message || String(e) };
      }
    }

    throw lastErr;
  }

  /**
   * 准备Skill输入（解析模板变量 ${skillName.result.path}）
   */
  private prepareSkillInputWithTemplate(
    input: any,
    _resultsByStepId: Record<string, any>,
    resultsBySkill: Record<string, any>,
    _ctx: AgentContext,
    _req: RouteAndRunRequestDto,
  ): any {
    if (input === null || input === undefined) return input;
    if (typeof input === 'string') return this.resolveTemplateString(input, resultsBySkill);
    if (Array.isArray(input)) return input.map((x) => this.prepareSkillInputWithTemplate(x, _resultsByStepId, resultsBySkill, _ctx, _req));
    if (typeof input === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(input)) {
        out[k] = this.prepareSkillInputWithTemplate(v, _resultsByStepId, resultsBySkill, _ctx, _req);
      }
      return out;
    }
    return input;
  }

  /**
   * 解析模板字符串 ${skillName.result.path}
   */
  private resolveTemplateString(s: string, resultsBySkill: Record<string, any>): any {
    const m = s.match(/^\$\{([a-zA-Z0-9_.-]+)\}$/);
    if (!m) return s;

    const path = m[1]; // e.g. world.buildContext.result.world
    const parts = path.split('.');
    const skillName = `${parts[0]}.${parts[1]}`; // assumes "x.y" prefix
    const rest = parts.slice(2);

    const root = resultsBySkill[skillName];
    if (!root) return undefined;

    let cur: any = root;
    for (const p of rest) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  /**
   * 生成world缓存key
   */
  private worldCacheKey(input: any): string {
    const stable = {
      countryCode: input?.countryCode,
      season: input?.season,
      duration: input?.duration,
      partyProfile: input?.partyProfile,
    };
    return `world:${JSON.stringify(stable)}`;
  }

  /**
   * Skill超时预算（根据技能类型分配）
   */
  private skillTimeoutMs(skillName: string, deadline: Deadline): number {
    const remaining = deadline.remainingMs();
    if (skillName === 'world.buildContext') return deadline.clampTimeoutMs(Math.min(1800, remaining * 0.25));
    if (skillName === 'routeDirection.pickForIntent') return deadline.clampTimeoutMs(900);
    if (skillName === 'plan.gate.runThreeGuardians') return deadline.clampTimeoutMs(1400);
    if (skillName === 'itinerary.generate') return deadline.clampTimeoutMs(Math.min(3000, remaining * 0.45));
    if (skillName === 'itinerary.verify') return deadline.clampTimeoutMs(1800);
    if (skillName === 'repair.apply') return deadline.clampTimeoutMs(1400);
    return deadline.clampTimeoutMs(1200);
  }

  /**
   * 构建失败结果
   */
  private buildFailResult(
    started: number,
    stepsExecuted: OrchestrationResult['stepsExecuted'],
    decisionLog: DecisionLogEntry[],
    errorType: string,
    message: string,
    missingParams: string[],
    solutions: string[],
  ): OrchestrationResult {
    // 确保错误消息对用户友好，不是技术错误
    let userFriendlyMessage = message;
    
    // 如果消息包含技术术语，转换为用户友好的描述
    if (message.includes('itinerary') || message.includes('PlanState') || message.includes('skill')) {
      userFriendlyMessage = '无法完成行程规划，请检查输入信息或稍后重试。';
    }
    
    // 如果没有提供解决方案，添加默认建议
    const finalSolutions = solutions.length > 0 ? solutions : [
      '检查输入信息是否完整（目的地、天数、预算）',
      '确认目的地名称正确',
      '稍后重试',
    ];
    
    return {
      success: false,
      result: {
        needsUserConfirmation: true,
        clarificationMessage: userFriendlyMessage,
        errorType: errorType as any,
        missingParams,
        solutions: finalSolutions,
      },
      answerText: userFriendlyMessage,
      stepsExecuted,
      totalDuration: Date.now() - started,
      decisionLog,
    };
  }
}
