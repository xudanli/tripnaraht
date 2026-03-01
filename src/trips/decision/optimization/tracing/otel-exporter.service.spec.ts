import {
  OTLPSpanExporter,
  AlwaysOnSampler,
  AlwaysOffSampler,
  RatioSampler,
  ParentBasedSampler,
  createSampler,
  SpanStatusCode,
  JaegerSpanConverter,
  ZipkinSpanConverter,
  OTelSpan,
} from './otel-exporter.service';

describe('Samplers', () => {
  describe('AlwaysOnSampler', () => {
    it('should always return true', () => {
      const sampler = new AlwaysOnSampler();
      expect(sampler.shouldSample('trace-1')).toBe(true);
      expect(sampler.shouldSample('trace-2')).toBe(true);
    });
  });

  describe('AlwaysOffSampler', () => {
    it('should always return false', () => {
      const sampler = new AlwaysOffSampler();
      expect(sampler.shouldSample('trace-1')).toBe(false);
      expect(sampler.shouldSample('trace-2')).toBe(false);
    });
  });

  describe('RatioSampler', () => {
    it('should throw for invalid ratio', () => {
      expect(() => new RatioSampler(-0.1)).toThrow();
      expect(() => new RatioSampler(1.1)).toThrow();
    });

    it('should sample at 100%', () => {
      const sampler = new RatioSampler(1.0);
      let sampled = 0;
      for (let i = 0; i < 100; i++) {
        if (sampler.shouldSample(`trace-${i}`)) sampled++;
      }
      expect(sampled).toBe(100);
    });

    it('should sample at 0%', () => {
      const sampler = new RatioSampler(0.0);
      let sampled = 0;
      for (let i = 0; i < 100; i++) {
        if (sampler.shouldSample(`trace-${i}`)) sampled++;
      }
      expect(sampled).toBe(0);
    });

    it('should be deterministic for same trace', () => {
      const sampler = new RatioSampler(0.5);
      const result1 = sampler.shouldSample('trace-abc');
      const result2 = sampler.shouldSample('trace-abc');
      expect(result1).toBe(result2);
    });
  });

  describe('ParentBasedSampler', () => {
    it('should follow parent decision if available', () => {
      const sampler = new ParentBasedSampler(new AlwaysOffSampler());
      expect(sampler.shouldSample('trace-1', true)).toBe(true);
      expect(sampler.shouldSample('trace-1', false)).toBe(false);
    });

    it('should use root sampler if no parent', () => {
      const sampler = new ParentBasedSampler(new AlwaysOnSampler());
      expect(sampler.shouldSample('trace-1')).toBe(true);

      const sampler2 = new ParentBasedSampler(new AlwaysOffSampler());
      expect(sampler2.shouldSample('trace-1')).toBe(false);
    });
  });

  describe('createSampler', () => {
    it('should create always_on sampler', () => {
      const sampler = createSampler({ type: 'always_on' });
      expect(sampler).toBeInstanceOf(AlwaysOnSampler);
    });

    it('should create always_off sampler', () => {
      const sampler = createSampler({ type: 'always_off' });
      expect(sampler).toBeInstanceOf(AlwaysOffSampler);
    });

    it('should create ratio sampler', () => {
      const sampler = createSampler({ type: 'ratio', ratio: 0.5 });
      expect(sampler).toBeInstanceOf(RatioSampler);
    });

    it('should create parent_based sampler', () => {
      const sampler = createSampler({ type: 'parent_based', ratio: 0.5 });
      expect(sampler).toBeInstanceOf(ParentBasedSampler);
    });
  });
});

describe('OTLPSpanExporter', () => {
  let exporter: OTLPSpanExporter;

  const createSpan = (overrides?: Partial<OTelSpan>): OTelSpan => ({
    traceId: 'abc123',
    spanId: 'span456',
    operationName: 'test-operation',
    serviceName: 'test-service',
    startTimeUnixNano: BigInt(Date.now() * 1000000),
    endTimeUnixNano: BigInt(Date.now() * 1000000 + 100000000),
    status: { code: SpanStatusCode.OK },
    attributes: [{ key: 'test.attr', value: { stringValue: 'value' } }],
    events: [],
    links: [],
    ...overrides,
  });

  beforeEach(() => {
    exporter = new OTLPSpanExporter(
      { batchSize: 10, flushIntervalMs: 100000 },
      { type: 'always_on' },
    );
  });

  afterEach(() => {
    exporter.shutdown();
  });

  describe('shouldSample', () => {
    it('should delegate to sampler', () => {
      const alwaysOnExporter = new OTLPSpanExporter({}, { type: 'always_on' });
      expect(alwaysOnExporter.shouldSample('trace-1')).toBe(true);
      alwaysOnExporter.shutdown();

      const alwaysOffExporter = new OTLPSpanExporter({}, { type: 'always_off' });
      expect(alwaysOffExporter.shouldSample('trace-1')).toBe(false);
      alwaysOffExporter.shutdown();
    });
  });

  describe('export', () => {
    it('should add span to queue', () => {
      const span = createSpan();
      exporter.export(span);
      expect(exporter.getQueueSize()).toBe(1);
    });

    it('should respect max queue size', () => {
      const smallQueueExporter = new OTLPSpanExporter(
        { maxQueueSize: 2, batchSize: 100, flushIntervalMs: 100000 },
        { type: 'always_on' },
      );

      smallQueueExporter.export(createSpan());
      smallQueueExporter.export(createSpan());
      smallQueueExporter.export(createSpan());

      expect(smallQueueExporter.getQueueSize()).toBe(2);
      smallQueueExporter.shutdown();
    });
  });

  describe('flush', () => {
    it('should return success for empty queue', async () => {
      const result = await exporter.flush();
      expect(result.success).toBe(true);
      expect(result.spansExported).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should stop accepting spans', async () => {
      await exporter.shutdown();
      exporter.export(createSpan());
      expect(exporter.getQueueSize()).toBe(0);
    });
  });
});

