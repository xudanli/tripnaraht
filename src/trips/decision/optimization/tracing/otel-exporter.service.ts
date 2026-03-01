/**
 * Decision OS OpenTelemetry 追踪导出器
 * 
 * 提供:
 * - OTLP 协议导出
 * - Jaeger/Zipkin 格式支持
 * - 批量导出优化
 * - 采样策略
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

// ========== 类型定义 ==========

export interface OTelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTimeUnixNano: bigint;
  endTimeUnixNano: bigint;
  status: SpanStatus;
  attributes: SpanAttribute[];
  events: SpanEvent[];
  links: SpanLink[];
}

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

export interface SpanAttribute {
  key: string;
  value: AttributeValue;
}

export interface AttributeValue {
  stringValue?: string;
  intValue?: number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: AttributeValue[];
}

export interface SpanEvent {
  name: string;
  timeUnixNano: bigint;
  attributes: SpanAttribute[];
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes: SpanAttribute[];
}

export interface ExporterConfig {
  endpoint: string;
  headers?: Record<string, string>;
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
  timeoutMs: number;
  compression?: 'none' | 'gzip';
}

export interface ExportResult {
  success: boolean;
  spansExported: number;
  error?: string;
}

export interface SamplerConfig {
  type: 'always_on' | 'always_off' | 'ratio' | 'parent_based';
  ratio?: number;
}

// ========== 采样器 ==========

export interface Sampler {
  shouldSample(traceId: string, parentSampled?: boolean): boolean;
}

export class AlwaysOnSampler implements Sampler {
  shouldSample(): boolean {
    return true;
  }
}

export class AlwaysOffSampler implements Sampler {
  shouldSample(): boolean {
    return false;
  }
}

export class RatioSampler implements Sampler {
  constructor(private readonly ratio: number) {
    if (ratio < 0 || ratio > 1) {
      throw new Error('Ratio must be between 0 and 1');
    }
  }

  shouldSample(traceId: string): boolean {
    const hash = this.hashTraceId(traceId);
    return hash < this.ratio * 0xffffffff;
  }

  private hashTraceId(traceId: string): number {
    let hash = 0;
    for (let i = 0; i < traceId.length; i++) {
      hash = ((hash << 5) - hash) + traceId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export class ParentBasedSampler implements Sampler {
  constructor(private readonly rootSampler: Sampler) {}

  shouldSample(traceId: string, parentSampled?: boolean): boolean {
    if (parentSampled !== undefined) {
      return parentSampled;
    }
    return this.rootSampler.shouldSample(traceId);
  }
}

export function createSampler(config: SamplerConfig): Sampler {
  switch (config.type) {
    case 'always_on':
      return new AlwaysOnSampler();
    case 'always_off':
      return new AlwaysOffSampler();
    case 'ratio':
      return new RatioSampler(config.ratio ?? 0.1);
    case 'parent_based':
      return new ParentBasedSampler(new RatioSampler(config.ratio ?? 1.0));
    default:
      return new AlwaysOnSampler();
  }
}

// ========== OTLP 导出器 ==========

@Injectable()
export class OTLPSpanExporter implements OnModuleDestroy {
  private readonly logger = new Logger(OTLPSpanExporter.name);
  private readonly config: ExporterConfig;
  private readonly queue: OTelSpan[] = [];
  private readonly sampler: Sampler;
  private flushTimer?: ReturnType<typeof setInterval>;
  private isShuttingDown = false;

  constructor(
    config?: Partial<ExporterConfig>,
    samplerConfig?: SamplerConfig,
  ) {
    this.config = {
      endpoint: config?.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
      headers: config?.headers ?? this.parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
      serviceName: config?.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'decision-os',
      serviceVersion: config?.serviceVersion ?? '2.3.0',
      environment: config?.environment ?? process.env.NODE_ENV ?? 'development',
      batchSize: config?.batchSize ?? 512,
      flushIntervalMs: config?.flushIntervalMs ?? 5000,
      maxQueueSize: config?.maxQueueSize ?? 2048,
      timeoutMs: config?.timeoutMs ?? 10000,
      compression: config?.compression ?? 'none',
    };

    this.sampler = createSampler(samplerConfig ?? { type: 'ratio', ratio: 0.1 });

    this.startFlushTimer();
  }

  onModuleDestroy(): void {
    this.shutdown();
  }

  shouldSample(traceId: string, parentSampled?: boolean): boolean {
    return this.sampler.shouldSample(traceId, parentSampled);
  }

  export(span: OTelSpan): void {
    if (this.isShuttingDown) return;

    if (this.queue.length >= this.config.maxQueueSize) {
      this.logger.warn('[OTel] Queue full, dropping span');
      return;
    }

    this.queue.push(span);

    if (this.queue.length >= this.config.batchSize) {
      this.flush().catch(err => this.logger.error(`[OTel] Flush error: ${err.message}`));
    }
  }

  async flush(): Promise<ExportResult> {
    if (this.queue.length === 0) {
      return { success: true, spansExported: 0 };
    }

    const batch = this.queue.splice(0, this.config.batchSize);

    try {
      const payload = this.buildOTLPPayload(batch);
      await this.sendBatch(payload);

      this.logger.debug(`[OTel] Exported ${batch.length} spans`);
      return { success: true, spansExported: batch.length };
    } catch (error) {
      this.queue.unshift(...batch);
      const message = (error as Error).message;
      this.logger.error(`[OTel] Export failed: ${message}`);
      return { success: false, spansExported: 0, error: message };
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    while (this.queue.length > 0) {
      await this.flush();
    }

    this.logger.log('[OTel] Exporter shutdown complete');
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => this.logger.error(`[OTel] Timer flush error: ${err.message}`));
    }, this.config.flushIntervalMs);
  }

  private buildOTLPPayload(spans: OTelSpan[]): object {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: this.config.serviceName } },
              { key: 'service.version', value: { stringValue: this.config.serviceVersion } },
              { key: 'deployment.environment', value: { stringValue: this.config.environment } },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: 'decision-os-tracer',
                version: '1.0.0',
              },
              spans: spans.map(span => ({
                traceId: span.traceId,
                spanId: span.spanId,
                parentSpanId: span.parentSpanId,
                name: span.operationName,
                kind: 1,
                startTimeUnixNano: span.startTimeUnixNano.toString(),
                endTimeUnixNano: span.endTimeUnixNano.toString(),
                attributes: span.attributes,
                events: span.events.map(e => ({
                  name: e.name,
                  timeUnixNano: e.timeUnixNano.toString(),
                  attributes: e.attributes,
                })),
                links: span.links,
                status: span.status,
              })),
            },
          ],
        },
      ],
    };
  }

  private async sendBatch(payload: object): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseHeaders(headerString?: string): Record<string, string> {
    if (!headerString) return {};

    const headers: Record<string, string> = {};
    const pairs = headerString.split(',');

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        headers[key.trim()] = value.trim();
      }
    }

    return headers;
  }
}

// ========== Jaeger 格式转换器 ==========

export interface JaegerSpan {
  traceID: string;
  spanID: string;
  parentSpanID?: string;
  operationName: string;
  references: JaegerReference[];
  flags: number;
  startTime: number;
  duration: number;
  tags: JaegerTag[];
  logs: JaegerLog[];
  processID: string;
}

export interface JaegerReference {
  refType: 'CHILD_OF' | 'FOLLOWS_FROM';
  traceID: string;
  spanID: string;
}

export interface JaegerTag {
  key: string;
  type: string;
  value: string | number | boolean;
}

export interface JaegerLog {
  timestamp: number;
  fields: JaegerTag[];
}

export class JaegerSpanConverter {
  static toJaeger(span: OTelSpan): JaegerSpan {
    return {
      traceID: span.traceId,
      spanID: span.spanId,
      parentSpanID: span.parentSpanId,
      operationName: span.operationName,
      references: span.parentSpanId
        ? [{ refType: 'CHILD_OF', traceID: span.traceId, spanID: span.parentSpanId }]
        : [],
      flags: 1,
      startTime: Number(span.startTimeUnixNano / BigInt(1000)),
      duration: Number((span.endTimeUnixNano - span.startTimeUnixNano) / BigInt(1000)),
      tags: span.attributes.map(attr => this.convertAttribute(attr)),
      logs: span.events.map(event => ({
        timestamp: Number(event.timeUnixNano / BigInt(1000)),
        fields: event.attributes.map(attr => this.convertAttribute(attr)),
      })),
      processID: 'p1',
    };
  }

  private static convertAttribute(attr: SpanAttribute): JaegerTag {
    const value = attr.value;
    if (value.stringValue !== undefined) {
      return { key: attr.key, type: 'string', value: value.stringValue };
    }
    if (value.intValue !== undefined) {
      return { key: attr.key, type: 'int64', value: value.intValue };
    }
    if (value.doubleValue !== undefined) {
      return { key: attr.key, type: 'float64', value: value.doubleValue };
    }
    if (value.boolValue !== undefined) {
      return { key: attr.key, type: 'bool', value: value.boolValue };
    }
    return { key: attr.key, type: 'string', value: String(value) };
  }
}

// ========== Zipkin 格式转换器 ==========

export interface ZipkinSpan {
  traceId: string;
  id: string;
  parentId?: string;
  name: string;
  kind?: 'CLIENT' | 'SERVER' | 'PRODUCER' | 'CONSUMER';
  timestamp: number;
  duration: number;
  localEndpoint: ZipkinEndpoint;
  tags: Record<string, string>;
  annotations: ZipkinAnnotation[];
}

export interface ZipkinEndpoint {
  serviceName: string;
  ipv4?: string;
  port?: number;
}

export interface ZipkinAnnotation {
  timestamp: number;
  value: string;
}

export class ZipkinSpanConverter {
  static toZipkin(span: OTelSpan): ZipkinSpan {
    const tags: Record<string, string> = {};
    for (const attr of span.attributes) {
      tags[attr.key] = this.stringifyValue(attr.value);
    }

    return {
      traceId: span.traceId,
      id: span.spanId,
      parentId: span.parentSpanId,
      name: span.operationName,
      kind: 'SERVER',
      timestamp: Number(span.startTimeUnixNano / BigInt(1000)),
      duration: Number((span.endTimeUnixNano - span.startTimeUnixNano) / BigInt(1000)),
      localEndpoint: {
        serviceName: span.serviceName,
      },
      tags,
      annotations: span.events.map(event => ({
        timestamp: Number(event.timeUnixNano / BigInt(1000)),
        value: event.name,
      })),
    };
  }

  private static stringifyValue(value: AttributeValue): string {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.intValue !== undefined) return String(value.intValue);
    if (value.doubleValue !== undefined) return String(value.doubleValue);
    if (value.boolValue !== undefined) return String(value.boolValue);
    return '';
  }
}
