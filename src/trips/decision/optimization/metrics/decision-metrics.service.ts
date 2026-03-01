/**
 * Decision OS 监控指标服务
 *
 * 提供 Prometheus 兼容的指标导出，用于监控决策系统健康度
 * 
 * 关键指标：
 * - 决策延迟 (decision_latency_seconds)
 * - 效用分布 (utility_score)
 * - 约束违反率 (constraint_violation_rate)
 * - Regret 累计值 (cumulative_regret)
 * - 学习收敛状态 (learning_convergence)
 * - DSO 状态机转换 (state_machine_transitions)
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * 指标类型
 */
type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * 指标定义
 */
interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  labels?: string[];
}

/**
 * 直方图桶配置
 */
interface HistogramBuckets {
  boundaries: number[];
  counts: number[];
  sum: number;
  count: number;
}

/**
 * 指标值
 */
interface MetricValue {
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

/**
 * 直方图观测
 */
interface HistogramObservation {
  buckets: HistogramBuckets;
  labels?: Record<string, string>;
}

// ========== 指标定义 ==========

const METRIC_DEFINITIONS: MetricDefinition[] = [
  // 决策延迟
  {
    name: 'decision_os_decision_latency_seconds',
    help: 'Decision making latency in seconds',
    type: 'histogram',
    labels: ['phase', 'outcome'],
  },
  // 效用分数
  {
    name: 'decision_os_utility_score',
    help: 'Utility score of decisions',
    type: 'histogram',
    labels: ['decision_type'],
  },
  // 约束违反
  {
    name: 'decision_os_constraint_violations_total',
    help: 'Total number of constraint violations',
    type: 'counter',
    labels: ['constraint_type', 'severity'],
  },
  // 累计 Regret
  {
    name: 'decision_os_cumulative_regret',
    help: 'Cumulative regret value',
    type: 'gauge',
    labels: ['user_id'],
  },
  // 学习更新次数
  {
    name: 'decision_os_learning_updates_total',
    help: 'Total number of learning updates',
    type: 'counter',
    labels: ['method'],
  },
  // 收敛状态
  {
    name: 'decision_os_convergence_status',
    help: 'Learning convergence status (0=not_started, 1=learning, 2=converging, 3=converged)',
    type: 'gauge',
    labels: ['user_id'],
  },
  // 状态机转换
  {
    name: 'decision_os_state_transitions_total',
    help: 'Total state machine transitions',
    type: 'counter',
    labels: ['from_phase', 'to_phase'],
  },
  // DSO 版本
  {
    name: 'decision_os_dso_version',
    help: 'Current DSO version',
    type: 'gauge',
    labels: ['request_id'],
  },
  // 锁等待时间
  {
    name: 'decision_os_lock_wait_seconds',
    help: 'Distributed lock wait time in seconds',
    type: 'histogram',
    labels: ['resource_type'],
  },
  // 锁持有时间
  {
    name: 'decision_os_lock_hold_seconds',
    help: 'Distributed lock hold time in seconds',
    type: 'histogram',
    labels: ['resource_type'],
  },
  // Monte Carlo 采样数
  {
    name: 'decision_os_monte_carlo_samples',
    help: 'Number of Monte Carlo samples used',
    type: 'histogram',
    labels: ['method'],
  },
  // 有效样本数
  {
    name: 'decision_os_effective_sample_size',
    help: 'Effective sample size from importance sampling',
    type: 'gauge',
    labels: ['request_id'],
  },
  // CGUS 搜索迭代
  {
    name: 'decision_os_cgus_iterations_total',
    help: 'Total CGUS search iterations',
    type: 'counter',
    labels: ['outcome'],
  },
  // 策略网络熵
  {
    name: 'decision_os_policy_entropy',
    help: 'Policy network entropy (exploration measure)',
    type: 'gauge',
    labels: ['action_space'],
  },
  // Lyapunov 值
  {
    name: 'decision_os_lyapunov_value',
    help: 'Lyapunov function value for stability monitoring',
    type: 'gauge',
    labels: ['request_id'],
  },
];

// 默认直方图桶边界
const DEFAULT_LATENCY_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DEFAULT_UTILITY_BUCKETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const DEFAULT_SAMPLE_BUCKETS = [10, 50, 100, 200, 500, 1000, 2000, 5000];

@Injectable()
export class DecisionMetricsService {
  private readonly logger = new Logger(DecisionMetricsService.name);

