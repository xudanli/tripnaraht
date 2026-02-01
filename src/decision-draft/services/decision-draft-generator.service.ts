// src/decision-draft/services/decision-draft-generator.service.ts

/**
 * Decision Draft Generator Service
 * 
 * 生成决策草案（业务层）
 * 融合 Chain-of-Work 的步骤草案生成（技术层）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { ChainOfWorkService } from '../../chain-of-work/services/chain-of-work.service';
import { DecisionTypeToStepDraftMapper } from '../mapping/decision-type-to-step-draft.mapper';
import { DecisionDraftObservabilityService } from './decision-draft-observability.service';
import { DecisionDebugCollectorService } from './decision-debug-collector.service';
import {
  DecisionDraft,
  DecisionStep,
  DecisionType,
  DecisionDraftGenerationConfig,
  DecisionStepStatus,
} from '../interfaces/decision-draft.interface';
import {
  TripPlanRequest,
  OrchestratorState,
  OrchestrationStep,
  SubAgentType,
} from '../../agent/interfaces/trip-plan.interface';

/**
 * Decision Draft Generator Service
 */
@Injectable()
export class DecisionDraftGeneratorService {
  private readonly logger = new Logger(DecisionDraftGeneratorService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly chainOfWorkService: ChainOfWorkService,
    private readonly decisionTypeMapper: DecisionTypeToStepDraftMapper,
    @Optional() private readonly observability?: DecisionDraftObservabilityService,
    @Optional() private readonly debugCollector?: DecisionDebugCollectorService,
  ) {}

