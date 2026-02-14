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
var TelemetryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryService = void 0;
const common_1 = require("@nestjs/common");
const DEFAULT_SLA = {
    planning: { maxDurationMs: 8000, maxLlmTokens: 4000 },
    execution: { maxDurationMs: 5000, maxLlmTokens: 2000 },
    diagnostic: { maxDurationMs: 2000, maxLlmTokens: 0 },
};
let TelemetryService = TelemetryService_1 = class TelemetryService {
    constructor() {
        this.logger = new common_1.Logger(TelemetryService_1.name);
        this.activeTraces = new Map();
        this.spanIndex = new Map();
        this.completedTraces = [];
        this.slaConfig = DEFAULT_SLA;
        this.stats = {
            totalTraces: 0,
            successfulTraces: 0,
            failedTraces: 0,
            slaBreaches: 0,
            totalDurationMs: 0,
            totalLlmTokens: 0,
        };
        this.logger.log('📊 TelemetryService 已初始化');
    }
    startTrace(name, type = 'agent_request', tags = {}) {
        const traceId = this.generateId('trace');
        const spanId = this.generateId('span');
        const rootSpan = {
            spanId,
            traceId,
            type,
            name,
            status: 'started',
            startTime: new Date().toISOString(),
            tags: {
                ...tags,
                'trace.root': 'true',
            },
            children: [],
        };
        this.activeTraces.set(traceId, rootSpan);
        this.spanIndex.set(spanId, rootSpan);
        this.stats.totalTraces++;
        this.logger.debug(`[Telemetry] 开始 Trace: ${traceId} - ${name}`);
        return traceId;
    }
    endTrace(traceId, status = 'success', error) {
        const rootSpan = this.activeTraces.get(traceId);
        if (!rootSpan) {
            this.logger.warn(`[Telemetry] Trace 不存在: ${traceId}`);
            return null;
        }
        rootSpan.status = status;
        rootSpan.endTime = new Date().toISOString();
        rootSpan.error = error;
        const summary = this.calculateTraceSummary(rootSpan);
        if (status === 'success') {
            this.stats.successfulTraces++;
        }
        else {
            this.stats.failedTraces++;
        }
        this.stats.totalDurationMs += summary.totalDurationMs;
        this.stats.totalLlmTokens += summary.totalLlmTokens;
        if (summary.slaBreached) {
            this.stats.slaBreaches++;
        }
        this.completedTraces.push(summary);
        if (this.completedTraces.length > 1000) {
            this.completedTraces.shift();
        }
        this.activeTraces.delete(traceId);
        this.cleanupSpanIndex(rootSpan);
        this.logger.debug(`[Telemetry] 结束 Trace: ${traceId} - ${status} - ${summary.totalDurationMs}ms`);
        return summary;
    }
    startSpan(traceId, name, type, parentSpanId, tags = {}) {
        const rootSpan = this.activeTraces.get(traceId);
        if (!rootSpan) {
            this.logger.warn(`[Telemetry] Trace 不存在: ${traceId}`);
            return '';
        }
        const spanId = this.generateId('span');
        const span = {
            spanId,
            traceId,
            parentSpanId: parentSpanId || rootSpan.spanId,
            type,
            name,
            status: 'started',
            startTime: new Date().toISOString(),
            tags,
            children: [],
        };
        const parentSpan = parentSpanId ? this.spanIndex.get(parentSpanId) : rootSpan;
        if (parentSpan) {
            parentSpan.children.push(span);
        }
        this.spanIndex.set(spanId, span);
        return spanId;
    }
    endSpan(spanId, status = 'success', metrics, error) {
        const span = this.spanIndex.get(spanId);
        if (!span) {
            return;
        }
        span.status = status;
        span.endTime = new Date().toISOString();
        span.error = error;
        const startTime = new Date(span.startTime).getTime();
        const endTime = new Date(span.endTime).getTime();
        const durationMs = endTime - startTime;
        span.metrics = {
            durationMs,
            ...metrics,
        };
    }
    recordLlmCall(traceId, parentSpanId, provider, promptTokens, completionTokens, durationMs, success, error) {
        const spanId = this.startSpan(traceId, `llm:${provider}`, 'llm_call', parentSpanId, {
            'llm.provider': provider,
        });
        this.endSpan(spanId, success ? 'success' : 'error', {
            durationMs,
            llmTokens: {
                prompt: promptTokens,
                completion: completionTokens,
                total: promptTokens + completionTokens,
            },
        }, error ? { code: 'LLM_ERROR', message: error } : undefined);
    }
    recordToolCall(traceId, parentSpanId, toolName, durationMs, success, error) {
        const spanId = this.startSpan(traceId, `tool:${toolName}`, 'tool_call', parentSpanId, {
            'tool.name': toolName,
        });
        this.endSpan(spanId, success ? 'success' : 'error', {
            durationMs,
            toolCalls: 1,
        }, error ? { code: 'TOOL_ERROR', message: error } : undefined);
    }
    recordStateVersion(spanId, position, version) {
        const span = this.spanIndex.get(spanId);
        if (span) {
            if (position === 'before') {
                span.stateVersionBefore = version;
            }
            else {
                span.stateVersionAfter = version;
            }
        }
    }
    setBudget(spanId, allocated) {
        const span = this.spanIndex.get(spanId);
        if (span) {
            span.budget = {
                allocated,
                used: { durationMs: 0, llmTokens: 0, toolCalls: 0 },
                exceeded: false,
            };
        }
    }
    updateBudgetUsage(spanId, used) {
        const span = this.spanIndex.get(spanId);
        if (span === null || span === void 0 ? void 0 : span.budget) {
            if (used.durationMs !== undefined)
                span.budget.used.durationMs += used.durationMs;
            if (used.llmTokens !== undefined)
                span.budget.used.llmTokens += used.llmTokens;
            if (used.toolCalls !== undefined)
                span.budget.used.toolCalls += used.toolCalls;
            span.budget.exceeded =
                span.budget.used.durationMs > span.budget.allocated.durationMs ||
                    span.budget.used.llmTokens > span.budget.allocated.llmTokens ||
                    span.budget.used.toolCalls > span.budget.allocated.toolCalls;
        }
    }
    getStats() {
        return {
            ...this.stats,
            activeTraces: this.activeTraces.size,
            successRate: this.stats.totalTraces > 0
                ? ((this.stats.successfulTraces / this.stats.totalTraces) * 100).toFixed(2) + '%'
                : 'N/A',
            avgDurationMs: this.stats.successfulTraces > 0
                ? Math.round(this.stats.totalDurationMs / this.stats.successfulTraces)
                : 0,
            slaBreachRate: this.stats.totalTraces > 0
                ? ((this.stats.slaBreaches / this.stats.totalTraces) * 100).toFixed(2) + '%'
                : 'N/A',
        };
    }
    getRecentTraces(limit = 10) {
        return this.completedTraces.slice(-limit);
    }
    getTraceDetail(traceId) {
        return this.activeTraces.get(traceId) || null;
    }
    generateId(prefix) {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    calculateTraceSummary(rootSpan) {
        const { totalDuration, totalTokens, totalTools, totalDb, errorCount } = this.aggregateMetrics(rootSpan);
        const startTime = new Date(rootSpan.startTime).getTime();
        const endTime = rootSpan.endTime ? new Date(rootSpan.endTime).getTime() : Date.now();
        const totalDurationMs = endTime - startTime;
        const slaTarget = this.getSLATarget(rootSpan.type);
        const slaBreached = totalDurationMs > slaTarget;
        return {
            traceId: rootSpan.traceId,
            rootSpan,
            totalDurationMs,
            totalLlmTokens: totalTokens,
            totalToolCalls: totalTools,
            totalDbQueries: totalDb,
            overallStatus: rootSpan.status,
            errorCount,
            slaBreached,
            slaTarget,
        };
    }
    aggregateMetrics(span) {
        var _a, _b, _c, _d, _e;
        let totalDuration = ((_a = span.metrics) === null || _a === void 0 ? void 0 : _a.durationMs) || 0;
        let totalTokens = ((_c = (_b = span.metrics) === null || _b === void 0 ? void 0 : _b.llmTokens) === null || _c === void 0 ? void 0 : _c.total) || 0;
        let totalTools = ((_d = span.metrics) === null || _d === void 0 ? void 0 : _d.toolCalls) || 0;
        let totalDb = ((_e = span.metrics) === null || _e === void 0 ? void 0 : _e.dbQueries) || 0;
        let errorCount = span.status === 'error' ? 1 : 0;
        for (const child of span.children) {
            const childMetrics = this.aggregateMetrics(child);
            totalTokens += childMetrics.totalTokens;
            totalTools += childMetrics.totalTools;
            totalDb += childMetrics.totalDb;
            errorCount += childMetrics.errorCount;
        }
        return { totalDuration, totalTokens, totalTools, totalDb, errorCount };
    }
    getSLATarget(type) {
        switch (type) {
            case 'core_action':
                return this.slaConfig.planning.maxDurationMs;
            case 'agent_request':
                return this.slaConfig.execution.maxDurationMs;
            default:
                return this.slaConfig.diagnostic.maxDurationMs;
        }
    }
    cleanupSpanIndex(span) {
        this.spanIndex.delete(span.spanId);
        for (const child of span.children) {
            this.cleanupSpanIndex(child);
        }
    }
};
exports.TelemetryService = TelemetryService;
exports.TelemetryService = TelemetryService = TelemetryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], TelemetryService);
//# sourceMappingURL=telemetry.service.js.map