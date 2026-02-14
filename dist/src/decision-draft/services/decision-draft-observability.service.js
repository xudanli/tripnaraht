"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DecisionDraftObservabilityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionDraftObservabilityService = void 0;
const common_1 = require("@nestjs/common");
let DecisionDraftObservabilityService = DecisionDraftObservabilityService_1 = class DecisionDraftObservabilityService {
    constructor() {
        this.logger = new common_1.Logger(DecisionDraftObservabilityService_1.name);
        this.traces = new Map();
        this.activeTraces = new Map();
    }
    startTrace(draftId, planId, requestId) {
        const traceId = `trace-${draftId}-${Date.now()}`;
        const trace = {
            trace_id: traceId,
            draft_id: draftId,
            plan_id: planId,
            request_id: requestId,
            start_time: new Date().toISOString(),
            stages: [],
            llm_calls: [],
            skill_calls: [],
        };
        this.traces.set(traceId, trace);
        this.activeTraces.set(requestId, traceId);
        this.logger.debug(`[Observability] 开始 Trace: trace_id=${traceId}, draft_id=${draftId}`);
        return traceId;
    }
    endTrace(traceId, success = true) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
            return null;
        }
        trace.end_time = new Date().toISOString();
        trace.duration_ms = new Date(trace.end_time).getTime() - new Date(trace.start_time).getTime();
        this.activeTraces.delete(trace.request_id);
        this.logger.debug(`[Observability] 结束 Trace: trace_id=${traceId}, duration=${trace.duration_ms}ms, success=${success}`);
        return trace;
    }
    startStage(traceId, stageName) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
            return;
        }
        const stage = {
            stage_name: stageName,
            start_time: new Date().toISOString(),
        };
        trace.stages.push(stage);
        this.logger.debug(`[Observability] 开始阶段: trace_id=${traceId}, stage=${stageName}`);
    }
    endStage(traceId, stageName, metadata) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
            return;
        }
        const stage = trace.stages.find(s => s.stage_name === stageName && !s.end_time);
        if (!stage) {
            this.logger.warn(`[Observability] 阶段不存在或已结束: trace_id=${traceId}, stage=${stageName}`);
            return;
        }
        stage.end_time = new Date().toISOString();
        stage.duration_ms = new Date(stage.end_time).getTime() - new Date(stage.start_time).getTime();
        if (metadata) {
            stage.decision_steps_generated = metadata.decision_steps_generated;
            stage.step_drafts_generated = metadata.step_drafts_generated;
            stage.llm_call_ids = metadata.llm_call_ids;
            stage.skill_call_ids = metadata.skill_call_ids;
        }
        this.logger.debug(`[Observability] 结束阶段: trace_id=${traceId}, stage=${stageName}, duration=${stage.duration_ms}ms`);
    }
    recordLLMCall(traceId, call) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
            return '';
        }
        const callId = `llm-${traceId}-${Date.now()}`;
        const llmCall = {
            call_id: callId,
            model: call.model,
            prompt_tokens: call.prompt_tokens,
            completion_tokens: call.completion_tokens,
            cost_usd: call.cost_usd,
            duration_ms: call.duration_ms,
            timestamp: new Date().toISOString(),
            prompt: call.prompt,
            response: call.response,
        };
        trace.llm_calls.push(llmCall);
        this.logger.debug(`[Observability] 记录 LLM 调用: trace_id=${traceId}, call_id=${callId}, model=${call.model}, cost=$${call.cost_usd.toFixed(4)}`);
        return callId;
    }
    recordSkillCall(traceId, skillName, durationMs, success, parameters, response) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
            return '';
        }
        let skillCall = trace.skill_calls.find(sc => sc.skill_name === skillName);
        if (!skillCall) {
            const callId = `skill-${traceId}-${skillName}-${Date.now()}`;
            skillCall = {
                skill_name: skillName,
                call_count: 0,
                total_duration_ms: 0,
                errors: 0,
                parameters,
                response,
            };
            trace.skill_calls.push(skillCall);
        }
        skillCall.call_count++;
        skillCall.total_duration_ms += durationMs;
        if (!success) {
            skillCall.errors++;
        }
        this.logger.debug(`[Observability] 记录 Skill 调用: trace_id=${traceId}, skill=${skillName}, duration=${durationMs}ms, success=${success}`);
        return skillCall.skill_name;
    }
    recordError(traceId, stage, error) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
            return;
        }
        if (!trace.errors) {
            trace.errors = [];
        }
        trace.errors.push({
            stage,
            error,
            timestamp: new Date().toISOString(),
        });
        this.logger.warn(`[Observability] 记录错误: trace_id=${traceId}, stage=${stage}, error=${error}`);
    }
    getTrace(traceId) {
        return this.traces.get(traceId) || null;
    }
    getActiveTraceId(requestId) {
        return this.activeTraces.get(requestId) || null;
    }
    calculateMetrics(trace, decisionDraft) {
        const performance = {
            generation_time_ms: trace.duration_ms || 0,
            execution_time_ms: 0,
            success_rate: trace.errors && trace.errors.length > 0 ? 0 : 1,
            total_cost_usd: trace.llm_calls.reduce((sum, call) => sum + call.cost_usd, 0),
            total_tokens: trace.llm_calls.reduce((sum, call) => sum + call.prompt_tokens + call.completion_tokens, 0),
        };
        const avgStepGenerationTime = trace.stages.length > 0
            ? trace.stages.reduce((sum, stage) => sum + (stage.duration_ms || 0), 0) / trace.stages.length
            : 0;
        const decisionSteps = decisionDraft.decision_steps;
        const avgConfidence = decisionSteps.length > 0
            ? decisionSteps.reduce((sum, step) => sum + step.confidence, 0) / decisionSteps.length
            : 0;
        const evidenceCoverage = decisionSteps.length > 0
            ? decisionSteps.filter(step => step.evidence.length > 0).length / decisionSteps.length
            : 0;
        const guardianReviewCoverage = decisionSteps.length > 0
            ? decisionSteps.filter(step => step.guardian_review).length / decisionSteps.length
            : 0;
        const fallbackRate = trace.errors && trace.errors.length > 0 ? trace.errors.length / trace.stages.length : 0;
        const errorRate = trace.errors ? trace.errors.length / (trace.stages.length || 1) : 0;
        return {
            performance: {
                total_generation_time_ms: performance.generation_time_ms,
                avg_step_generation_time_ms: avgStepGenerationTime,
                llm_calls_count: trace.llm_calls.length,
                skill_calls_count: trace.skill_calls.length,
                total_cost_usd: performance.total_cost_usd,
                total_tokens: performance.total_tokens,
            },
            quality: {
                decision_steps_count: decisionSteps.length,
                avg_confidence: avgConfidence,
                evidence_coverage: evidenceCoverage,
                guardian_review_coverage: guardianReviewCoverage,
            },
            success: {
                success_rate: performance.success_rate,
                fallback_rate: fallbackRate,
                error_rate: errorRate,
            },
        };
    }
    buildDebugInfo(trace, metrics) {
        return {
            llm_calls: trace.llm_calls,
            skill_calls: trace.skill_calls,
            performance_metrics: {
                generation_time_ms: metrics.performance.total_generation_time_ms,
                execution_time_ms: metrics.performance.total_generation_time_ms,
                success_rate: metrics.success.success_rate,
                total_cost_usd: metrics.performance.total_cost_usd,
                total_tokens: metrics.performance.total_tokens,
            },
            execution_trace: trace,
        };
    }
};
exports.DecisionDraftObservabilityService = DecisionDraftObservabilityService;
exports.DecisionDraftObservabilityService = DecisionDraftObservabilityService = DecisionDraftObservabilityService_1 = __decorate([
    (0, common_1.Injectable)()
], DecisionDraftObservabilityService);
//# sourceMappingURL=decision-draft-observability.service.js.map