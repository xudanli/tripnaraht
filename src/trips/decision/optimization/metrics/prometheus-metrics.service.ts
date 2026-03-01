/**
 * Decision OS Prometheus 指标服务
 * 
 * 提供:
 * - 标准 Prometheus 指标类型
 * - 直方图分桶
 * - 标签支持
 * - 指标注册表
 */

import { Injectable, Logger } from '@nestjs/common';

// ========== 类型定义 ==========

export interface MetricLabels {
  [key: string]: string;
}

export interface MetricConfig {
  name: string;
  help: string;
  labelNames?: string[];
}

export interface HistogramConfig extends MetricConfig {
  buckets?: number[];
}

export interface SummaryConfig extends MetricConfig {
  percentiles?: number[];
  maxAge?: number;
}

export interface MetricValue {
  value: number;
  labels: MetricLabels;
  timestamp?: number;
}

export interface HistogramValue {
  sum: number;
  count: number;
  buckets: Map<number, number>;
  labels: MetricLabels;
}

export interface SummaryValue {
  sum: number;
  count: number;
  quantiles: Map<number, number>;
  labels: MetricLabels;
}

// ========== 指标基类 ==========

export abstract class Metric {
  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: string[] = [],
  ) {}

  protected getLabelKey(labels: MetricLabels): string {
    return this.labelNames.map(name => labels[name] ?? '').join('|');
  }

  abstract collect(): string;
}

// ========== Counter 指标 ==========

export class Counter extends Metric {
  private values = new Map<string, MetricValue>();

  inc(labels: MetricLabels = {}, value = 1): void {
    if (value < 0) throw new Error('Counter can only increase');

    const key = this.getLabelKey(labels);
    const current = this.values.get(key);

    if (current) {
      current.value += value;
    } else {
      this.values.set(key, { value, labels, timestamp: Date.now() });
    }
  }

  get(labels: MetricLabels = {}): number {
    const key = this.getLabelKey(labels);
    return this.values.get(key)?.value ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  collect(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];

    for (const [, { value, labels }] of this.values) {
      const labelStr = this.formatLabels(labels);
      lines.push(`${this.name}${labelStr} ${value}`);
    }

    return lines.join('\n');
  }

  private formatLabels(labels: MetricLabels): string {
    const pairs = Object.entries(labels)
      .filter(([key]) => this.labelNames.includes(key))
      .map(([key, value]) => `${key}="${this.escapeLabel(value)}"`);
    return pairs.length ? `{${pairs.join(',')}}` : '';
  }

  private escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}

// ========== Gauge 指标 ==========

export class Gauge extends Metric {
  private values = new Map<string, MetricValue>();

  set(labels: MetricLabels, value: number): void;
  set(value: number): void;
  set(labelsOrValue: MetricLabels | number, maybeValue?: number): void {
    let labels: MetricLabels;
    let value: number;

    if (typeof labelsOrValue === 'number') {
      labels = {};
      value = labelsOrValue;
    } else {
      labels = labelsOrValue;
      value = maybeValue!;
    }

    const key = this.getLabelKey(labels);
    this.values.set(key, { value, labels, timestamp: Date.now() });
  }

  inc(labels: MetricLabels = {}, value = 1): void {
    const key = this.getLabelKey(labels);
    const current = this.values.get(key);

    if (current) {
      current.value += value;
    } else {
      this.values.set(key, { value, labels, timestamp: Date.now() });
    }
  }

  dec(labels: MetricLabels = {}, value = 1): void {
    this.inc(labels, -value);
  }

  get(labels: MetricLabels = {}): number {
    const key = this.getLabelKey(labels);
    return this.values.get(key)?.value ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  collect(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
    ];

    for (const [, { value, labels }] of this.values) {
      const labelStr = this.formatLabels(labels);
      lines.push(`${this.name}${labelStr} ${value}`);
    }

    return lines.join('\n');
  }

  private formatLabels(labels: MetricLabels): string {
    const pairs = Object.entries(labels)
      .filter(([key]) => this.labelNames.includes(key))
      .map(([key, value]) => `${key}="${this.escapeLabel(value)}"`);
    return pairs.length ? `{${pairs.join(',')}}` : '';
  }

