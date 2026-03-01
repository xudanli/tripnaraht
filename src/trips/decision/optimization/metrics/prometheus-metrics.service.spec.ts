import {
  Counter,
  Gauge,
  Histogram,
  MetricRegistry,
  DecisionOSMetrics,
} from './prometheus-metrics.service';

describe('Counter', () => {
  let counter: Counter;

  beforeEach(() => {
    counter = new Counter('test_counter', 'Test counter', ['label1']);
  });

  describe('inc', () => {
    it('should increment by 1 by default', () => {
      counter.inc();
      expect(counter.get()).toBe(1);
    });

    it('should increment by specified value', () => {
      counter.inc({}, 5);
      expect(counter.get()).toBe(5);
    });

    it('should throw for negative values', () => {
      expect(() => counter.inc({}, -1)).toThrow();
    });

    it('should track values per label', () => {
      counter.inc({ label1: 'a' });
      counter.inc({ label1: 'b' }, 2);
      counter.inc({ label1: 'a' }, 3);

      expect(counter.get({ label1: 'a' })).toBe(4);
      expect(counter.get({ label1: 'b' })).toBe(2);
    });
  });

  describe('get', () => {
    it('should return 0 for non-existent labels', () => {
      expect(counter.get({ label1: 'unknown' })).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all values', () => {
      counter.inc({ label1: 'a' }, 5);
      counter.reset();
      expect(counter.get({ label1: 'a' })).toBe(0);
    });
  });

  describe('collect', () => {
    it('should output Prometheus format', () => {
      counter.inc({ label1: 'value1' }, 10);

      const output = counter.collect();

      expect(output).toContain('# HELP test_counter Test counter');
      expect(output).toContain('# TYPE test_counter counter');
      expect(output).toContain('test_counter{label1="value1"} 10');
    });

    it('should escape label values', () => {
      counter.inc({ label1: 'with"quote' });

      const output = counter.collect();
      expect(output).toContain('label1="with\\"quote"');
    });
  });
});

describe('Gauge', () => {
  let gauge: Gauge;

  beforeEach(() => {
    gauge = new Gauge('test_gauge', 'Test gauge', ['env']);
  });

  describe('set', () => {
    it('should set value without labels', () => {
      gauge.set(42);
      expect(gauge.get()).toBe(42);
    });

    it('should set value with labels', () => {
      gauge.set({ env: 'prod' }, 100);
      expect(gauge.get({ env: 'prod' })).toBe(100);
    });
  });

  describe('inc', () => {
    it('should increment value', () => {
      gauge.set(10);
      gauge.inc({}, 5);
      expect(gauge.get()).toBe(15);
    });
  });

  describe('dec', () => {
    it('should decrement value', () => {
      gauge.set(10);
      gauge.dec({}, 3);
      expect(gauge.get()).toBe(7);
    });
  });

  describe('collect', () => {
    it('should output Prometheus format', () => {
      gauge.set({ env: 'staging' }, 50);

      const output = gauge.collect();

      expect(output).toContain('# TYPE test_gauge gauge');
      expect(output).toContain('test_gauge{env="staging"} 50');
    });
  });
});

