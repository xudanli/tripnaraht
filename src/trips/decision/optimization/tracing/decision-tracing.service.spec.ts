import {
  DecisionTracingService,
  DecisionTraceAttributes,
  SpanStatus,
  SpanKind,
} from './decision-tracing.service';

describe('DecisionTracingService', () => {
  let service: DecisionTracingService;

  beforeEach(() => {
    service = new DecisionTracingService({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      environment: 'test',
    });
  });

  describe('startSpan', () => {
    it('should create a new span with valid context', () => {
      const activeSpan = service.startSpan('test-operation');

      expect(activeSpan.span.name).toBe('test-operation');
      expect(activeSpan.span.context.traceId).toHaveLength(32);
      expect(activeSpan.span.context.spanId).toHaveLength(16);
      expect(activeSpan.span.startTime).toBeLessThanOrEqual(Date.now());
      expect(activeSpan.span.status).toBe(SpanStatus.UNSET);

      activeSpan.end();
    });

    it('should include service attributes', () => {
      const activeSpan = service.startSpan('test-operation');

      expect(activeSpan.span.attributes['service.name']).toBe('test-service');
      expect(activeSpan.span.attributes['service.version']).toBe('1.0.0');
      expect(activeSpan.span.attributes['deployment.environment']).toBe('test');

      activeSpan.end();
    });

    it('should accept custom attributes', () => {
      const activeSpan = service.startSpan('test-operation', {
        attributes: { 'custom.key': 'custom-value' },
      });

      expect(activeSpan.span.attributes['custom.key']).toBe('custom-value');

      activeSpan.end();
    });

    it('should set span kind', () => {
      const activeSpan = service.startSpan('test-operation', {
        kind: SpanKind.SERVER,
      });

      expect(activeSpan.span.kind).toBe(SpanKind.SERVER);

      activeSpan.end();
    });

    it('should link parent span', () => {
      const parent = service.startSpan('parent');
      const child = service.startSpan('child');

      expect(child.span.parentSpanId).toBe(parent.span.context.spanId);
      expect(child.span.context.traceId).toBe(parent.span.context.traceId);

      child.end();
      parent.end();
    });

    it('should accept explicit parent span id', () => {
      const activeSpan = service.startSpan('test-operation', {
        parentSpanId: 'explicit-parent-id',
        traceId: 'a'.repeat(32),
      });

      expect(activeSpan.span.parentSpanId).toBe('explicit-parent-id');

      activeSpan.end();
    });
  });

  describe('ActiveSpan', () => {
    it('should set status', () => {
      const activeSpan = service.startSpan('test-operation');

      activeSpan.setStatus(SpanStatus.OK);
      expect(activeSpan.span.status).toBe(SpanStatus.OK);

      activeSpan.end();
    });

    it('should set status with message', () => {
      const activeSpan = service.startSpan('test-operation');

      activeSpan.setStatus(SpanStatus.ERROR, 'Something went wrong');
      expect(activeSpan.span.status).toBe(SpanStatus.ERROR);
      expect(activeSpan.span.attributes['status.message']).toBe('Something went wrong');

      activeSpan.end();
    });

    it('should set attribute', () => {
      const activeSpan = service.startSpan('test-operation');

      activeSpan.setAttribute('key1', 'value1');
      activeSpan.setAttribute('key2', 123);
      activeSpan.setAttribute('key3', true);

      expect(activeSpan.span.attributes['key1']).toBe('value1');
      expect(activeSpan.span.attributes['key2']).toBe(123);
      expect(activeSpan.span.attributes['key3']).toBe(true);

      activeSpan.end();
    });

    it('should set multiple attributes', () => {
      const activeSpan = service.startSpan('test-operation');

      activeSpan.setAttributes({
        'batch.key1': 'value1',
        'batch.key2': 'value2',
      });

      expect(activeSpan.span.attributes['batch.key1']).toBe('value1');
      expect(activeSpan.span.attributes['batch.key2']).toBe('value2');

      activeSpan.end();
    });

    it('should add event', () => {
      const activeSpan = service.startSpan('test-operation');

      activeSpan.addEvent('processing-started');
      activeSpan.addEvent('processing-completed', { 'items.count': 10 });

      expect(activeSpan.span.events).toHaveLength(2);
      expect(activeSpan.span.events[0].name).toBe('processing-started');
      expect(activeSpan.span.events[1].name).toBe('processing-completed');
      expect(activeSpan.span.events[1].attributes?.['items.count']).toBe(10);

      activeSpan.end();
    });

    it('should record exception', () => {
      const activeSpan = service.startSpan('test-operation');
      const error = new Error('Test error');

      activeSpan.recordException(error);

      expect(activeSpan.span.status).toBe(SpanStatus.ERROR);
      expect(activeSpan.span.events).toHaveLength(1);
      expect(activeSpan.span.events[0].name).toBe('exception');
      expect(activeSpan.span.events[0].attributes?.['exception.type']).toBe('Error');
      expect(activeSpan.span.events[0].attributes?.['exception.message']).toBe('Test error');

      activeSpan.end();
    });

    it('should end span and export', () => {
      const activeSpan = service.startSpan('test-operation');

      activeSpan.end(SpanStatus.OK);

      expect(activeSpan.span.endTime).toBeDefined();
      expect(activeSpan.span.status).toBe(SpanStatus.OK);

      const exported = service.getExportedSpans();
      expect(exported).toHaveLength(1);
      expect(exported[0].name).toBe('test-operation');
    });
  });

  describe('withSpan', () => {
    it('should wrap function with span', async () => {
      const result = await service.withSpan('test-operation', async (span) => {
        span.setAttribute('result', 42);
        return 42;
      });

      expect(result).toBe(42);

      const exported = service.getExportedSpans();
      expect(exported).toHaveLength(1);
      expect(exported[0].status).toBe(SpanStatus.OK);
    });

    it('should handle errors', async () => {
      await expect(
        service.withSpan('test-operation', async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');

      const exported = service.getExportedSpans();
      expect(exported).toHaveLength(1);
      expect(exported[0].status).toBe(SpanStatus.ERROR);
      expect(exported[0].events.some(e => e.name === 'exception')).toBe(true);
    });

    it('should pass attributes from options', async () => {
      await service.withSpan('test-operation', async () => {}, {
        kind: SpanKind.CLIENT,
        attributes: { 'test.attr': 'value' },
      });

      const exported = service.getExportedSpans();
      expect(exported[0].kind).toBe(SpanKind.CLIENT);
    });
  });

  describe('context propagation', () => {
    it('should inject context', () => {
      const activeSpan = service.startSpan('test-operation');

      const headers = service.injectContext();

      expect(headers['traceparent']).toMatch(
        /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
      );

      activeSpan.end();
    });

    it('should return empty when no active span', () => {
      const headers = service.injectContext();
      expect(headers).toEqual({});
    });

    it('should extract context from headers', () => {
      const traceId = 'a'.repeat(32);
      const spanId = 'b'.repeat(16);

      const context = service.extractContext({
        'traceparent': `00-${traceId}-${spanId}-01`,
      });

      expect(context.traceId).toBe(traceId);
      expect(context.parentSpanId).toBe(spanId);
    });

    it('should handle missing traceparent', () => {
      const context = service.extractContext({});
      expect(context).toEqual({});
    });

    it('should handle invalid traceparent', () => {
      const context = service.extractContext({
        'traceparent': 'invalid-format',
      });
      expect(context).toEqual({});
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      const span1 = service.startSpan('span1');
      const span2 = service.startSpan('span2');
      span1.end();

      const stats = service.getStats();

      expect(stats.totalSpans).toBe(2);
      expect(stats.activeSpans).toBe(1);
      expect(stats.exportedSpans).toBe(1);

      span2.end();
    });
  });

  describe('clearExportedSpans', () => {
    it('should clear exported spans', () => {
      const activeSpan = service.startSpan('test-operation');
      activeSpan.end();

      expect(service.getExportedSpans()).toHaveLength(1);

      service.clearExportedSpans();

      expect(service.getExportedSpans()).toHaveLength(0);
    });
  });

  describe('disabled tracing', () => {
    it('should return noop span when disabled', () => {
      const disabledService = new DecisionTracingService({
        enabled: false,
      });

      const activeSpan = disabledService.startSpan('test-operation');

      expect(activeSpan.span.context.traceId).toBe('');
      expect(activeSpan.span.context.spanId).toBe('');

      activeSpan.end();
      expect(disabledService.getExportedSpans()).toHaveLength(0);
    });
  });

  describe('sampling', () => {
    it('should respect sampling rate', () => {
      const sampledService = new DecisionTracingService({
        samplingRate: 0,
      });

      const activeSpan = sampledService.startSpan('test-operation');

      expect(activeSpan.span.context.traceId).toBe('');

      activeSpan.end();
    });
  });
});

describe('DecisionTraceAttributes', () => {
  it('should define standard attributes', () => {
    expect(DecisionTraceAttributes.REQUEST_ID).toBe('decision.request_id');
    expect(DecisionTraceAttributes.USER_ID).toBe('decision.user_id');
    expect(DecisionTraceAttributes.DSO_VERSION).toBe('decision.dso.version');
    expect(DecisionTraceAttributes.DECISION_PHASE).toBe('decision.phase');
    expect(DecisionTraceAttributes.ACTION).toBe('decision.action');
    expect(DecisionTraceAttributes.UTILITY).toBe('decision.utility');
    expect(DecisionTraceAttributes.CONFIDENCE).toBe('decision.confidence');
    expect(DecisionTraceAttributes.LATENCY_MS).toBe('decision.latency_ms');
    expect(DecisionTraceAttributes.CONSTRAINT_VIOLATIONS).toBe('decision.constraint_violations');
    expect(DecisionTraceAttributes.LEARNING_TRIGGERED).toBe('decision.learning_triggered');
    expect(DecisionTraceAttributes.LYAPUNOV_VALUE).toBe('decision.lyapunov_value');
    expect(DecisionTraceAttributes.CIRCUIT_STATE).toBe('decision.circuit_state');
    expect(DecisionTraceAttributes.CACHE_HIT).toBe('decision.cache_hit');
  });
});