  private escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}

// ========== Histogram 指标 ==========

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export class Histogram extends Metric {
  private readonly buckets: number[];
  private values = new Map<string, HistogramValue>();

  constructor(config: HistogramConfig) {
    super(config.name, config.help, config.labelNames);
    this.buckets = [...(config.buckets ?? DEFAULT_BUCKETS)].sort((a, b) => a - b);
  }

  observe(labels: MetricLabels, value: number): void;
  observe(value: number): void;
  observe(labelsOrValue: MetricLabels | number, maybeValue?: number): void {
    let labels: MetricLabels;
    let value: number;

    if (typeof labelsOrValue === 'number') {
      labels = {};
      value = labelsOrValue;
    } else {
      labels = labelsOrValue;
      value = maybeValue!;
    }

    const key = this.getLabelKey(labels);
    let hist = this.values.get(key);

    if (!hist) {
      hist = {
        sum: 0,
        count: 0,
        buckets: new Map(this.buckets.map(b => [b, 0])),
        labels,
      };
      this.values.set(key, hist);
    }

    hist.sum += value;
    hist.count++;

    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        hist.buckets.set(this.buckets[i], (hist.buckets.get(this.buckets[i]) ?? 0) + 1);
        break;
      }
    }
  }

  startTimer(labels: MetricLabels = {}): () => number {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      const durationSeconds = Number(end - start) / 1e9;
      this.observe(labels, durationSeconds);
      return durationSeconds;
    };
  }

  reset(): void {
    this.values.clear();
  }

  collect(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];

    for (const [, hist] of this.values) {
      const labelStr = this.formatLabels(hist.labels);
      let cumulative = 0;

      for (const bucket of this.buckets) {
        cumulative += hist.buckets.get(bucket) ?? 0;
        const bucketLabel = labelStr
          ? `${labelStr.slice(0, -1)},le="${bucket}"}`
          : `{le="${bucket}"}`;
        lines.push(`${this.name}_bucket${bucketLabel} ${cumulative}`);
      }

      const infLabel = labelStr
        ? `${labelStr.slice(0, -1)},le="+Inf"}`
        : `{le="+Inf"}`;
      lines.push(`${this.name}_bucket${infLabel} ${hist.count}`);
      lines.push(`${this.name}_sum${labelStr} ${hist.sum}`);
      lines.push(`${this.name}_count${labelStr} ${hist.count}`);
    }

    return lines.join('\n');
  }

  private formatLabels(labels: MetricLabels): string {
    const pairs = Object.entries(labels)
      .filter(([key]) => this.labelNames.includes(key))
      .map(([key, value]) => `${key}="${this.escapeLabel(value)}"`);
    return pairs.length ? `{${pairs.join(',')}}` : '';
  }

  private escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}

// ========== 指标注册表 ==========

@Injectable()
export class MetricRegistry {
  private readonly logger = new Logger(MetricRegistry.name);
  private readonly metrics = new Map<string, Metric>();

  registerCounter(config: MetricConfig): Counter {
    if (this.metrics.has(config.name)) {
      return this.metrics.get(config.name) as Counter;
    }
    const counter = new Counter(config.name, config.help, config.labelNames);
    this.metrics.set(config.name, counter);
    return counter;
  }

  registerGauge(config: MetricConfig): Gauge {
    if (this.metrics.has(config.name)) {
      return this.metrics.get(config.name) as Gauge;
    }
    const gauge = new Gauge(config.name, config.help, config.labelNames);
    this.metrics.set(config.name, gauge);
    return gauge;
  }

  registerHistogram(config: HistogramConfig): Histogram {
    if (this.metrics.has(config.name)) {
      return this.metrics.get(config.name) as Histogram;
    }
    const histogram = new Histogram(config);
    this.metrics.set(config.name, histogram);
    return histogram;
  }

  getMetric<T extends Metric>(name: string): T | undefined {
    return this.metrics.get(name) as T | undefined;
  }

