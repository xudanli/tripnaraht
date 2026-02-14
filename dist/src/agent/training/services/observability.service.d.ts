export declare class ObservabilityService {
    private readonly logger;
    private readonly traces;
    private readonly metrics;
    generateTraceId(): string;
    createSpan(traceId: string, spanName: string, parentSpanId?: string): SpanContext;
    endSpan(traceId: string, spanId: string): void;
    addSpanTag(traceId: string, spanId: string, key: string, value: string | number | boolean): void;
    recordMetric(name: string, value: number, tags?: Record<string, string>): void;
    logStructured(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: {
        trace_id?: string;
        span_id?: string;
        experiment_id?: string;
        model_version?: string;
        [key: string]: any;
    }): void;
    getTrace(traceId: string): TraceSpan[] | undefined;
    getMetrics(name: string, startTime?: number, endTime?: number): MetricPoint[];
}
export interface TraceSpan {
    trace_id: string;
    span_id: string;
    parent_span_id?: string;
    name: string;
    start_time: number;
    end_time?: number;
    tags: Record<string, string | number | boolean>;
    logs: Array<{
        timestamp: number;
        fields: Record<string, any>;
    }>;
}
export interface SpanContext {
    trace_id: string;
    span_id: string;
}
export interface MetricPoint {
    name: string;
    value: number;
    tags: Record<string, string>;
    timestamp: number;
}
