"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DecisionDebugCollectorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionDebugCollectorService = void 0;
const common_1 = require("@nestjs/common");
let DecisionDebugCollectorService = DecisionDebugCollectorService_1 = class DecisionDebugCollectorService {
    constructor() {
        this.logger = new common_1.Logger(DecisionDebugCollectorService_1.name);
    }
    async collectDebugInfo(decisionDraft, executionTrace) {
        this.logger.log(`[DecisionDebugCollector] 收集调试信息: draft_id=${decisionDraft.draft_id}`);
        const debugInfo = {};
        if (executionTrace) {
            debugInfo.llm_calls = await this.collectLLMCalls(executionTrace);
            debugInfo.skill_calls = await this.collectSkillCalls(executionTrace);
            debugInfo.performance_metrics = await this.calculatePerformanceMetrics(executionTrace);
            debugInfo.execution_trace = executionTrace;
        }
        return debugInfo;
    }
    async collectLLMCalls(executionTrace) {
        const llmCalls = [];
        executionTrace.steps.forEach((step, index) => {
            if (step.cost_est_usd && step.cost_est_usd > 0) {
                llmCalls.push({
                    call_id: `llm-call-${step.step_id}-${index}`,
                    model: 'claude-3-5-sonnet',
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    cost_usd: step.cost_est_usd,
                    duration_ms: step.duration_ms || 0,
                    timestamp: step.start_time,
                });
            }
        });
        this.logger.log(`[DecisionDebugCollector] 收集到 ${llmCalls.length} 个 LLM 调用`);
        return llmCalls;
    }
    async collectSkillCalls(executionTrace) {
        const skillCallMap = new Map();
        executionTrace.steps.forEach((step) => {
            if (step.skills_called && step.skills_called.length > 0) {
                step.skills_called.forEach((skillName) => {
                    const existing = skillCallMap.get(skillName);
                    if (existing) {
                        existing.call_count += 1;
                        existing.total_duration_ms += step.duration_ms || 0;
                        if (step.error) {
                            existing.errors += 1;
                        }
                    }
                    else {
                        skillCallMap.set(skillName, {
                            skill_name: skillName,
                            call_count: 1,
                            total_duration_ms: step.duration_ms || 0,
                            errors: step.error ? 1 : 0,
                        });
                    }
                });
            }
        });
        const skillCalls = Array.from(skillCallMap.values());
        this.logger.log(`[DecisionDebugCollector] 收集到 ${skillCalls.length} 个不同的 Skill 调用`);
        return skillCalls;
    }
    async calculatePerformanceMetrics(executionTrace) {
        const completedSteps = executionTrace.steps.filter((step) => step.status === 'completed');
        const failedSteps = executionTrace.steps.filter((step) => step.status === 'failed');
        const successRate = executionTrace.steps.length > 0
            ? completedSteps.length / executionTrace.steps.length
            : 0;
        const totalCost = executionTrace.steps.reduce((sum, step) => sum + (step.cost_est_usd || 0), 0);
        const estimatedTotalTokens = Math.round(totalCost / 0.00001);
        const metrics = {
            generation_time_ms: executionTrace.total_duration_ms,
            execution_time_ms: executionTrace.total_duration_ms,
            success_rate: successRate,
            total_cost_usd: totalCost,
            total_tokens: estimatedTotalTokens,
        };
        this.logger.log(`[DecisionDebugCollector] 性能指标: 成功率=${(successRate * 100).toFixed(2)}%, 总成本=$${totalCost.toFixed(4)}`);
        return metrics;
    }
    async updateDebugInfo(existingDebugInfo, newExecutionTrace) {
        if (!newExecutionTrace) {
            return existingDebugInfo || {};
        }
        const newDebugInfo = await this.collectDebugInfo({}, newExecutionTrace);
        return {
            ...existingDebugInfo,
            ...newDebugInfo,
            llm_calls: [
                ...((existingDebugInfo === null || existingDebugInfo === void 0 ? void 0 : existingDebugInfo.llm_calls) || []),
                ...(newDebugInfo.llm_calls || []),
            ],
            skill_calls: this.mergeSkillCalls((existingDebugInfo === null || existingDebugInfo === void 0 ? void 0 : existingDebugInfo.skill_calls) || [], newDebugInfo.skill_calls || []),
            performance_metrics: newDebugInfo.performance_metrics,
        };
    }
    mergeSkillCalls(existing, newCalls) {
        const mergedMap = new Map();
        existing.forEach((call) => {
            mergedMap.set(call.skill_name, { ...call });
        });
        newCalls.forEach((call) => {
            const existing = mergedMap.get(call.skill_name);
            if (existing) {
                existing.call_count += call.call_count;
                existing.total_duration_ms += call.total_duration_ms;
                existing.errors += call.errors;
            }
            else {
                mergedMap.set(call.skill_name, { ...call });
            }
        });
        return Array.from(mergedMap.values());
    }
};
exports.DecisionDebugCollectorService = DecisionDebugCollectorService;
exports.DecisionDebugCollectorService = DecisionDebugCollectorService = DecisionDebugCollectorService_1 = __decorate([
    (0, common_1.Injectable)()
], DecisionDebugCollectorService);
//# sourceMappingURL=decision-debug-collector.service.js.map