  collect(): string {
    const output: string[] = [];
    for (const metric of this.metrics.values()) {
      output.push(metric.collect());
    }
    return output.join('\n\n');
  }

  clear(): void {
    this.metrics.clear();
  }
}

// ========== Decision OS 标准指标 ==========

@Injectable()
export class DecisionOSMetrics {
  readonly decisionTotal: Counter;
  readonly decisionLatency: Histogram;
  readonly feedbackTotal: Counter;
  readonly utilityValue: Gauge;
  readonly activeDecisions: Gauge;
  readonly cacheHitTotal: Counter;
  readonly cacheMissTotal: Counter;
  readonly circuitBreakerState: Gauge;
  readonly learningIterations: Counter;
  readonly policyUpdates: Counter;
  readonly constraintViolations: Counter;
  readonly lyapunovValue: Gauge;
  readonly errorTotal: Counter;

  constructor(private readonly registry: MetricRegistry) {
    this.decisionTotal = registry.registerCounter({
      name: 'decision_os_decisions_total',
      help: 'Total number of decisions made',
      labelNames: ['action', 'status'],
    });

    this.decisionLatency = registry.registerHistogram({
      name: 'decision_os_decision_latency_seconds',
      help: 'Decision latency in seconds',
      labelNames: ['action'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    });

    this.feedbackTotal = registry.registerCounter({
      name: 'decision_os_feedback_total',
      help: 'Total number of feedback received',
      labelNames: ['sentiment'],
    });

    this.utilityValue = registry.registerGauge({
      name: 'decision_os_utility_value',
      help: 'Current utility value',
      labelNames: ['type'],
    });

    this.activeDecisions = registry.registerGauge({
      name: 'decision_os_active_decisions',
      help: 'Number of decisions currently being processed',
    });

    this.cacheHitTotal = registry.registerCounter({
      name: 'decision_os_cache_hits_total',
      help: 'Total cache hits',
      labelNames: ['cache_name'],
    });

    this.cacheMissTotal = registry.registerCounter({
      name: 'decision_os_cache_misses_total',
      help: 'Total cache misses',
      labelNames: ['cache_name'],
    });

    this.circuitBreakerState = registry.registerGauge({
      name: 'decision_os_circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=open, 2=half_open)',
      labelNames: ['circuit_name'],
    });

    this.learningIterations = registry.registerCounter({
      name: 'decision_os_learning_iterations_total',
      help: 'Total learning iterations',
    });

    this.policyUpdates = registry.registerCounter({
      name: 'decision_os_policy_updates_total',
      help: 'Total policy updates',
    });

    this.constraintViolations = registry.registerCounter({
      name: 'decision_os_constraint_violations_total',
      help: 'Total constraint violations',
      labelNames: ['constraint_type'],
    });

    this.lyapunovValue = registry.registerGauge({
      name: 'decision_os_lyapunov_value',
      help: 'Current Lyapunov stability value',
    });

    this.errorTotal = registry.registerCounter({
      name: 'decision_os_errors_total',
      help: 'Total errors',
      labelNames: ['error_type'],
    });
  }

  recordDecision(action: string, status: 'success' | 'failure', latencySeconds: number): void {
    this.decisionTotal.inc({ action, status });
    this.decisionLatency.observe({ action }, latencySeconds);
  }

  recordFeedback(score: number): void {
    const sentiment = score > 0.6 ? 'positive' : score < 0.4 ? 'negative' : 'neutral';
    this.feedbackTotal.inc({ sentiment });
  }

  recordCacheHit(cacheName: string): void {
    this.cacheHitTotal.inc({ cache_name: cacheName });
  }

  recordCacheMiss(cacheName: string): void {
    this.cacheMissTotal.inc({ cache_name: cacheName });
  }

  setCircuitState(name: string, state: 'closed' | 'open' | 'half_open'): void {
    const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
    this.circuitBreakerState.set({ circuit_name: name }, stateValue);
  }

  recordError(errorType: string): void {
    this.errorTotal.inc({ error_type: errorType });
  }

  getPrometheusOutput(): string {
    return this.registry.collect();
  }
}
