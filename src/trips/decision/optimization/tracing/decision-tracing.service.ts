/**
 * Decision OS 分布式追踪服务
 * 
 * 基于 OpenTelemetry 标准的追踪实现
 * 支持：
 * - Span 创建和管理
 * - 上下文传播
 * - 属性和事件记录
 * - 错误追踪
 */

import { Injectable, Logger } from '@nestjs/common';

// ========== 类型定义 ==========

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

export interface SpanAttributes {
  [key: string]: string | number | boolean | string[] | number[] | boolean[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: SpanAttributes;
}

export interface Span {
  name: string;
  context: SpanContext;
  parentSpanId?: string;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  attributes: SpanAttributes;
  events: SpanEvent[];
  kind: SpanKind;
}

export enum SpanStatus {
  UNSET = 'UNSET',
  OK = 'OK',
  ERROR = 'ERROR',
}

export enum SpanKind {
  INTERNAL = 'INTERNAL',
  SERVER = 'SERVER',
  CLIENT = 'CLIENT',
  PRODUCER = 'PRODUCER',
  CONSUMER = 'CONSUMER',
}

export interface TracerConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  enabled?: boolean;
  samplingRate?: number;
  exporterEndpoint?: string;
}

export interface ActiveSpan {
  span: Span;
  end: (status?: SpanStatus) => void;
  setStatus: (status: SpanStatus, message?: string) => void;
  setAttribute: (key: string, value: string | number | boolean) => void;
  setAttributes: (attributes: SpanAttributes) => void;
  addEvent: (name: string, attributes?: SpanAttributes) => void;
  recordException: (error: Error) => void;
}

// ========== ID 生成 ==========

function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ========== 追踪服务 ==========

@Injectable()
export class DecisionTracingService {
  private readonly logger = new Logger(DecisionTracingService.name);
  private readonly spans: Map<string, Span> = new Map();
  private readonly activeContext: Map<string, string> = new Map();
  private readonly config: TracerConfig;
  private readonly exportBuffer: Span[] = [];

  constructor(config?: Partial<TracerConfig>) {
    this.config = {
      serviceName: config?.serviceName ?? 'decision-os',
      serviceVersion: config?.serviceVersion ?? '2.0.0',
      environment: config?.environment ?? process.env.NODE_ENV ?? 'development',
      enabled: config?.enabled ?? true,
      samplingRate: config?.samplingRate ?? 1.0,
      exporterEndpoint: config?.exporterEndpoint,
    };

    this.logger.log(`[Tracing] 初始化追踪服务: ${this.config.serviceName}`);
  }

  startSpan(name: string, options?: {
    kind?: SpanKind;
    attributes?: SpanAttributes;
    parentSpanId?: string;
    traceId?: string;
  }): ActiveSpan {
    if (!this.config.enabled || Math.random() > (this.config.samplingRate ?? 1)) {
      return this.createNoopSpan(name);
    }

    const traceId = options?.traceId ?? this.getCurrentTraceId() ?? generateTraceId();
    const spanId = generateSpanId();

    const span: Span = {
      name,
      context: {
        traceId,
        spanId,
        traceFlags: 1,
      },
      parentSpanId: options?.parentSpanId ?? this.getCurrentSpanId(),
      startTime: Date.now(),
      status: SpanStatus.UNSET,
      attributes: {
        'service.name': this.config.serviceName,
        'service.version': this.config.serviceVersion ?? '',
        'deployment.environment': this.config.environment ?? '',
        ...options?.attributes,
      },
      events: [],
      kind: options?.kind ?? SpanKind.INTERNAL,
    };

    this.spans.set(spanId, span);
    this.setCurrentSpan(spanId);

    return this.createActiveSpan(span);
  }

  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  getCurrentSpan(): Span | undefined {
    const spanId = this.getCurrentSpanId();
    return spanId ? this.spans.get(spanId) : undefined;
  }

  getCurrentTraceId(): string | undefined {
    const span = this.getCurrentSpan();
    return span?.context.traceId;
  }

  getCurrentSpanId(): string | undefined {
    return this.activeContext.get('currentSpanId');
  }

  injectContext(): Record<string, string> {
    const span = this.getCurrentSpan();
    if (!span) return {};

    return {
      'traceparent': `00-${span.context.traceId}-${span.context.spanId}-01`,
      'tracestate': span.context.traceState ?? '',
    };
  }

  extractContext(headers: Record<string, string | undefined>): { traceId?: string; parentSpanId?: string } {
    const traceparent = headers['traceparent'];
    if (!traceparent) return {};

    const parts = traceparent.split('-');
    if (parts.length !== 4) return {};

    return {
      traceId: parts[1],
      parentSpanId: parts[2],
    };
  }

