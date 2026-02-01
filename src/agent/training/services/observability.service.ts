// src/agent/training/services/observability.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * ObservabilityService
 * 
 * 职责：实现统一tracing / metrics / logs（含实验号、模型版本）
 * 
 * 功能：
 * 1. Tracing - trace_id生成和传递
 * 2. Metrics - 关键指标收集
 * 3. Logs - 结构化日志
 */
@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  private readonly traces: Map<string, TraceSpan[]> = new Map();
  private readonly metrics: Map<string, MetricPoint[]> = new Map();

  /**
   * 生成trace_id
   */
  generateTraceId(): string {
    return `trace_${randomUUID()}`;
  }

  /**
   * 创建span
   */
  createSpan(
    traceId: string,
    spanName: string,
    parentSpanId?: string,
  ): SpanContext {
    const spanId = `span_${randomUUID()}`;
    const span: TraceSpan = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: parentSpanId,
      name: spanName,
      start_time: Date.now(),
      end_time: undefined,
      tags: {},
      logs: [],
    };

    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, []);
    }
    this.traces.get(traceId)!.push(span);

    return {
      trace_id: traceId,
      span_id: spanId,
    };
  }

  /**
   * 结束span
   */
  endSpan(traceId: string, spanId: string): void {
    const spans = this.traces.get(traceId);
    if (spans) {
      const span = spans.find((s) => s.span_id === spanId);
      if (span) {
        span.end_time = Date.now();
      }
    }
  }

  /**
   * 添加span标签
   */
  addSpanTag(
    traceId: string,
    spanId: string,
    key: string,
    value: string | number | boolean,
  ): void {
    const spans = this.traces.get(traceId);
    if (spans) {
      const span = spans.find((s) => s.span_id === spanId);
      if (span) {
        span.tags[key] = value;
      }
    }
  }

  /**
   * 记录指标
   */
  recordMetric(
    name: string,
    value: number,
    tags: Record<string, string> = {},
  ): void {
    const metricPoint: MetricPoint = {
      name,
      value,
      tags,
      timestamp: Date.now(),
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(metricPoint);
  }

  /**
   * 记录结构化日志
   */
  logStructured(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context: {
      trace_id?: string;
      span_id?: string;
      experiment_id?: string;
      model_version?: string;
      [key: string]: any;
    } = {},
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    // 输出结构化日志（JSON格式）
    const logMessage = JSON.stringify(logEntry);
    if (level === 'info') {
      this.logger.log(logMessage);
    } else if (level === 'warn') {
      this.logger.warn(logMessage);
    } else if (level === 'error') {
      this.logger.error(logMessage);
    } else if (level === 'debug') {
      this.logger.debug(logMessage);
    }
  }

  /**
   * 获取trace
   */
  getTrace(traceId: string): TraceSpan[] | undefined {
    return this.traces.get(traceId);
  }

  /**
   * 获取指标
   */
  getMetrics(name: string, startTime?: number, endTime?: number): MetricPoint[] {
    const points = this.metrics.get(name) || [];
    if (startTime && endTime) {
      return points.filter(
        (p) => p.timestamp >= startTime && p.timestamp <= endTime,
      );
    }
    return points;
  }
}

/**
 * Trace Span
 */
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

/**
 * Span Context
 */
export interface SpanContext {
  trace_id: string;
  span_id: string;
}

/**
 * Metric Point
 */
export interface MetricPoint {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}
