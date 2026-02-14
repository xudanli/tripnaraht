"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var LLMExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMExecutorService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const token_stats_service_1 = require("../services/token-stats.service");
const DEFAULT_BUDGETS = {
    subAgent: { maxTokens: 1500, maxDurationMs: 3000, priority: 'normal' },
    narrator: { maxTokens: 1000, maxDurationMs: 2000, priority: 'normal' },
    router: { maxTokens: 500, maxDurationMs: 1000, priority: 'high' },
    conversation: { maxTokens: 2000, maxDurationMs: 5000, priority: 'normal' },
    default: { maxTokens: 2000, maxDurationMs: 5000, priority: 'normal' },
};
let LLMExecutorService = LLMExecutorService_1 = class LLMExecutorService {
    constructor(llmService, tokenStatsService) {
        this.llmService = llmService;
        this.tokenStatsService = tokenStatsService;
        this.logger = new common_1.Logger(LLMExecutorService_1.name);
        this.callStats = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            fallbackCalls: 0,
            totalTokens: 0,
            totalDurationMs: 0,
        };
        this.logger.log('🚀 LLMExecutor 已初始化');
        if (this.tokenStatsService) {
            this.logger.log('[LLMExecutor] TokenStatsService 已注入');
        }
    }
    async execute(prompt, options = {}) {
        var _a;
        const startTime = Date.now();
        const traceId = options.traceId || this.generateTraceId();
        const caller = options.caller || 'unknown';
        const budget = this.resolveBudget(options.budget, caller);
        this.logger.debug(`[${traceId}] LLM调用开始 | caller=${caller} | budget=${JSON.stringify(budget)}`);
        this.callStats.totalCalls++;
        if (!this.llmService) {
            this.logger.warn(`[${traceId}] LLM服务不可用，使用降级策略`);
            return this.handleFallback(prompt, options, startTime, budget, traceId, 'LLM服务不可用');
        }
        let retryCount = 0;
        const maxRetries = budget.priority === 'critical' ? 3 : (budget.priority === 'high' ? 2 : 1);
        let lastError = null;
        while (retryCount <= maxRetries) {
            try {
                const elapsed = Date.now() - startTime;
                if (elapsed >= budget.maxDurationMs) {
                    throw new Error(`时间预算超出: ${elapsed}ms >= ${budget.maxDurationMs}ms`);
                }
                const provider = options.provider || this.llmService.getDefaultProvider();
                const response = await this.callLLMWithTimeout(provider, prompt, options.schema, budget.maxDurationMs - elapsed);
                const promptTokens = Math.ceil(prompt.length / 4);
                const completionTokens = Math.ceil(response.length / 4);
                const totalTokens = promptTokens + completionTokens;
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
                if (totalTokens > budget.maxTokens) {
                    this.logger.warn(`[${traceId}] Token预算超出: ${totalTokens} > ${budget.maxTokens}`);
                }
                const durationMs = Date.now() - startTime;
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
            }
            catch (error) {
                lastError = error;
                retryCount++;
                this.logger.warn(`[${traceId}] LLM调用失败 (尝试 ${retryCount}/${maxRetries + 1}): ${error.message}`);
                if (retryCount <= maxRetries) {
                    const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
                    await this.sleep(backoffMs);
                }
            }
        }
        this.callStats.failedCalls++;
        this.recordTokenUsage({
            provider: options.provider || ((_a = this.llmService) === null || _a === void 0 ? void 0 : _a.getDefaultProvider()) || llm_request_dto_1.LlmProvider.DEEPSEEK,
            prompt,
            response: '',
            promptTokens: Math.ceil(prompt.length / 4),
            completionTokens: 0,
            totalTokens: Math.ceil(prompt.length / 4),
            durationMs: Date.now() - startTime,
            success: false,
            error: lastError === null || lastError === void 0 ? void 0 : lastError.message,
            traceId,
            options,
        });
        return this.handleFallback(prompt, options, startTime, budget, traceId, (lastError === null || lastError === void 0 ? void 0 : lastError.message) || '未知错误');
    }
    async executeWithSchema(prompt, schema, options = {}) {
        const result = await this.execute(prompt, { ...options, schema });
        if (result.success && result.result) {
            try {
                const parsed = this.extractJSON(result.result);
                return {
                    ...result,
                    result: parsed,
                };
            }
            catch (e) {
                this.logger.warn(`JSON解析失败: ${e.message}`);
                return {
                    ...result,
                    success: false,
                    error: `JSON解析失败: ${e.message}`,
                    result: undefined,
                };
            }
        }
        return result;
    }
    getBudgetForCaller(caller) {
        return DEFAULT_BUDGETS[caller] || DEFAULT_BUDGETS.default;
    }
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
    resolveBudget(partialBudget, caller) {
        const baseBudget = caller ? this.getBudgetForCaller(caller) : DEFAULT_BUDGETS.default;
        return {
            ...baseBudget,
            ...partialBudget,
        };
    }
    async callLLMWithTimeout(provider, prompt, schema, timeoutMs) {
        const timeout = timeoutMs || 10000;
        const defaultSchema = schema || { type: 'string', description: 'response' };
        const llmPromise = this.llmService.callLlmWithSchema(provider, prompt, defaultSchema);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`LLM调用超时 (${timeout}ms)`)), timeout);
        });
        return Promise.race([llmPromise, timeoutPromise]);
    }
    handleFallback(prompt, options, startTime, budget, traceId, errorMessage) {
        this.callStats.fallbackCalls++;
        const durationMs = Date.now() - startTime;
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
    extractJSON(response) {
        let cleaned = response.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
        cleaned = cleaned.replace(/\s*```$/i, '');
        cleaned = cleaned.trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleaned = jsonMatch[0];
        }
        return JSON.parse(cleaned);
    }
    generateTraceId() {
        return `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async recordTokenUsage(params) {
        if (!this.tokenStatsService) {
            return;
        }
        try {
            const context = params.options.context || {};
            const subAgent = context.sub_agent || this.inferSubAgentFromCaller(params.options.caller);
            const stateMachineStep = context.state_machine_step || this.inferStepFromCaller(params.options.caller);
            const taskType = context.task_type || this.inferTaskTypeFromCaller(params.options.caller);
            const model = this.getModelName(params.provider);
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
        }
        catch (error) {
            this.logger.warn(`[LLMExecutor] 记录Token使用失败: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    inferSubAgentFromCaller(caller) {
        if (!caller)
            return 'Planner';
        const callerLower = caller.toLowerCase();
        if (callerLower.includes('planner'))
            return 'Planner';
        if (callerLower.includes('gatekeeper'))
            return 'Gatekeeper';
        if (callerLower.includes('narrator'))
            return 'Narrator';
        if (callerLower.includes('compliance'))
            return 'Compliance';
        if (callerLower.includes('localinsight') || callerLower.includes('local_insight'))
            return 'LocalInsight';
        if (callerLower.includes('coredecision') || callerLower.includes('core_decision'))
            return 'CoreDecision';
        if (callerLower.includes('orchestrator'))
            return 'Orchestrator';
        return 'Planner';
    }
    inferStepFromCaller(caller) {
        if (!caller)
            return 'INTAKE';
        const callerLower = caller.toLowerCase();
        if (callerLower.includes('intake'))
            return 'INTAKE';
        if (callerLower.includes('research'))
            return 'RESEARCH';
        if (callerLower.includes('gate') || callerLower.includes('gate_eval'))
            return 'GATE_EVAL';
        if (callerLower.includes('plan') || callerLower.includes('plan_gen'))
            return 'PLAN_GEN';
        if (callerLower.includes('verify'))
            return 'VERIFY';
        if (callerLower.includes('repair'))
            return 'REPAIR';
        if (callerLower.includes('narrate'))
            return 'NARRATE';
        return 'INTAKE';
    }
    inferTaskTypeFromCaller(caller) {
        if (!caller)
            return 'unknown';
        const callerLower = caller.toLowerCase();
        if (callerLower.includes('intake'))
            return 'intent_parsing';
        if (callerLower.includes('gate'))
            return 'gate_evaluation';
        if (callerLower.includes('plan'))
            return 'itinerary_generation';
        if (callerLower.includes('verify'))
            return 'verification';
        if (callerLower.includes('repair'))
            return 'repair';
        if (callerLower.includes('narrate'))
            return 'narration';
        return 'unknown';
    }
    getModelName(provider) {
        switch (provider) {
            case llm_request_dto_1.LlmProvider.OPENAI:
                return 'gpt-4o';
            case llm_request_dto_1.LlmProvider.ANTHROPIC:
                return 'claude-3-5-sonnet-20241022';
            case llm_request_dto_1.LlmProvider.DEEPSEEK:
                return 'deepseek-chat';
            case llm_request_dto_1.LlmProvider.GEMINI:
                return 'gemini-pro';
            default:
                return 'unknown';
        }
    }
};
exports.LLMExecutorService = LLMExecutorService;
exports.LLMExecutorService = LLMExecutorService = LLMExecutorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        token_stats_service_1.TokenStatsService])
], LLMExecutorService);
//# sourceMappingURL=llm-executor.service.js.map