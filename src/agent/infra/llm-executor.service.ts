// src/agent/infra/llm-executor.service.ts
/**
 * LLMExecutor - LLM 调用统一入口
 * 
 * 职责：
 * - Token 预算控制
 * - 超时控制
 * - Fallback 策略（LLM失败时切换到模板）
 * - 重试策略
 * - 统一日志与遥测
 * 
 * 架构位置：Agent Infra 层
 * 调用关系：所有需要 LLM 的组件都通过此服务调用
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { TokenStatsService } from '../services/token-stats.service';
import { SubAgentType, OrchestrationStep } from '../interfaces/trip-plan.interface';

// ============== 类型定义 ==============

export interface LLMBudget {
  maxTokens: number;          // 最大 token 数
  maxDurationMs: number;      // 最大执行时间（毫秒）
  priority: 'low' | 'normal' | 'high' | 'critical';
}

export interface LLMCallOptions {
  budget?: Partial<LLMBudget>;
  provider?: LlmProvider;
  schema?: object;            // JSON Schema for structured output
  temperature?: number;
  fallbackTemplate?: string;  // 降级时使用的模板
  traceId?: string;           // 链路追踪ID
  caller?: string;            // 调用方标识
  // Token统计上下文信息（可选）
  context?: {
    sub_agent?: SubAgentType;
    state_machine_step?: OrchestrationStep;
    task_type?: string;
    request_id?: string;
  };
}

export interface LLMCallResult<T = string> {
  success: boolean;
  result?: T;
  error?: string;
  
  // 遥测数据
  metrics: {
    provider: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs: number;
    retryCount: number;
    fallbackUsed: boolean;
  };
  
  // 预算状态
  budgetStatus: {
    tokensUsed: number;
    tokensRemaining: number;
    timeUsed: number;
    timeRemaining: number;
    exceeded: boolean;
  };
}

// 默认预算配置
const DEFAULT_BUDGETS: Record<string, LLMBudget> = {
  // 子智能体预算（单个）
  subAgent: { maxTokens: 1500, maxDurationMs: 3000, priority: 'normal' },
  // Narrator 预算
  narrator: { maxTokens: 1000, maxDurationMs: 2000, priority: 'normal' },
  // Router 预算
  router: { maxTokens: 500, maxDurationMs: 1000, priority: 'high' },
  // 对话预算
  conversation: { maxTokens: 2000, maxDurationMs: 5000, priority: 'normal' },
  // 默认预算
  default: { maxTokens: 2000, maxDurationMs: 5000, priority: 'normal' },
};

@Injectable()
export class LLMExecutorService {
  private readonly logger = new Logger(LLMExecutorService.name);
  
  // 调用统计（用于遥测）
  private callStats = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    fallbackCalls: 0,
    totalTokens: 0,
    totalDurationMs: 0,
  };

  constructor(
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly tokenStatsService?: TokenStatsService,
  ) {
    this.logger.log('🚀 LLMExecutor 已初始化');
    if (this.tokenStatsService) {
      this.logger.log('[LLMExecutor] TokenStatsService 已注入');
    }
  }

  // ============== 核心方法 ==============

  /**
   * 执行 LLM 调用（统一入口）
   */
  async execute(
    prompt: string,
    options: LLMCallOptions = {},
  ): Promise<LLMCallResult<string>> {
    const startTime = Date.now();
    const traceId = options.traceId || this.generateTraceId();
    const caller = options.caller || 'unknown';
    
    // 合并预算配置
    const budget = this.resolveBudget(options.budget, caller);
    
    this.logger.debug(`[${traceId}] LLM调用开始 | caller=${caller} | budget=${JSON.stringify(budget)}`);
    this.callStats.totalCalls++;

    // 检查是否有 LLM 服务
    if (!this.llmService) {
      this.logger.warn(`[${traceId}] LLM服务不可用，使用降级策略`);
      return this.handleFallback(prompt, options, startTime, budget, traceId, 'LLM服务不可用');
    }

    let retryCount = 0;
    const maxRetries = budget.priority === 'critical' ? 3 : (budget.priority === 'high' ? 2 : 1);
    let lastError: Error | null = null;

    while (retryCount <= maxRetries) {
      try {
        // 检查时间预算
        const elapsed = Date.now() - startTime;
        if (elapsed >= budget.maxDurationMs) {
          throw new Error(`时间预算超出: ${elapsed}ms >= ${budget.maxDurationMs}ms`);
        }

        // 执行 LLM 调用
        const provider = options.provider || this.llmService.getDefaultProvider();
        const response = await this.callLLMWithTimeout(
          provider,
          prompt,
          options.schema,
          budget.maxDurationMs - elapsed,
        );

        // 提取Token使用（优先从API响应提取，失败时使用估算）
        // 注意：当前LlmService只返回字符串，无法获取API响应中的usage信息
        // 因此暂时使用估算方法，后续可以修改LlmService返回完整响应
        const promptTokens = Math.ceil(prompt.length / 4);
        const completionTokens = Math.ceil(response.length / 4);
        const totalTokens = promptTokens + completionTokens;
        
        // 记录Token使用统计（异步，不影响主流程）
        this.recordTokenUsage({
          provider,
          prompt,
          response,
          promptTokens,
          completionTokens,
          totalTokens,
          durationMs: Date.now() - startTime,
          success: true,
          traceId,
          options,
        });

        // 检查 token 预算
        if (totalTokens > budget.maxTokens) {
          this.logger.warn(`[${traceId}] Token预算超出: ${totalTokens} > ${budget.maxTokens}`);
        }

        const durationMs = Date.now() - startTime;
        
        // 更新统计
        this.callStats.successfulCalls++;
        this.callStats.totalTokens += totalTokens;
        this.callStats.totalDurationMs += durationMs;

        this.logger.debug(`[${traceId}] LLM调用成功 | tokens=${totalTokens} | duration=${durationMs}ms`);

        return {
          success: true,
          result: response,
          metrics: {
            provider: provider,
            promptTokens,
            completionTokens,
            totalTokens,
            durationMs,
            retryCount,
            fallbackUsed: false,
          },
          budgetStatus: {
            tokensUsed: totalTokens,
            tokensRemaining: Math.max(0, budget.maxTokens - totalTokens),
            timeUsed: durationMs,
            timeRemaining: Math.max(0, budget.maxDurationMs - durationMs),
            exceeded: totalTokens > budget.maxTokens || durationMs > budget.maxDurationMs,
          },
        };

      } catch (error: any) {
        lastError = error;
        retryCount++;
        
        this.logger.warn(`[${traceId}] LLM调用失败 (尝试 ${retryCount}/${maxRetries + 1}): ${error.message}`);
        
        if (retryCount <= maxRetries) {
          // 指数退避
          const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
          await this.sleep(backoffMs);
        }
      }
    }

    // 所有重试失败，使用降级策略
    this.callStats.failedCalls++;
    
    // 记录Token使用统计（失败情况）
    this.recordTokenUsage({
      provider: options.provider || this.llmService?.getDefaultProvider() || LlmProvider.DEEPSEEK,
      prompt,
      response: '',
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: 0,
      totalTokens: Math.ceil(prompt.length / 4),
      durationMs: Date.now() - startTime,
      success: false,
      error: lastError?.message,
      traceId,
      options,
    });
    return this.handleFallback(prompt, options, startTime, budget, traceId, lastError?.message || '未知错误');
  }

  /**
   * 执行 LLM 调用并返回结构化结果
   */
  async executeWithSchema<T>(
    prompt: string,
    schema: object,
    options: LLMCallOptions = {},
  ): Promise<LLMCallResult<T>> {
    const result = await this.execute(prompt, { ...options, schema });
    
    if (result.success && result.result) {
      try {
        const parsed = this.extractJSON(result.result);
        return {
          ...result,
          result: parsed as T,
        };
      } catch (e: any) {
        this.logger.warn(`JSON解析失败: ${e.message}`);
        return {
          ...result,
          success: false,
          error: `JSON解析失败: ${e.message}`,
          result: undefined,
        };
      }
    }
    
    return result as LLMCallResult<T>;
  }

  /**
   * 获取预算配置（按调用方）
   */
  getBudgetForCaller(caller: string): LLMBudget {
    return DEFAULT_BUDGETS[caller] || DEFAULT_BUDGETS.default;
  }

  /**
   * 获取调用统计
   */
  getStats() {
    return {
      ...this.callStats,
      successRate: this.callStats.totalCalls > 0 
        ? (this.callStats.successfulCalls / this.callStats.totalCalls * 100).toFixed(2) + '%'
        : 'N/A',
      averageTokens: this.callStats.successfulCalls > 0
        ? Math.round(this.callStats.totalTokens / this.callStats.successfulCalls)
        : 0,
      averageDurationMs: this.callStats.successfulCalls > 0
        ? Math.round(this.callStats.totalDurationMs / this.callStats.successfulCalls)
        : 0,
    };
  }

  // ============== 私有方法 ==============

  private resolveBudget(partialBudget?: Partial<LLMBudget>, caller?: string): LLMBudget {
    const baseBudget = caller ? this.getBudgetForCaller(caller) : DEFAULT_BUDGETS.default;
    return {
      ...baseBudget,
      ...partialBudget,
    };
  }

  private async callLLMWithTimeout(
    provider: LlmProvider,
    prompt: string,
    schema?: object,
    timeoutMs?: number,
  ): Promise<string> {
    const timeout = timeoutMs || 10000;
    
    // 使用公开的 callLlmWithSchema 方法
    // 注意：callLlm 是私有方法，所以我们统一使用 callLlmWithSchema
    // 如果没有 schema，传入一个简单的 string schema
    const defaultSchema = schema || { type: 'string', description: 'response' };
    const llmPromise = this.llmService!.callLlmWithSchema(provider, prompt, defaultSchema);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`LLM调用超时 (${timeout}ms)`)), timeout);
    });

    return Promise.race([llmPromise, timeoutPromise]);
  }

  private handleFallback(
    prompt: string,
    options: LLMCallOptions,
    startTime: number,
    budget: LLMBudget,
    traceId: string,
    errorMessage: string,
  ): LLMCallResult<string> {
    this.callStats.fallbackCalls++;
    const durationMs = Date.now() - startTime;

    // 如果提供了降级模板，使用模板
    if (options.fallbackTemplate) {
      this.logger.warn(`[${traceId}] 使用降级模板`);
      return {
        success: true,
        result: options.fallbackTemplate,
        metrics: {
          provider: 'fallback_template',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          durationMs,
          retryCount: 0,
          fallbackUsed: true,
        },
        budgetStatus: {
          tokensUsed: 0,
          tokensRemaining: budget.maxTokens,
          timeUsed: durationMs,
          timeRemaining: Math.max(0, budget.maxDurationMs - durationMs),
          exceeded: false,
        },
      };
    }

    // 默认降级响应
    this.logger.warn(`[${traceId}] LLM降级: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      metrics: {
        provider: 'none',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs,
        retryCount: 0,
        fallbackUsed: true,
      },
      budgetStatus: {
        tokensUsed: 0,
        tokensRemaining: budget.maxTokens,
        timeUsed: durationMs,
        timeRemaining: Math.max(0, budget.maxDurationMs - durationMs),
        exceeded: false,
      },
    };
  }

  private extractJSON(response: string): any {
    let cleaned = response.trim();
    
    // 移除 markdown 代码块标记
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    cleaned = cleaned.trim();
    
    // 尝试提取 JSON 对象
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    return JSON.parse(cleaned);
  }

  private generateTraceId(): string {
    return `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 记录Token使用统计（异步，不影响主流程）
   */
  private async recordTokenUsage(params: {
    provider: LlmProvider;
    prompt: string;
    response: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs: number;
    success: boolean;
    error?: string;
    traceId: string;
    options: LLMCallOptions;
  }): Promise<void> {
    // 如果TokenStatsService未注入，跳过记录
    if (!this.tokenStatsService) {
      return;
    }

    try {
      // 从上下文信息中提取Sub-Agent和任务类型
      const context = params.options.context || {};
      const subAgent = context.sub_agent || this.inferSubAgentFromCaller(params.options.caller);
      const stateMachineStep = context.state_machine_step || this.inferStepFromCaller(params.options.caller);
      const taskType = context.task_type || this.inferTaskTypeFromCaller(params.options.caller);
      
      // 获取模型名称（简化版，实际应该从provider推断）
      const model = this.getModelName(params.provider);
      
      // 记录Token使用
      await this.tokenStatsService.recordTokenUsage({
        request_id: context.request_id || params.traceId,
        trace_id: params.traceId,
        span_id: `${params.traceId}-span`,
        sub_agent: subAgent,
        state_machine_step: stateMachineStep,
        task_type: taskType,
        provider: params.provider,
        model: model,
        prompt_tokens: params.promptTokens,
        completion_tokens: params.completionTokens,
        total_tokens: params.totalTokens,
        duration_ms: params.durationMs,
        success: params.success,
        error: params.error,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      // 记录失败不影响主流程
      this.logger.warn(`[LLMExecutor] 记录Token使用失败: ${error?.message}`);
    }
  }

  /**
   * 从caller推断Sub-Agent类型
   */
  private inferSubAgentFromCaller(caller?: string): SubAgentType {
    if (!caller) return 'Planner';
    
    // 根据caller名称推断Sub-Agent
    const callerLower = caller.toLowerCase();
    if (callerLower.includes('planner')) return 'Planner';
    if (callerLower.includes('gatekeeper')) return 'Gatekeeper';
    if (callerLower.includes('narrator')) return 'Narrator';
    if (callerLower.includes('compliance')) return 'Compliance';
    if (callerLower.includes('localinsight') || callerLower.includes('local_insight')) return 'LocalInsight';
    if (callerLower.includes('coredecision') || callerLower.includes('core_decision')) return 'CoreDecision';
    if (callerLower.includes('orchestrator')) return 'Orchestrator';
    
    return 'Planner'; // 默认
  }

  /**
   * 从caller推断状态机步骤
   */
  private inferStepFromCaller(caller?: string): OrchestrationStep {
    if (!caller) return 'INTAKE';
    
    // 根据caller名称推断步骤
    const callerLower = caller.toLowerCase();
    if (callerLower.includes('intake')) return 'INTAKE';
    if (callerLower.includes('research')) return 'RESEARCH';
    if (callerLower.includes('gate') || callerLower.includes('gate_eval')) return 'GATE_EVAL';
    if (callerLower.includes('plan') || callerLower.includes('plan_gen')) return 'PLAN_GEN';
    if (callerLower.includes('verify')) return 'VERIFY';
    if (callerLower.includes('repair')) return 'REPAIR';
    if (callerLower.includes('narrate')) return 'NARRATE';
    
    return 'INTAKE'; // 默认
  }

  /**
   * 从caller推断任务类型
   */
  private inferTaskTypeFromCaller(caller?: string): string {
    if (!caller) return 'unknown';
    
    // 根据caller名称推断任务类型
    const callerLower = caller.toLowerCase();
    if (callerLower.includes('intake')) return 'intent_parsing';
    if (callerLower.includes('gate')) return 'gate_evaluation';
    if (callerLower.includes('plan')) return 'itinerary_generation';
    if (callerLower.includes('verify')) return 'verification';
    if (callerLower.includes('repair')) return 'repair';
    if (callerLower.includes('narrate')) return 'narration';
    
    return 'unknown';
  }

  /**
   * 获取模型名称（简化版）
   */
  private getModelName(provider: LlmProvider): string {
    switch (provider) {
      case LlmProvider.OPENAI:
        return 'gpt-4o'; // 默认模型
      case LlmProvider.ANTHROPIC:
        return 'claude-3-5-sonnet-20241022'; // 默认模型
      case LlmProvider.DEEPSEEK:
        return 'deepseek-chat';
      case LlmProvider.GEMINI:
        return 'gemini-pro';
      default:
        return 'unknown';
    }
  }
}