  // 指标存储
  private counters: Map<string, Map<string, number>> = new Map();
  private gauges: Map<string, Map<string, MetricValue>> = new Map();
  private histograms: Map<string, Map<string, HistogramObservation>> = new Map();

  constructor() {
    this.initializeMetrics();
    this.logger.log('[DecisionMetrics] 指标服务初始化完成');
  }

  // ========== 决策延迟 ==========

  recordDecisionLatency(
    latencySeconds: number,
    phase: string,
    outcome: 'success' | 'failure' | 'timeout',
  ): void {
    this.observeHistogram(
      'decision_os_decision_latency_seconds',
      latencySeconds,
      { phase, outcome },
      DEFAULT_LATENCY_BUCKETS,
    );
  }

  // ========== 效用分数 ==========

  recordUtilityScore(utility: number, decisionType: string): void {
    this.observeHistogram(
      'decision_os_utility_score',
      utility,
      { decision_type: decisionType },
      DEFAULT_UTILITY_BUCKETS,
    );
  }

  // ========== 约束违反 ==========

  incrementConstraintViolation(
    constraintType: string,
    severity: 'hard' | 'soft',
  ): void {
    this.incrementCounter(
      'decision_os_constraint_violations_total',
      { constraint_type: constraintType, severity },
    );
  }

  // ========== Regret 追踪 ==========

  setCumulativeRegret(userId: string, regret: number): void {
    this.setGauge('decision_os_cumulative_regret', regret, { user_id: userId });
  }

  // ========== 学习更新 ==========

  incrementLearningUpdate(method: string): void {
    this.incrementCounter('decision_os_learning_updates_total', { method });
  }

  setConvergenceStatus(
    userId: string,
    status: 'NOT_STARTED' | 'LEARNING' | 'CONVERGING' | 'CONVERGED',
  ): void {
    const statusValue = {
      NOT_STARTED: 0,
      LEARNING: 1,
      CONVERGING: 2,
      CONVERGED: 3,
    }[status];
    this.setGauge('decision_os_convergence_status', statusValue, { user_id: userId });
  }

  // ========== 状态机 ==========

  recordStateTransition(fromPhase: string, toPhase: string): void {
    this.incrementCounter(
      'decision_os_state_transitions_total',
      { from_phase: fromPhase, to_phase: toPhase },
    );
  }

  setDSOVersion(requestId: string, version: number): void {
    this.setGauge('decision_os_dso_version', version, { request_id: requestId });
  }

  // ========== 分布式锁 ==========

  recordLockWaitTime(resourceType: string, waitSeconds: number): void {
    this.observeHistogram(
      'decision_os_lock_wait_seconds',
      waitSeconds,
      { resource_type: resourceType },
      DEFAULT_LATENCY_BUCKETS,
    );
  }

  recordLockHoldTime(resourceType: string, holdSeconds: number): void {
    this.observeHistogram(
      'decision_os_lock_hold_seconds',
      holdSeconds,
      { resource_type: resourceType },
      DEFAULT_LATENCY_BUCKETS,
    );
  }

  // ========== Monte Carlo ==========

  recordMonteCarloSamples(method: string, sampleCount: number): void {
    this.observeHistogram(
      'decision_os_monte_carlo_samples',
      sampleCount,
      { method },
      DEFAULT_SAMPLE_BUCKETS,
    );
  }

  setEffectiveSampleSize(requestId: string, ess: number): void {
    this.setGauge('decision_os_effective_sample_size', ess, { request_id: requestId });
  }

  // ========== CGUS ==========

  incrementCGUSIteration(outcome: 'converged' | 'max_iterations' | 'timeout'): void {
    this.incrementCounter('decision_os_cgus_iterations_total', { outcome });
  }

  // ========== 策略网络 ==========

  setPolicyEntropy(actionSpace: string, entropy: number): void {
    this.setGauge('decision_os_policy_entropy', entropy, { action_space: actionSpace });
  }

  // ========== Lyapunov ==========

  setLyapunovValue(requestId: string, value: number): void {
    this.setGauge('decision_os_lyapunov_value', value, { request_id: requestId });
  }

  // ========== 导出 Prometheus 格式 ==========

  exportPrometheusFormat(): string {
    const lines: string[] = [];

    // 导出 counters
    for (const [name, labelMap] of this.counters) {
      const def = METRIC_DEFINITIONS.find(d => d.name === name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} counter`);
      }
      for (const [labelKey, value] of labelMap) {
        lines.push(`${name}${labelKey} ${value}`);
      }
    }

    // 导出 gauges
    for (const [name, labelMap] of this.gauges) {
      const def = METRIC_DEFINITIONS.find(d => d.name === name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} gauge`);
      }
      for (const [labelKey, mv] of labelMap) {
        lines.push(`${name}${labelKey} ${mv.value}`);
      }
    }

