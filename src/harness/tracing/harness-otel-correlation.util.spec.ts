import {
  attachOtelTraceContextToRouteAndRunRequest,
  extractOtelTraceContextFromHttpHeaders,
  harnessTraceCorrelationMetaFromRuntime,
  otelHarnessRuntimeFieldsFromRequest,
  resolveHarnessOtelObservabilityFields,
} from './harness-otel-correlation.util';

describe('harness-otel-correlation.util', () => {
  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const spanId = '00f067aa0ba902b7';

  it('parses W3C traceparent', () => {
    expect(
      extractOtelTraceContextFromHttpHeaders({
        traceparent: `00-${traceId}-${spanId}-01`,
      }),
    ).toEqual({ otel_trace_id: traceId, otel_span_id: spanId });
  });

  it('falls back to x-trace-id headers', () => {
    expect(
      extractOtelTraceContextFromHttpHeaders({
        'x-trace-id': traceId,
        'x-span-id': spanId,
      }),
    ).toEqual({ otel_trace_id: traceId, otel_span_id: spanId });
  });

  it('attaches context to route_and_run request carrier', () => {
    const req: { __otelTraceContext?: { otel_trace_id: string; otel_span_id: string } } = {};
    attachOtelTraceContextToRouteAndRunRequest(req, {
      traceparent: `00-${traceId}-${spanId}-01`,
    });
    expect(otelHarnessRuntimeFieldsFromRequest(req)).toEqual({
      otelTraceId: traceId,
      otelSpanId: spanId,
    });
  });

  it('builds harness trace meta and observability fields from runtime', () => {
    const hr = {
      evaluationRunId: 'eval-1',
      otelTraceId: traceId,
      otelSpanId: spanId,
    };
    expect(harnessTraceCorrelationMetaFromRuntime(hr)).toEqual({
      evaluationRunId: 'eval-1',
      otelTraceId: traceId,
      otelSpanId: spanId,
    });
    expect(resolveHarnessOtelObservabilityFields(hr)).toEqual({
      otel_trace_id: traceId,
      otel_span_id: spanId,
    });
  });

  it('observability falls back to inbound when runtime empty', () => {
    expect(
      resolveHarnessOtelObservabilityFields(undefined, {
        otel_trace_id: traceId,
        otel_span_id: spanId,
      }),
    ).toEqual({ otel_trace_id: traceId, otel_span_id: spanId });
  });
});