describe('Histogram', () => {
  let histogram: Histogram;

  beforeEach(() => {
    histogram = new Histogram({
      name: 'test_histogram',
      help: 'Test histogram',
      labelNames: ['method'],
      buckets: [0.1, 0.5, 1, 5],
    });
  });

  describe('observe', () => {
    it('should observe value without labels', () => {
      histogram.observe(0.3);
      histogram.observe(0.7);

      const output = histogram.collect();
      expect(output).toContain('test_histogram_count 2');
      expect(output).toContain('test_histogram_sum 1');
    });

    it('should observe value with labels', () => {
      histogram.observe({ method: 'GET' }, 0.2);

      const output = histogram.collect();
      expect(output).toContain('method="GET"');
    });

    it('should populate correct buckets cumulatively', () => {
      histogram.observe(0.05);
      histogram.observe(0.3);
      histogram.observe(0.8);
      histogram.observe(3);

      const output = histogram.collect();
      expect(output).toContain('test_histogram_bucket{le="0.1"} 1');
      expect(output).toContain('test_histogram_bucket{le="0.5"} 2');
      expect(output).toContain('test_histogram_bucket{le="1"} 3');
      expect(output).toContain('test_histogram_bucket{le="5"} 4');
      expect(output).toContain('test_histogram_bucket{le="+Inf"} 4');
      expect(output).toContain('test_histogram_count 4');
    });
  });

  describe('startTimer', () => {
    it('should return duration when called', async () => {
      const endTimer = histogram.startTimer({ method: 'POST' });

      await new Promise(r => setTimeout(r, 50));
      const duration = endTimer();

      expect(duration).toBeGreaterThanOrEqual(0.04);
      expect(duration).toBeLessThan(0.2);
    });
  });

  describe('collect', () => {
    it('should output full histogram format', () => {
      histogram.observe(0.25);

      const output = histogram.collect();

      expect(output).toContain('# HELP test_histogram Test histogram');
      expect(output).toContain('# TYPE test_histogram histogram');
      expect(output).toContain('_bucket{');
      expect(output).toContain('_sum');
      expect(output).toContain('_count');
    });
  });
});

describe('MetricRegistry', () => {
  let registry: MetricRegistry;

  beforeEach(() => {
    registry = new MetricRegistry();
  });

  describe('registerCounter', () => {
    it('should create new counter', () => {
      const counter = registry.registerCounter({
        name: 'my_counter',
        help: 'My counter',
      });

      expect(counter).toBeInstanceOf(Counter);
    });

    it('should return existing counter if already registered', () => {
      const counter1 = registry.registerCounter({
        name: 'same_counter',
        help: 'Same counter',
      });
      const counter2 = registry.registerCounter({
        name: 'same_counter',
        help: 'Same counter again',
      });

      expect(counter1).toBe(counter2);
    });
  });

  describe('registerGauge', () => {
    it('should create new gauge', () => {
      const gauge = registry.registerGauge({
        name: 'my_gauge',
        help: 'My gauge',
      });

      expect(gauge).toBeInstanceOf(Gauge);
    });
  });

  describe('registerHistogram', () => {
    it('should create new histogram', () => {
      const histogram = registry.registerHistogram({
        name: 'my_histogram',
        help: 'My histogram',
        buckets: [1, 5, 10],
      });

      expect(histogram).toBeInstanceOf(Histogram);
    });
  });

  describe('getMetric', () => {
    it('should return registered metric', () => {
      const counter = registry.registerCounter({
        name: 'find_me',
        help: 'Find me',
      });

      const found = registry.getMetric<Counter>('find_me');
      expect(found).toBe(counter);
    });

    it('should return undefined for unregistered metric', () => {
      const found = registry.getMetric('not_exists');
      expect(found).toBeUndefined();
    });
  });

  describe('collect', () => {
    it('should collect all metrics', () => {
      const counter = registry.registerCounter({ name: 'c1', help: 'Counter' });
      const gauge = registry.registerGauge({ name: 'g1', help: 'Gauge' });

      counter.inc({}, 5);
      gauge.set(10);

      const output = registry.collect();

      expect(output).toContain('c1 5');
      expect(output).toContain('g1 10');
    });
  });

  describe('clear', () => {
    it('should remove all metrics', () => {
      registry.registerCounter({ name: 'c1', help: 'Counter' });
      registry.clear();

      expect(registry.getMetric('c1')).toBeUndefined();
    });
  });
});