    // 导出 histograms
    for (const [name, labelMap] of this.histograms) {
      const def = METRIC_DEFINITIONS.find(d => d.name === name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} histogram`);
      }
      for (const [labelKey, obs] of labelMap) {
        const { buckets } = obs;
        let cumulative = 0;
        for (let i = 0; i < buckets.boundaries.length; i++) {
          cumulative += buckets.counts[i];
          const le = buckets.boundaries[i];
          const bucketLabel = labelKey
            ? labelKey.replace('}', `,le="${le}"}`)
            : `{le="${le}"}`;
          lines.push(`${name}_bucket${bucketLabel} ${cumulative}`);
        }
        // +Inf bucket
        cumulative += buckets.counts[buckets.counts.length - 1] || 0;
        const infLabel = labelKey
          ? labelKey.replace('}', `,le="+Inf"}`)
          : `{le="+Inf"}`;
        lines.push(`${name}_bucket${infLabel} ${cumulative}`);
        lines.push(`${name}_sum${labelKey} ${buckets.sum}`);
        lines.push(`${name}_count${labelKey} ${buckets.count}`);
      }
    }

    return lines.join('\n');
  }

  // ========== 获取指标摘要 ==========

  getSummary(): Record<string, unknown> {
    const summary: Record<string, unknown> = {};

    // Counters
    for (const [name, labelMap] of this.counters) {
      summary[name] = Object.fromEntries(labelMap);
    }

    // Gauges
    for (const [name, labelMap] of this.gauges) {
      const gaugeObj: Record<string, number> = {};
      for (const [labelKey, mv] of labelMap) {
        gaugeObj[labelKey || 'default'] = mv.value;
      }
      summary[name] = gaugeObj;
    }

    // Histograms (simplified)
    for (const [name, labelMap] of this.histograms) {
      const histObj: Record<string, { count: number; sum: number; avg: number }> = {};
      for (const [labelKey, obs] of labelMap) {
        const avg = obs.buckets.count > 0 ? obs.buckets.sum / obs.buckets.count : 0;
        histObj[labelKey || 'default'] = {
          count: obs.buckets.count,
          sum: obs.buckets.sum,
          avg,
        };
      }
      summary[name] = histObj;
    }

    return summary;
  }

  // ========== 私有方法 ==========

  private initializeMetrics(): void {
    for (const def of METRIC_DEFINITIONS) {
      switch (def.type) {
        case 'counter':
          this.counters.set(def.name, new Map());
          break;
        case 'gauge':
          this.gauges.set(def.name, new Map());
          break;
        case 'histogram':
        case 'summary':
          this.histograms.set(def.name, new Map());
          break;
      }
    }
  }

  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return '';
    const pairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `{${pairs}}`;
  }

  private incrementCounter(name: string, labels?: Record<string, string>, value = 1): void {
    const labelKey = this.formatLabels(labels);
    const counterMap = this.counters.get(name);
    if (!counterMap) return;
    
    const current = counterMap.get(labelKey) ?? 0;
    counterMap.set(labelKey, current + value);
  }

  private setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const labelKey = this.formatLabels(labels);
    const gaugeMap = this.gauges.get(name);
    if (!gaugeMap) return;
    
    gaugeMap.set(labelKey, { value, labels, timestamp: Date.now() });
  }

  private observeHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>,
    buckets: number[] = DEFAULT_LATENCY_BUCKETS,
  ): void {
    const labelKey = this.formatLabels(labels);
    const histMap = this.histograms.get(name);
    if (!histMap) return;

    let obs = histMap.get(labelKey);
    if (!obs) {
      obs = {
        buckets: {
          boundaries: buckets,
          counts: new Array(buckets.length + 1).fill(0),
          sum: 0,
          count: 0,
        },
        labels,
      };
      histMap.set(labelKey, obs);
    }

    // 更新桶
    for (let i = 0; i < obs.buckets.boundaries.length; i++) {
      if (value <= obs.buckets.boundaries[i]) {
        obs.buckets.counts[i]++;
        break;
      }
    }
    // +Inf 桶
    if (value > obs.buckets.boundaries[obs.buckets.boundaries.length - 1]) {
      obs.buckets.counts[obs.buckets.counts.length - 1]++;
    }

    obs.buckets.sum += value;
    obs.buckets.count++;
  }
}