  /**
   * 生成决策草案
   * 
   * 两阶段生成：
   * 1. Stage 1: 用户输入 → Decision Steps（业务层）
   * 2. Stage 2: Decision Steps → Step Drafts（技术层）
   */
  async generateDecisionDraft(
    userInput: string,
    tripPlanRequest: TripPlanRequest,
    config?: DecisionDraftGenerationConfig,
  ): Promise<DecisionDraft> {
    const startTime = Date.now();
    // 确保 request_id 有值，如果没有则生成一个
    const requestId = tripPlanRequest.request_id || `req-${Date.now()}`;
    this.logger.log(`[DecisionDraftGenerator] 开始生成决策草案: request_id=${requestId}`);
    const draftId = `decision-${requestId}`;
    let traceId: string | null = null;

    // P1: 开始 Trace 记录
    if (this.observability) {
      traceId = this.observability.startTrace(draftId, requestId, requestId);
    }

    try {
      // Stage 1: 生成 Decision Steps（业务层）
      if (this.observability && traceId) {
        this.observability.startStage(traceId, 'generate-decision-steps');
      }
      const decisionSteps = await this.generateDecisionSteps(userInput, tripPlanRequest, config, traceId);
      if (this.observability && traceId) {
        this.observability.endStage(traceId, 'generate-decision-steps', {
          decision_steps_generated: decisionSteps.length,
        });
      }

      // Stage 2: 生成 Step Drafts（技术层）
      let stepDraft: any;
      if (this.observability && traceId) {
        this.observability.startStage(traceId, 'generate-step-drafts');
      }
      try {
        stepDraft = await this.chainOfWorkService.generateDraft(tripPlanRequest, {
          model: config?.model || 'claude-3-5-sonnet',
          temperature: config?.temperature || 0.7,
          max_tokens: config?.max_tokens || 2000,
        });
      } catch (error: any) {
        this.logger.warn(`[DecisionDraftGenerator] Step Draft 生成失败，跳过: ${error.message}`);
        // 降级：不生成 Step Draft，仅生成 Decision Steps
        stepDraft = {
          draft_id: `step-draft-${requestId}`,
          steps: [],
        };
        if (this.observability && traceId) {
          this.observability.recordError(traceId, 'generate-step-drafts', error.message);
        }
      }
      if (this.observability && traceId) {
        this.observability.endStage(traceId, 'generate-step-drafts', {
          step_drafts_generated: stepDraft.steps?.length || 0,
        });
      }

      // Stage 3: 映射 Decision Steps → Step Drafts
      if (this.observability && traceId) {
        this.observability.startStage(traceId, 'map-decision-to-step-drafts');
      }
      await this.mapDecisionStepsToStepDrafts(decisionSteps, stepDraft);
      if (this.observability && traceId) {
        this.observability.endStage(traceId, 'map-decision-to-step-drafts');
      }

      // Stage 4: 构建 Decision Draft
      const decisionDraft: DecisionDraft = {
        draft_id: draftId,
        plan_id: tripPlanRequest.request_id || requestId, // 使用 plan_id，与 OrchestratorState 对齐，确保始终有值
        plan_version: 1, // 使用数字版本号，与 OrchestratorState.plan_version 对齐
        decision_steps: decisionSteps,
        step_draft_id: stepDraft.draft_id,
        step_draft: stepDraft,
        user_mode: config?.user_mode || 'toc',
        metadata: {
          decision_count: decisionSteps.length,
          step_count: stepDraft.steps.length,
          created_by: 'system',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };

      // P1: 计算 Metrics 并附加 Debug Info（Studio 模式）
      if (config?.user_mode === 'studio') {
        if (this.observability && traceId) {
          const trace = this.observability.endTrace(traceId, true);
          if (trace) {
            const metrics = this.observability.calculateMetrics(trace, decisionDraft);
            decisionDraft.debug_info = this.observability.buildDebugInfo(trace, metrics);
          }
        } else if (this.debugCollector) {
          // 如果没有 observability 服务，使用 debugCollector
          // 注意：需要从 ChainOfWorkTrace 转换，这里先使用空 trace
          const debugInfo = await this.debugCollector.collectDebugInfo(decisionDraft);
          decisionDraft.debug_info = debugInfo;
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(`[DecisionDraftGenerator] 决策草案生成完成: duration=${duration}ms, decisions=${decisionSteps.length}`);

      return decisionDraft;
    } catch (error: any) {
      // P1: 记录错误到 Trace
      if (this.observability && traceId) {
        this.observability.recordError(traceId, 'generate-decision-draft', error?.message || 'Unknown error');
        this.observability.endTrace(traceId, false);
      }
      this.logger.error(`[DecisionDraftGenerator] 决策草案生成失败: ${error?.message || 'Unknown error'}`, error?.stack);
      throw error;
    }
  }

  /**
   * Stage 1: 生成 Decision Steps（业务层）
   */
  private async generateDecisionSteps(
    userInput: string,
    tripPlanRequest: TripPlanRequest,
    config?: DecisionDraftGenerationConfig,
    traceId?: string | null,
  ): Promise<DecisionStep[]> {
    this.logger.debug(`[DecisionDraftGenerator] 生成 Decision Steps: userInput=${userInput.substring(0, 50)}...`);

    // 1. 识别决策类型
    const decisionTypes = await this.identifyDecisionTypes(userInput, tripPlanRequest, config, traceId);

    // 2. 为每个决策类型生成 Decision Step
    const decisionSteps: DecisionStep[] = [];
    for (const decisionType of decisionTypes) {
      const decisionStep = await this.generateDecisionStep(decisionType, userInput, tripPlanRequest, config, traceId);
      decisionSteps.push(decisionStep);
    }

    return decisionSteps;
  }

  /**
   * 识别决策类型（LLM 分类）
   */
  private async identifyDecisionTypes(
    userInput: string,
    tripPlanRequest: TripPlanRequest,
    config?: DecisionDraftGenerationConfig,
    traceId?: string | null,
  ): Promise<DecisionType[]> {
    const prompt = this.buildDecisionTypeClassificationPrompt(userInput, tripPlanRequest);
    const provider = this.mapModelToProvider(config?.model || 'claude-3-5-sonnet');
    const schema = this.getDecisionTypeClassificationSchema();
    const model = config?.model || 'claude-3-5-sonnet';

    try {
      const callStartTime = Date.now();
      const response = await this.llmService.callLlmWithSchema(provider, prompt, schema);
      const callDuration = Date.now() - callStartTime;
      
      // P1: 记录 LLM 调用
      if (this.observability && traceId) {
        // 估算 tokens（简单估算：1 token ≈ 4 characters）
        const promptTokens = Math.ceil(prompt.length / 4);
        const completionTokens = Math.ceil(response.length / 4);
        // 估算成本（Claude 3.5 Sonnet 价格，实际应从配置获取）
        const costPer1kInput = 0.003;
        const costPer1kOutput = 0.015;
        const costUsd = (promptTokens / 1000) * costPer1kInput + (completionTokens / 1000) * costPer1kOutput;
        
        this.observability.recordLLMCall(traceId, {
          model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_usd: costUsd,
          duration_ms: callDuration,
          prompt: config?.user_mode === 'studio' ? prompt : undefined,
          response: config?.user_mode === 'studio' ? response : undefined,
        });
      }
      
      const data = this.extractJSON(response);
      return (data.decisionTypes || []).map((dt: any) => dt.type as DecisionType);
    } catch (error: any) {
      this.logger.warn(`[DecisionDraftGenerator] 决策类型识别失败，使用默认类型: ${error.message}`);
      // 降级：根据用户输入推断决策类型
      return this.inferDecisionTypes(userInput, tripPlanRequest);
    }
  }

  /**
   * 生成单个 Decision Step
   */
  private async generateDecisionStep(
    decisionType: DecisionType,
    userInput: string,
    tripPlanRequest: TripPlanRequest,
    config?: DecisionDraftGenerationConfig,
    traceId?: string | null,
  ): Promise<DecisionStep> {
    const prompt = this.buildDecisionStepGenerationPrompt(decisionType, userInput, tripPlanRequest);
    const provider = this.mapModelToProvider(config?.model || 'claude-3-5-sonnet');
    const schema = this.getDecisionStepGenerationSchema();
    const model = config?.model || 'claude-3-5-sonnet';

    try {
      const callStartTime = Date.now();
      const response = await this.llmService.callLlmWithSchema(provider, prompt, schema);
      const callDuration = Date.now() - callStartTime;
      
      // P1: 记录 LLM 调用
      if (this.observability && traceId) {
        // 估算 tokens（简单估算：1 token ≈ 4 characters）
        const promptTokens = Math.ceil(prompt.length / 4);
        const completionTokens = Math.ceil(response.length / 4);
        // 估算成本（Claude 3.5 Sonnet 价格，实际应从配置获取）
        const costPer1kInput = 0.003;
        const costPer1kOutput = 0.015;
        const costUsd = (promptTokens / 1000) * costPer1kInput + (completionTokens / 1000) * costPer1kOutput;
        
        this.observability.recordLLMCall(traceId, {
          model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_usd: costUsd,
          duration_ms: callDuration,
          prompt: config?.user_mode === 'studio' ? prompt : undefined,
          response: config?.user_mode === 'studio' ? response : undefined,
        });
      }
      
      const data = this.extractJSON(response);
      return this.parseDecisionStep(data, decisionType);
    } catch (error: any) {
      this.logger.warn(`[DecisionDraftGenerator] Decision Step 生成失败，使用模板: ${error.message}`);
      // 降级：使用模板生成
      return this.generateTemplateDecisionStep(decisionType, tripPlanRequest);
    }
  }

  /**
   * Stage 3: 映射 Decision Steps → Step Drafts
   */
  private async mapDecisionStepsToStepDrafts(
    decisionSteps: DecisionStep[],
    stepDraft: any, // TripNARAWorkflowDraft
  ): Promise<void> {
    for (const decisionStep of decisionSteps) {
      // 获取决策类型对应的步骤类型
      const stepTypes = this.decisionTypeMapper.getStepTypes(decisionStep.type);
      
      // 找到对应的 Step Drafts
      const stepDraftIds: string[] = [];
      for (const stepType of stepTypes) {
        const matchingStep = stepDraft.steps.find((s: any) => s.step_type === stepType);
        if (matchingStep) {
          stepDraftIds.push(matchingStep.id);
        }
      }
      
      decisionStep.step_draft_ids = stepDraftIds;
    }
  }

  /**
   * 构建决策类型分类提示词
   */
  private buildDecisionTypeClassificationPrompt(
    userInput: string,
    tripPlanRequest: TripPlanRequest,
  ): string {
    return `
你是一个 TripNARA 旅行决策分类专家。分析用户输入，识别需要做出的关键旅行决策。

**决策类型**：
1. transport-decision - 是否租车、租什么车
2. pace-decision - 行程节奏判断（太赶/太松）
3. poi-selection - POI 取舍与优先级
4. route-optimization - 顺路与否、是否绕路
5. weather-strategy - 天气与备选方案
6. budget-balance - 预算分配策略

**用户输入**：
${userInput}

**旅行需求**：
${JSON.stringify(tripPlanRequest, null, 2)}

请识别需要做出的决策类型，返回 JSON 格式：
{
  "decisionTypes": [
    {
      "type": "transport-decision",
      "confidence": 0.9,
      "reasoning": "用户提到'不想太赶'，需要判断是否需要租车"
    }
  ]
}
`;
  }

  /**
   * 构建决策步骤生成提示词
   */
  private buildDecisionStepGenerationPrompt(
    decisionType: DecisionType,
    userInput: string,
    tripPlanRequest: TripPlanRequest,
  ): string {
    const mappingRule = this.decisionTypeMapper.getMappingRule(decisionType);
    const stepTypes = mappingRule?.step_types.join(', ') || '';

    return `
你是一个 TripNARA 旅行决策专家。根据用户需求和决策类型，生成决策步骤。

**决策类型**：${decisionType}
**关联步骤类型**：${stepTypes}

**用户输入**：
${userInput}

**旅行需求**：
${JSON.stringify(tripPlanRequest, null, 2)}

请生成决策步骤，必须包含：
- 决策标题
- 决策描述
- 输入参数（从用户需求和旅行需求中提取）
- 输出结论（决策结果）
- 证据来源（数据来源）

返回 JSON 格式：
{
  "id": "d1",
  "title": "判断是否需要租车",
  "description": "基于目的地公共交通覆盖率与日行程密度",
  "inputs": [
    {
      "name": "目的地",
      "value": "冰岛",
      "source": "user"
    }
  ],
  "outputs": [
    {
      "name": "是否租车",
      "value": "是",
      "confidence": 0.87
    }
  ],
  "evidence": [
    {
      "source_title": "POI密度分析",
      "weight": 0.4
    }
  ]
}
`;
  }

  /**
   * 解析 Decision Step
   */
  private parseDecisionStep(data: any, decisionType: DecisionType): DecisionStep {
    const now = new Date().toISOString();
    
    return {
      id: data.id || `decision-${decisionType}-${Date.now()}`,
      title: data.title || decisionType,
      description: data.description || '',
      type: decisionType,
      status: 'pending',
      confidence: data.outputs?.[0]?.confidence || 0.7,
      inputs: (data.inputs || []).map((input: any) => ({
        name: input.name || '',
        value: input.value,
        source: input.source || 'inferred',
      })),
      outputs: (data.outputs || []).map((output: any) => ({
        name: output.name || '',
        value: output.value,
        confidence: output.confidence || 0.7,
      })),
      evidence: (data.evidence || []).map((ev: any) => ({
        evidence_id: ev.evidence_id || `evidence-${Date.now()}`,
        source: ev.source_title || ev.source || 'unknown',
        source_title: ev.source_title || '',
        source_url: ev.source_url,
        last_verified_at: ev.last_verified_at || ev.retrieved_at || new Date().toISOString(),
        excerpt: ev.excerpt,
        confidence: ev.weight || ev.confidence || 0.5, // 使用 confidence 而非 weight
        relevance: ev.relevance || 0.5,
      })),
      decision_log: [],
      step_draft_ids: [],
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * 生成模板 Decision Step（降级策略）
   */
  private generateTemplateDecisionStep(
    decisionType: DecisionType,
    tripPlanRequest: TripPlanRequest,
  ): DecisionStep {
    const now = new Date().toISOString();
    const mappingRule = this.decisionTypeMapper.getMappingRule(decisionType);

    return {
      id: `decision-${decisionType}-${Date.now()}`,
      title: this.getDecisionTypeTitle(decisionType),
      description: this.getDecisionTypeDescription(decisionType),
      type: decisionType,
      status: 'pending',
      confidence: 0.7,
      inputs: [
        {
          name: '目的地',
          value: tripPlanRequest.destination,
          source: 'user',
        },
        {
          name: '天数',
          value: tripPlanRequest.days,
          source: 'user',
        },
      ],
      outputs: [],
      evidence: [],
      decision_log: [],
      step_draft_ids: [],
      guardian_review: mappingRule?.guardian ? {
        [mappingRule.guardian.toLowerCase()]: {
          verdict: 'ALLOW' as const, // 使用 verdict 而非 action
          evidence: [], // 添加 evidence 字段
          explanation: '待生成',
          confidence: 0.7,
        },
      } : undefined,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * 推断决策类型（降级策略）
   */
  private inferDecisionTypes(
    userInput: string,
    tripPlanRequest: TripPlanRequest,
  ): DecisionType[] {
    const types: DecisionType[] = [];
    const inputLower = userInput.toLowerCase();

    // 简单关键词匹配
    if (inputLower.includes('租车') || inputLower.includes('自驾') || inputLower.includes('开车')) {
      types.push('transport-decision');
    }
    if (inputLower.includes('太赶') || inputLower.includes('节奏') || inputLower.includes('轻松')) {
      types.push('pace-decision');
    }
    if (inputLower.includes('景点') || inputLower.includes('poi') || inputLower.includes('推荐')) {
      types.push('poi-selection');
    }
    if (inputLower.includes('天气') || inputLower.includes('下雨') || inputLower.includes('备选')) {
      types.push('weather-strategy');
    }
    if (inputLower.includes('预算') || inputLower.includes('价格') || inputLower.includes('花费')) {
      types.push('budget-balance');
    }

    // 默认至少包含 transport-decision 和 pace-decision
    if (types.length === 0) {
      types.push('transport-decision', 'pace-decision');
    }

    return types;
  }

  /**
   * 获取决策类型标题
   */
  private getDecisionTypeTitle(decisionType: DecisionType): string {
    const titles: Record<DecisionType, string> = {
      'transport-decision': '判断是否需要租车',
      'pace-decision': '判断行程节奏',
      'poi-selection': '选择 POI 和优先级',
      'route-optimization': '优化路线顺序',
      'weather-strategy': '制定天气策略',
      'budget-balance': '平衡预算分配',
    };
    return titles[decisionType] || decisionType;
  }

  /**
   * 获取决策类型描述
   */
  private getDecisionTypeDescription(decisionType: DecisionType): string {
    const descriptions: Record<DecisionType, string> = {
      'transport-decision': '基于目的地公共交通覆盖率与日行程密度，判断是否需要租车',
      'pace-decision': '基于用户需求和体力限制，判断行程节奏',
      'poi-selection': '基于用户偏好和POI评分，选择POI和设置优先级',
      'route-optimization': '基于距离和时间，优化路线顺序',
      'weather-strategy': '基于天气预报，制定天气备选方案',
      'budget-balance': '基于预算约束，平衡各项支出',
    };
    return descriptions[decisionType] || '';
  }

  /**
   * 提取 JSON（从 LLM 响应中）
   */
  private extractJSON(response: string): any {
    // 尝试提取 JSON（可能在代码块中）
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    // 尝试直接解析
    return JSON.parse(response);
  }

  /**
   * 映射模型到提供商
   */
  private mapModelToProvider(model: string): LlmProvider {
    const modelLower = model.toLowerCase();
    if (modelLower.includes('claude')) {
      return LlmProvider.ANTHROPIC;
    }
    if (modelLower.includes('gpt') || modelLower.includes('openai')) {
      return LlmProvider.OPENAI;
    }
    if (modelLower.includes('deepseek')) {
      return LlmProvider.DEEPSEEK;
    }
    if (modelLower.includes('gemini')) {
      return LlmProvider.GEMINI;
    }
    return LlmProvider.ANTHROPIC; // 默认
  }

  /**
   * 从 OrchestratorState 生成 Decision Step（用于状态机集成）
   * 
   * 在状态机步骤执行后调用，生成对应的 Decision Step
   */
  async generateDecisionStepFromOrchestrationState(
    state: OrchestratorState,
    orchestrationStep: OrchestrationStep,
    subAgent?: SubAgentType,
  ): Promise<DecisionStep | null> {
    this.logger.debug(`[DecisionDraftGenerator] 从状态机步骤生成 Decision Step: step=${orchestrationStep}, subAgent=${subAgent}`);

    // 根据状态机步骤映射到决策类型
    const decisionType = this.mapOrchestrationStepToDecisionType(orchestrationStep, subAgent);
    if (!decisionType) {
      return null; // 某些步骤不需要生成 Decision Step
    }

    // 构建用户输入摘要（从 state 中提取）
    const userInput = this.extractUserInputFromState(state);

    // 构建 TripPlanRequest（从 state 中提取）
    const tripPlanRequest = state.trip_plan_request || {
      request_id: state.request_id,
      origin: '',
      destination: '',
    };

    // 生成 Decision Step
    try {
      const decisionStep = await this.generateDecisionStep(decisionType, userInput, tripPlanRequest);
      
      // 关联状态机步骤信息
      decisionStep.step_draft_ids = []; // 将在后续步骤中填充
      
      // 关联证据（从 state.evidence_registry 中提取）
      if (state.evidence_registry) {
        decisionStep.evidence = Array.from(state.evidence_registry.values());
      }

      // 关联决策日志（从 state.decision_log 中提取）
      if (state.decision_log) {
        decisionStep.decision_log = state.decision_log.filter(
          (log) => log.step === orchestrationStep,
        );
      }

      // 关联三人格评审（从 state.gate_result.guardian_results 中提取）
      if (state.gate_result?.guardian_results) {
        const guardianResults = state.gate_result.guardian_results;
        decisionStep.guardian_review = {};
        
        if (guardianResults.abu) {
          decisionStep.guardian_review.abu = {
            verdict: guardianResults.abu.verdict,
            evidence: guardianResults.abu.evidence,
          };
        }
        if (guardianResults.drdre) {
          decisionStep.guardian_review.dr_dre = {
            verdict: guardianResults.drdre.verdict,
            evidence: guardianResults.drdre.evidence,
          };
        }
        if (guardianResults.neptune) {
          decisionStep.guardian_review.neptune = {
            verdict: guardianResults.neptune.verdict,
            evidence: guardianResults.neptune.evidence,
          };
        }
      }

      return decisionStep;
    } catch (error: any) {
      this.logger.warn(`[DecisionDraftGenerator] 从状态机步骤生成 Decision Step 失败: ${error.message}`);
      return null; // 失败时不阻塞状态机流程
    }
  }

  /**
   * 映射状态机步骤到决策类型
   */
  private mapOrchestrationStepToDecisionType(
    step: OrchestrationStep,
    subAgent?: SubAgentType,
  ): DecisionType | null {
    // 根据状态机步骤和 Sub-Agent 映射到决策类型
    const mapping: Record<string, DecisionType | null> = {
      'INTAKE': 'poi-selection', // 意图解析和缺口识别
      'RESEARCH': 'poi-selection', // 研究阶段主要涉及 POI 选择
      'GATE_EVAL': 'transport-decision', // Gate 评估主要涉及交通决策
      'PLAN_GEN': 'pace-decision', // 计划生成主要涉及节奏决策
      'VERIFY': 'route-optimization', // 验证主要涉及路线优化
      'REPAIR': 'weather-strategy', // 修复主要涉及天气策略
      'NARRATE': null, // 叙述步骤不需要生成 Decision Step
    };

    return mapping[step] || null;
  }

  /**
   * 从 OrchestratorState 提取用户输入摘要
   */
  private extractUserInputFromState(state: OrchestratorState): string {
    // 从 state.trip_plan_request 或 state.gaps 中提取用户输入摘要
    if (state.trip_plan_request) {
      const req = state.trip_plan_request;
      return `目的地: ${req.destination}, 天数: ${req.days || '未知'}`;
    }
    return '用户请求';
  }

  /**
   * 获取决策类型分类 Schema
   */
  private getDecisionTypeClassificationSchema(): any {
    return {
      type: 'object',
      properties: {
        decisionTypes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['transport-decision', 'pace-decision', 'poi-selection', 'route-optimization', 'weather-strategy', 'budget-balance'],
              },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              reasoning: { type: 'string' },
            },
            required: ['type', 'confidence'],
          },
        },
      },
      required: ['decisionTypes'],
    };
  }

  /**
   * 获取决策步骤生成 Schema
   */
  private getDecisionStepGenerationSchema(): any {
    return {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        inputs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: {},
              source: { type: 'string', enum: ['user', 'system', 'inferred'] },
            },
            required: ['name', 'value'],
          },
        },
        outputs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: {},
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['name', 'value'],
          },
        },
        evidence: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source_title: { type: 'string' },
              weight: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['source_title'],
          },
        },
      },
      required: ['id', 'title', 'inputs', 'outputs'],
    };
  }
}