describe('DecisionOSMetrics', () => {
  let metrics: DecisionOSMetrics;
  let registry: MetricRegistry;

  beforeEach(() => {
    registry = new MetricRegistry();
    metrics = new DecisionOSMetrics(registry);
  });

  describe('initialization', () => {
    it('should register all standard metrics', () => {
      expect(metrics.decisionTotal).toBeInstanceOf(Counter);
      expect(metrics.decisionLatency).toBeInstanceOf(Histogram);
      expect(metrics.feedbackTotal).toBeInstanceOf(Counter);
      expect(metrics.utilityValue).toBeInstanceOf(Gauge);
      expect(metrics.activeDecisions).toBeInstanceOf(Gauge);
      expect(metrics.cacheHitTotal).toBeInstanceOf(Counter);
      expect(metrics.cacheMissTotal).toBeInstanceOf(Counter);
      expect(metrics.circuitBreakerState).toBeInstanceOf(Gauge);
      expect(metrics.learningIterations).toBeInstanceOf(Counter);
      expect(metrics.policyUpdates).toBeInstanceOf(Counter);
      expect(metrics.constraintViolations).toBeInstanceOf(Counter);
      expect(metrics.lyapunovValue).toBeInstanceOf(Gauge);
      expect(metrics.errorTotal).toBeInstanceOf(Counter);
    });
  });

  describe('recordDecision', () => {
    it('should record decision metrics', () => {
      metrics.recordDecision('ACCEPT', 'success', 0.15);

      expect(metrics.decisionTotal.get({ action: 'ACCEPT', status: 'success' })).toBe(1);
    });
  });

  describe('recordFeedback', () => {
    it('should categorize positive feedback', () => {
      metrics.recordFeedback(0.8);
      expect(metrics.feedbackTotal.get({ sentiment: 'positive' })).toBe(1);
    });

    it('should categorize negative feedback', () => {
      metrics.recordFeedback(0.2);
      expect(metrics.feedbackTotal.get({ sentiment: 'negative' })).toBe(1);
    });

    it('should categorize neutral feedback', () => {
      metrics.recordFeedback(0.5);
      expect(metrics.feedbackTotal.get({ sentiment: 'neutral' })).toBe(1);
    });
  });

  describe('cache metrics', () => {
    it('should record cache hit', () => {
      metrics.recordCacheHit('policy');
      expect(metrics.cacheHitTotal.get({ cache_name: 'policy' })).toBe(1);
    });

    it('should record cache miss', () => {
      metrics.recordCacheMiss('policy');
      expect(metrics.cacheMissTotal.get({ cache_name: 'policy' })).toBe(1);
    });
  });

  describe('setCircuitState', () => {
    it('should set closed state as 0', () => {
      metrics.setCircuitState('main', 'closed');
      expect(metrics.circuitBreakerState.get({ circuit_name: 'main' })).toBe(0);
    });

    it('should set open state as 1', () => {
      metrics.setCircuitState('main', 'open');
      expect(metrics.circuitBreakerState.get({ circuit_name: 'main' })).toBe(1);
    });

    it('should set half_open state as 2', () => {
      metrics.setCircuitState('main', 'half_open');
      expect(metrics.circuitBreakerState.get({ circuit_name: 'main' })).toBe(2);
    });
  });

  describe('recordError', () => {
    it('should record error by type', () => {
      metrics.recordError('timeout');
      metrics.recordError('timeout');
      metrics.recordError('validation');

      expect(metrics.errorTotal.get({ error_type: 'timeout' })).toBe(2);
      expect(metrics.errorTotal.get({ error_type: 'validation' })).toBe(1);
    });
  });

  describe('getPrometheusOutput', () => {
    it('should return complete Prometheus output', () => {
      metrics.recordDecision('ACCEPT', 'success', 0.1);
      metrics.recordFeedback(0.9);

      const output = metrics.getPrometheusOutput();

      expect(output).toContain('decision_os_decisions_total');
      expect(output).toContain('decision_os_decision_latency_seconds');
      expect(output).toContain('decision_os_feedback_total');
    });
  });
});
