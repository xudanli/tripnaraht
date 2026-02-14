export type SpanType = 'agent_request' | 'core_action' | 'sub_agent' | 'llm_call' | 'tool_call' | 'db_query' | 'external_api';
export type SpanStatus = 'started' | 'success' | 'error' | 'timeout' | 'cancelled';
export interface PerformanceMetrics {
    durationMs: number;
    llmTokens?: {
        prompt: number;
        completion: number;
        total: number;
    };
    toolCalls?: number;
    dbQueries?: number;
    cacheHits?: number;
    cacheMisses?: number;
}
export interface BudgetTracking {
    allocated: {
        durationMs: number;
        llmTokens: number;
        toolCalls: number;
    };
    used: {
        durationMs: number;
        llmTokens: number;
        toolCalls: number;
    };
    exceeded: boolean;
}
export interface Span {
    spanId: string;
    traceId: string;
    parentSpanId?: string;
    type: SpanType;
    name: string;
    status: SpanStatus;
    startTime: string;
    endTime?: string;
    metrics?: PerformanceMetrics;
    budget?: BudgetTracking;
    stateVersionBefore?: number;
    stateVersionAfter?: number;
    error?: {
        code: string;
        message: string;
        stack?: string;
    };
    tags: Record<string, string>;
    children: Span[];
}
export interface TraceSummary {
    traceId: string;
    rootSpan: Span;
    totalDurationMs: number;
    totalLlmTokens: number;
    totalToolCalls: number;
    totalDbQueries: number;
    overallStatus: SpanStatus;
    errorCount: number;
    slaBreached: boolean;
    slaTarget?: number;
}
export interface SLAConfig {
    planning: {
        maxDurationMs: number;
        maxLlmTokens: number;
    };
    execution: {
        maxDurationMs: number;
        maxLlmTokens: number;
    };
    diagnostic: {
        maxDurationMs: number;
        maxLlmTokens: number;
    };
}
export declare class TelemetryService {
    private readonly logger;
    private activeTraces;
    private spanIndex;
    private completedTraces;
    private slaConfig;
    private stats;
    constructor();
    startTrace(name: string, type?: SpanType, tags?: Record<string, string>): string;
    endTrace(traceId: string, status?: SpanStatus, error?: {
        code: string;
        message: string;
        stack?: string;
    }): TraceSummary | null;
    startSpan(traceId: string, name: string, type: SpanType, parentSpanId?: string, tags?: Record<string, string>): string;
    endSpan(spanId: string, status?: SpanStatus, metrics?: Partial<PerformanceMetrics>, error?: {
        code: string;
        message: string;
        stack?: string;
    }): void;
    recordLlmCall(traceId: string, parentSpanId: string, provider: string, promptTokens: number, completionTokens: number, durationMs: number, success: boolean, error?: string): void;
    recordToolCall(traceId: string, parentSpanId: string, toolName: string, durationMs: number, success: boolean, error?: string): void;
    recordStateVersion(spanId: string, position: 'before' | 'after', version: number): void;
    setBudget(spanId: string, allocated: {
        durationMs: number;
        llmTokens: number;
        toolCalls: number;
    }): void;
    updateBudgetUsage(spanId: string, used: Partial<{
        durationMs: number;
        llmTokens: number;
        toolCalls: number;
    }>): void;
    getStats(): {
        activeTraces: number;
        successRate: string;
        avgDurationMs: number;
        slaBreachRate: string;
        totalTraces: number;
        successfulTraces: number;
        failedTraces: number;
        slaBreaches: number;
        totalDurationMs: number;
        totalLlmTokens: number;
    };
    getRecentTraces(limit?: number): TraceSummary[];
    getTraceDetail(traceId: string): Span | null;
    private generateId;
    private calculateTraceSummary;
    private aggregateMetrics;
    private getSLATarget;
    private cleanupSpanIndex;
}