describe('JaegerSpanConverter', () => {
  const createOTelSpan = (): OTelSpan => ({
    traceId: 'abc123def456',
    spanId: 'span789',
    parentSpanId: 'parent123',
    operationName: 'test-op',
    serviceName: 'test-service',
    startTimeUnixNano: BigInt(1000000000000000),
    endTimeUnixNano: BigInt(1000000100000000),
    status: { code: SpanStatusCode.OK },
    attributes: [
      { key: 'string.attr', value: { stringValue: 'hello' } },
      { key: 'int.attr', value: { intValue: 42 } },
      { key: 'float.attr', value: { doubleValue: 3.14 } },
      { key: 'bool.attr', value: { boolValue: true } },
    ],
    events: [
      {
        name: 'test-event',
        timeUnixNano: BigInt(1000000050000000),
        attributes: [{ key: 'event.key', value: { stringValue: 'event-value' } }],
      },
    ],
    links: [],
  });

  it('should convert to Jaeger format', () => {
    const otelSpan = createOTelSpan();
    const jaegerSpan = JaegerSpanConverter.toJaeger(otelSpan);

    expect(jaegerSpan.traceID).toBe('abc123def456');
    expect(jaegerSpan.spanID).toBe('span789');
    expect(jaegerSpan.parentSpanID).toBe('parent123');
    expect(jaegerSpan.operationName).toBe('test-op');
  });

  it('should convert references', () => {
    const otelSpan = createOTelSpan();
    const jaegerSpan = JaegerSpanConverter.toJaeger(otelSpan);

    expect(jaegerSpan.references.length).toBe(1);
    expect(jaegerSpan.references[0].refType).toBe('CHILD_OF');
    expect(jaegerSpan.references[0].spanID).toBe('parent123');
  });

  it('should convert timestamps', () => {
    const otelSpan = createOTelSpan();
    const jaegerSpan = JaegerSpanConverter.toJaeger(otelSpan);

    expect(jaegerSpan.startTime).toBe(1000000000000);
    expect(jaegerSpan.duration).toBe(100000);
  });

  it('should convert attributes to tags', () => {
    const otelSpan = createOTelSpan();
    const jaegerSpan = JaegerSpanConverter.toJaeger(otelSpan);

    expect(jaegerSpan.tags).toContainEqual({ key: 'string.attr', type: 'string', value: 'hello' });
    expect(jaegerSpan.tags).toContainEqual({ key: 'int.attr', type: 'int64', value: 42 });
    expect(jaegerSpan.tags).toContainEqual({ key: 'float.attr', type: 'float64', value: 3.14 });
    expect(jaegerSpan.tags).toContainEqual({ key: 'bool.attr', type: 'bool', value: true });
  });

  it('should convert events to logs', () => {
    const otelSpan = createOTelSpan();
    const jaegerSpan = JaegerSpanConverter.toJaeger(otelSpan);

    expect(jaegerSpan.logs.length).toBe(1);
    expect(jaegerSpan.logs[0].timestamp).toBe(1000000050000);
  });
});

describe('ZipkinSpanConverter', () => {
  const createOTelSpan = (): OTelSpan => ({
    traceId: 'abc123def456',
    spanId: 'span789',
    parentSpanId: 'parent123',
    operationName: 'test-op',
    serviceName: 'test-service',
    startTimeUnixNano: BigInt(1000000000000000),
    endTimeUnixNano: BigInt(1000000100000000),
    status: { code: SpanStatusCode.OK },
    attributes: [
      { key: 'string.attr', value: { stringValue: 'hello' } },
      { key: 'int.attr', value: { intValue: 42 } },
    ],
    events: [
      {
        name: 'test-event',
        timeUnixNano: BigInt(1000000050000000),
        attributes: [],
      },
    ],
    links: [],
  });

  it('should convert to Zipkin format', () => {
    const otelSpan = createOTelSpan();
    const zipkinSpan = ZipkinSpanConverter.toZipkin(otelSpan);

    expect(zipkinSpan.traceId).toBe('abc123def456');
    expect(zipkinSpan.id).toBe('span789');
    expect(zipkinSpan.parentId).toBe('parent123');
    expect(zipkinSpan.name).toBe('test-op');
  });

  it('should set service endpoint', () => {
    const otelSpan = createOTelSpan();
    const zipkinSpan = ZipkinSpanConverter.toZipkin(otelSpan);

    expect(zipkinSpan.localEndpoint.serviceName).toBe('test-service');
  });

  it('should convert timestamps', () => {
    const otelSpan = createOTelSpan();
    const zipkinSpan = ZipkinSpanConverter.toZipkin(otelSpan);

    expect(zipkinSpan.timestamp).toBe(1000000000000);
    expect(zipkinSpan.duration).toBe(100000);
  });

  it('should convert attributes to tags', () => {
    const otelSpan = createOTelSpan();
    const zipkinSpan = ZipkinSpanConverter.toZipkin(otelSpan);

    expect(zipkinSpan.tags['string.attr']).toBe('hello');
    expect(zipkinSpan.tags['int.attr']).toBe('42');
  });

  it('should convert events to annotations', () => {
    const otelSpan = createOTelSpan();
    const zipkinSpan = ZipkinSpanConverter.toZipkin(otelSpan);

    expect(zipkinSpan.annotations.length).toBe(1);
    expect(zipkinSpan.annotations[0].value).toBe('test-event');
    expect(zipkinSpan.annotations[0].timestamp).toBe(1000000050000);
  });
});