  async withSpan<T>(name: string, fn: (span: ActiveSpan) => Promise<T>, options?: {
    kind?: SpanKind;
    attributes?: SpanAttributes;
  }): Promise<T> {
    const activeSpan = this.startSpan(name, options);

    try {
      const result = await fn(activeSpan);
      activeSpan.setStatus(SpanStatus.OK);
      return result;
    } catch (error) {
      activeSpan.recordException(error as Error);
      activeSpan.setStatus(SpanStatus.ERROR, (error as Error).message);
      throw error;
    } finally {
      activeSpan.end();
    }
  }

  getExportedSpans(): Span[] {
    return [...this.exportBuffer];
  }

  clearExportedSpans(): void {
    this.exportBuffer.length = 0;
  }

  getStats(): {
    totalSpans: number;
    exportedSpans: number;
    activeSpans: number;
  } {
    return {
      totalSpans: this.spans.size,
      exportedSpans: this.exportBuffer.length,
      activeSpans: Array.from(this.spans.values()).filter(s => !s.endTime).length,
    };
  }

  private createActiveSpan(span: Span): ActiveSpan {
    return {
      span,
      end: (status?: SpanStatus) => {
        span.endTime = Date.now();
        if (status) span.status = status;
        this.exportSpan(span);
        this.clearCurrentSpan(span.context.spanId);
      },
      setStatus: (status: SpanStatus, message?: string) => {
        span.status = status;
        if (message) {
          span.attributes['status.message'] = message;
        }
      },
      setAttribute: (key: string, value: string | number | boolean) => {
        span.attributes[key] = value;
      },
      setAttributes: (attributes: SpanAttributes) => {
        Object.assign(span.attributes, attributes);
      },
      addEvent: (name: string, attributes?: SpanAttributes) => {
        span.events.push({
          name,
          timestamp: Date.now(),
          attributes,
        });
      },
      recordException: (error: Error) => {
        span.events.push({
          name: 'exception',
          timestamp: Date.now(),
          attributes: {
            'exception.type': error.name,
            'exception.message': error.message,
            'exception.stacktrace': error.stack ?? '',
          },
        });
        span.status = SpanStatus.ERROR;
      },
    };
  }

  private createNoopSpan(name: string): ActiveSpan {
    const noopSpan: Span = {
      name,
      context: { traceId: '', spanId: '', traceFlags: 0 },
      startTime: 0,
      status: SpanStatus.UNSET,
      attributes: {},
      events: [],
      kind: SpanKind.INTERNAL,
    };

    return {
      span: noopSpan,
      end: () => {},
      setStatus: () => {},
      setAttribute: () => {},
      setAttributes: () => {},
      addEvent: () => {},
      recordException: () => {},
    };
  }

  private setCurrentSpan(spanId: string): void {
    this.activeContext.set('currentSpanId', spanId);
  }

  private clearCurrentSpan(spanId: string): void {
    if (this.getCurrentSpanId() === spanId) {
      const span = this.spans.get(spanId);
      if (span?.parentSpanId) {
        this.activeContext.set('currentSpanId', span.parentSpanId);
      } else {
        this.activeContext.delete('currentSpanId');
      }
    }
  }

  private exportSpan(span: Span): void {
    this.exportBuffer.push({ ...span });

    if (this.exportBuffer.length > 1000) {
      this.exportBuffer.shift();
    }

    this.logger.debug(
      `[Trace] ${span.name} (${span.context.spanId}) - ${span.endTime! - span.startTime}ms - ${span.status}`,
    );
  }
}

// ========== Decision OS 追踪属性 ==========

export const DecisionTraceAttributes = {
  REQUEST_ID: 'decision.request_id',
  USER_ID: 'decision.user_id',
  DSO_VERSION: 'decision.dso.version',
  DECISION_PHASE: 'decision.phase',
  ACTION: 'decision.action',
  UTILITY: 'decision.utility',
  CONFIDENCE: 'decision.confidence',
  LATENCY_MS: 'decision.latency_ms',
  CONSTRAINT_VIOLATIONS: 'decision.constraint_violations',
  LEARNING_TRIGGERED: 'decision.learning_triggered',
  LYAPUNOV_VALUE: 'decision.lyapunov_value',
  CIRCUIT_STATE: 'decision.circuit_state',
  CACHE_HIT: 'decision.cache_hit',
};

// ========== 追踪装饰器 ==========

const traceMetadataKey = Symbol('trace');

export interface TraceDecoratorOptions {
  name?: string;
  kind?: SpanKind;
  attributes?: SpanAttributes;
}

export function Trace(options: TraceDecoratorOptions = {}): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const spanName = options.name ?? `${target.constructor.name}.${String(propertyKey)}`;

    descriptor.value = async function (...args: unknown[]) {
      const tracingService = (this as any).tracingService as DecisionTracingService | undefined;

      if (!tracingService) {
        return originalMethod.apply(this, args);
      }

      return tracingService.withSpan(spanName, async (span) => {
        if (options.attributes) {
          span.setAttributes(options.attributes);
        }
        return originalMethod.apply(this, args);
      }, { kind: options.kind });
    };

    Reflect.defineMetadata(traceMetadataKey, options, target, propertyKey);

    return descriptor;
  };
}
