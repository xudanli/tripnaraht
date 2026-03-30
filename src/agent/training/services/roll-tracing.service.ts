// src/agent/training/services/roll-tracing.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

/**
 * Span 上下文
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags?: number;
}

/**
 * Span 属性
 */
export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

/**
 * RollTracingService
 *
 * 职责：提供分布式追踪功能（基于 OpenTelemetry 标准）
 */
@Injectable()
export class RollTracingService {
  private readonly logger = new Logger(RollTracingService.name);
  private readonly enabled: boolean;
  private readonly serviceName: string;
  private readonly serviceVersion: string;

  // 活跃的 Spans
  private activeSpans: Map<string, SpanContext> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService.get<boolean>('ROLL_TRACING_ENABLED') !== false;
    this.serviceName =
      this.configService.get<string>('ROLL_SERVICE_NAME') || 'roll-client';
    this.serviceVersion =
      this.configService.get<string>('ROLL_SERVICE_VERSION') || '1.0.0';

    if (this.enabled) {
      this.logger.log(
        `[RollTracing] 追踪已启用: ${this.serviceName}@${this.serviceVersion}`,
      );
    }
  }

  /**
   * 生成 Trace ID（W3C Trace Context 格式）
   */
  generateTraceId(): string {
    // W3C Trace Context: 32 字符十六进制
    return randomUUID().replace(/-/g, '').substring(0, 32);
  }

  /**
   * 生成 Span ID（W3C Trace Context 格式）
   */
  generateSpanId(): string {
    // W3C Trace Context: 16 字符十六进制
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }

  /**
   * 开始新的 Span
   */
  startSpan(
    name: string,
    parentContext?: SpanContext,
    attributes?: SpanAttributes,
  ): SpanContext {
    if (!this.enabled) {
      return {
        traceId: '',
        spanId: '',
      };
    }

    const traceId = parentContext?.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();
    const parentSpanId = parentContext?.spanId;

    const context: SpanContext = {
      traceId,
      spanId,
      parentSpanId,
      traceFlags: 1, // Sampled
    };

    this.activeSpans.set(spanId, context);

    this.logger.debug(
      `[RollTracing] 开始 Span: ${name} (traceId=${traceId}, spanId=${spanId})`,
    );

    // 记录 Span 开始事件（可以发送到追踪后端）
    this.logSpanEvent('span.start', {
      name,
      traceId,
      spanId,
      parentSpanId,
      attributes,
    });

    return context;
  }

  /**
   * 结束 Span
   */
  endSpan(
    spanId: string,
    status: 'ok' | 'error' = 'ok',
    error?: { message: string; code?: string },
    attributes?: SpanAttributes,
  ): void {
    if (!this.enabled) {
      return;
    }

    const context = this.activeSpans.get(spanId);
    if (!context) {
      return;
    }

    this.activeSpans.delete(spanId);

    // 记录 Span 结束事件
    this.logSpanEvent('span.end', {
      traceId: context.traceId,
      spanId: context.spanId,
      status,
      error,
      attributes,
    });

    this.logger.debug(
      `[RollTracing] 结束 Span: ${spanId} (status=${status})`,
    );
  }

  /**
   * 获取当前 Span 上下文
   */
  getCurrentContext(spanId: string): SpanContext | null {
    return this.activeSpans.get(spanId) || null;
  }

  /**
   * 创建子 Span
   */
  createChildSpan(
    name: string,
    parentSpanId: string,
    attributes?: SpanAttributes,
  ): SpanContext {
    const parentContext = this.activeSpans.get(parentSpanId);
    if (!parentContext) {
      this.logger.warn(
        `[RollTracing] 父 Span 不存在: ${parentSpanId}，创建新 Trace`,
      );
      return this.startSpan(name, undefined, attributes);
    }

    return this.startSpan(name, parentContext, attributes);
  }

  /**
   * 将 Span 上下文转换为 W3C Trace Context 格式（用于 HTTP 头）
   */
  toW3CTraceContext(context: SpanContext): string {
    // W3C Trace Context: traceparent = version-trace_id-parent_id-trace_flags
    // version: 00 (2 hex chars)
    // trace_id: 32 hex chars
    // parent_id: 16 hex chars
    // trace_flags: 2 hex chars (01 = sampled)
    const version = '00';
    const traceId = context.traceId.padStart(32, '0');
    const parentId = context.parentSpanId?.padStart(16, '0') || '0'.repeat(16);
    const flags = (context.traceFlags || 1).toString(16).padStart(2, '0');

    return `${version}-${traceId}-${parentId}-${flags}`;
  }

  /**
   * 从 W3C Trace Context 解析 Span 上下文
   */
  fromW3CTraceContext(traceparent: string): SpanContext | null {
    try {
      // 格式: version-trace_id-parent_id-trace_flags
      const parts = traceparent.split('-');
      if (parts.length !== 4) {
        return null;
      }

      const [, traceId, parentId, flags] = parts;
      const traceFlags = parseInt(flags, 16);

      return {
        traceId,
        spanId: this.generateSpanId(), // 新的 Span ID
        parentSpanId: parentId === '0'.repeat(16) ? undefined : parentId,
        traceFlags,
      };
    } catch (error) {
      this.logger.warn(`[RollTracing] 解析 W3C Trace Context 失败: ${error}`);
      return null;
    }
  }

  /**
   * 记录 Span 事件（可以发送到追踪后端）
   */
  private logSpanEvent(
    event: string,
    data: Record<string, any>,
  ): void {
    // 这里可以集成 OpenTelemetry SDK 或发送到追踪后端
    // 目前先记录日志
    this.logger.debug(`[RollTracing] ${event}: ${JSON.stringify(data)}`);

    // TODO: 集成 OpenTelemetry SDK
    // const span = tracer.startSpan(data.name, {
    //   traceId: data.traceId,
    //   spanId: data.spanId,
    //   parentSpanId: data.parentSpanId,
    // });
    // span.setAttributes(data.attributes);
    // if (data.status === 'error') {
    //   span.setStatus({ code: SpanStatusCode.ERROR });
    // }
    // span.end();
  }

  /**
   * 注入追踪上下文到 HTTP 请求头
   */
  injectTraceContext(headers: Record<string, string>, context: SpanContext): void {
    if (!this.enabled) {
      return;
    }

    // W3C Trace Context
    headers['traceparent'] = this.toW3CTraceContext(context);

    // 自定义头（用于调试）
    headers['x-trace-id'] = context.traceId;
    headers['x-span-id'] = context.spanId;
    if (context.parentSpanId) {
      headers['x-parent-span-id'] = context.parentSpanId;
    }
  }

  /**
   * 从 HTTP 请求头提取追踪上下文
   */
  extractTraceContext(headers: Record<string, string>): SpanContext | null {
    if (!this.enabled) {
      return null;
    }

    // 优先使用 W3C Trace Context
    const traceparent = headers['traceparent'] || headers['Traceparent'];
    if (traceparent) {
      return this.fromW3CTraceContext(traceparent);
    }

    // 回退到自定义头
    const traceId = headers['x-trace-id'] || headers['X-Trace-Id'];
    const spanId = headers['x-span-id'] || headers['X-Span-Id'];
    const parentSpanId =
      headers['x-parent-span-id'] || headers['X-Parent-Span-Id'];

    if (traceId && spanId) {
      return {
        traceId,
        spanId: this.generateSpanId(), // 新的 Span ID
        parentSpanId,
        traceFlags: 1,
      };
    }

    return null;
  }
}
