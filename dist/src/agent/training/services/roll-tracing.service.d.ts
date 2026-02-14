import { ConfigService } from '@nestjs/config';
export interface SpanContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    traceFlags?: number;
}
export interface SpanAttributes {
    [key: string]: string | number | boolean | undefined;
}
export declare class RollTracingService {
    private readonly configService;
    private readonly logger;
    private readonly enabled;
    private readonly serviceName;
    private readonly serviceVersion;
    private activeSpans;
    constructor(configService: ConfigService);
    generateTraceId(): string;
    generateSpanId(): string;
    startSpan(name: string, parentContext?: SpanContext, attributes?: SpanAttributes): SpanContext;
    endSpan(spanId: string, status?: 'ok' | 'error', error?: {
        message: string;
        code?: string;
    }, attributes?: SpanAttributes): void;
    getCurrentContext(spanId: string): SpanContext | null;
    createChildSpan(name: string, parentSpanId: string, attributes?: SpanAttributes): SpanContext;
    toW3CTraceContext(context: SpanContext): string;
    fromW3CTraceContext(traceparent: string): SpanContext | null;
    private logSpanEvent;
    injectTraceContext(headers: Record<string, string>, context: SpanContext): void;
    extractTraceContext(headers: Record<string, string>): SpanContext | null;
}
