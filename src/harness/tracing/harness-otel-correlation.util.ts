import type { HarnessRuntimeState } from '../../decision/kernel/decision-state.types';
import type { HarnessTraceCorrelationMeta } from './harness-trace.types';

/** W3C Trace Context / 常见网关头解析结果（32 hex trace + 16 hex span） */
export interface OtelTraceContext {
  otel_trace_id: string;
  otel_span_id: string;
}

const W3C_TRACEPARENT_RE =
  /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

/** 从 HTTP 头提取 OTel trace（优先 W3C `traceparent`，回退 `x-trace-id` + `x-span-id`） */
export function extractOtelTraceContextFromHttpHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): OtelTraceContext | null {
  if (!headers) return null;

  const pick = (key: string): string | undefined => {
    const raw = headers[key] ?? headers[key.toLowerCase()];
    if (raw == null) return undefined;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };

  const traceparent = pick('traceparent') ?? pick('Traceparent');
  if (traceparent) {
    const m = W3C_TRACEPARENT_RE.exec(traceparent);
    if (m) {
      return { otel_trace_id: m[1].toLowerCase(), otel_span_id: m[2].toLowerCase() };
    }
  }

  const traceId = pick('x-trace-id') ?? pick('X-Trace-Id');
  const spanId = pick('x-span-id') ?? pick('X-Span-Id');
  if (traceId && spanId && /^[0-9a-f]{32}$/i.test(traceId) && /^[0-9a-f]{16}$/i.test(spanId)) {
    return { otel_trace_id: traceId.toLowerCase(), otel_span_id: spanId.toLowerCase() };
  }

  return null;
}

/** route_and_run 请求内部挂载点（不经 DTO 暴露） */
export type RouteAndRunOtelTraceCarrier = {
  __otelTraceContext?: OtelTraceContext;
};

export function attachOtelTraceContextToRouteAndRunRequest(
  request: RouteAndRunOtelTraceCarrier,
  headers: Record<string, string | string[] | undefined> | undefined,
): OtelTraceContext | null {
  const ctx = extractOtelTraceContextFromHttpHeaders(headers);
  if (ctx) {
    request.__otelTraceContext = ctx;
  }
  return ctx;
}

export function readOtelTraceContextFromRouteAndRunRequest(
  request: RouteAndRunOtelTraceCarrier | undefined,
): OtelTraceContext | null {
  return request?.__otelTraceContext ?? null;
}

/** DSO harnessRuntime → Harness trace JSON meta */
export function harnessTraceCorrelationMetaFromRuntime(
  hr?: HarnessRuntimeState | null,
): HarnessTraceCorrelationMeta | undefined {
  if (!hr) return undefined;
  const meta: HarnessTraceCorrelationMeta = {};
  const runId = hr.evaluationRunId?.trim();
  if (runId) meta.evaluationRunId = runId;
  const otelTraceId = hr.otelTraceId?.trim();
  if (otelTraceId) meta.otelTraceId = otelTraceId;
  const otelSpanId = hr.otelSpanId?.trim();
  if (otelSpanId) meta.otelSpanId = otelSpanId;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/** API observability 切片字段（snake_case） */
export function resolveHarnessOtelObservabilityFields(
  hr?: HarnessRuntimeState | null,
  inbound?: OtelTraceContext | null,
): {
  otel_trace_id: string | null;
  otel_span_id: string | null;
} {
  const otel_trace_id = hr?.otelTraceId?.trim() ?? inbound?.otel_trace_id ?? null;
  const otel_span_id = hr?.otelSpanId?.trim() ?? inbound?.otel_span_id ?? null;
  return { otel_trace_id, otel_span_id };
}

/** DecisionKernel.createInitialState opts 片段 */
export function otelHarnessRuntimeFieldsFromRequest(
  request: RouteAndRunOtelTraceCarrier | undefined,
): Pick<HarnessRuntimeState, 'otelTraceId' | 'otelSpanId'> | undefined {
  const ctx = readOtelTraceContextFromRouteAndRunRequest(request);
  if (!ctx) return undefined;
  return { otelTraceId: ctx.otel_trace_id, otelSpanId: ctx.otel_span_id };
}
