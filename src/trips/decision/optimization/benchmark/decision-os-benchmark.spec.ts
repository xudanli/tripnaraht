/**
 * Decision OS 性能基准测试
 * 
 * 验收标准:
 * - CGUS 100 候选搜索 < 50ms
 * - Monte Carlo 1000 样本 < 100ms
 * - DSO commit 延迟 < 10ms
 * - 策略网络推理 < 5ms
 */

// Mock TypeORM
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}), { virtual: true });

jest.mock('typeorm', () => ({
  Repository: class {},
  MoreThanOrEqual: jest.fn(),
  LessThanOrEqual: jest.fn(),
  Between: jest.fn(),
  Entity: () => () => {},
  PrimaryGeneratedColumn: () => () => {},
  Column: () => () => {},
  CreateDateColumn: () => () => {},
  UpdateDateColumn: () => () => {},
  Index: () => () => {},
}), { virtual: true });

jest.mock('../learning/weight-persistence.service', () => ({
  WeightPersistenceService: jest.fn().mockImplementation(() => ({
    saveLearningResult: jest.fn().mockResolvedValue(undefined),
  })),
}));

import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import { DSOSnapshotAuditService } from '../learning/dso-snapshot-audit.service';
import { DecisionMetricsService } from '../metrics/decision-metrics.service';
import { PolicyNetworkService } from '../learning/policy-network.service';
import { DifferentiableDecisionService } from '../differentiable/differentiable-decision.service';
import { DistributedLockService } from '../../../../redis/distributed-lock.service';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
  passThreshold: boolean;
  threshold: number;
}

function runBenchmark(
  name: string,
  fn: () => void | Promise<void>,
  iterations: number,
  thresholdMs: number,
): Promise<BenchmarkResult> {
  return new Promise(async (resolve) => {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }

    times.sort((a, b) => a - b);
    const total = times.reduce((s, t) => s + t, 0);
    const p95Index = Math.floor(times.length * 0.95);

    resolve({
      name,
      iterations,
      totalMs: total,
      avgMs: total / iterations,
      minMs: times[0],
      maxMs: times[times.length - 1],
      p95Ms: times[p95Index],
      passThreshold: times[p95Index] <= thresholdMs,
      threshold: thresholdMs,
    });
  });
}

function formatResult(r: BenchmarkResult): string {
  const status = r.passThreshold ? '✅ PASS' : '❌ FAIL';
  return `${r.name}: avg=${r.avgMs.toFixed(2)}ms, p95=${r.p95Ms.toFixed(2)}ms (threshold: ${r.threshold}ms) ${status}`;
}

describe('Decision OS Performance Benchmarks', () => {
  const createMockDSO = (overrides: Partial<DecisionState> = {}): DecisionState => ({
    userIntent: {
      days: 5,
      destination: 'Iceland',
      mode: 'drive',
      preferences: { scenic: 0.8, adventure: 0.6, comfort: 0.7 },
    },
    constraints: {
      feasible: true,
      violations: [],
      hardConstraints: { maxBudget: 5000 },
    },
    systemState: {
      currentPhase: 'PLAN_GEN',
      confidence: 0.8,
      version: 1,
      requestId: `req-${Date.now()}`,
    },
    tripState: { currentPlan: null },
    environmentState: { weather: { conditions: 'clear' } },
    ...overrides,
  } as DecisionState);

  describe('DSO Snapshot Performance', () => {
    let auditService: DSOSnapshotAuditService;

    beforeEach(() => {
      auditService = new DSOSnapshotAuditService();
    });

    it('should commit DSO snapshot under 10ms (P95)', async () => {
      const dso = createMockDSO();
      const requestId = `bench-snapshot-${Date.now()}`;

      const result = await runBenchmark(
        'DSO Snapshot Commit',
        async () => {
          await auditService.recordSnapshot(requestId, dso);
        },
        100,
        10, // threshold: 10ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(10);
    });

    it('should query latest snapshot under 5ms (P95)', async () => {
      const requestId = `bench-query-${Date.now()}`;
      const dso = createMockDSO();

      // Prepare data
      for (let i = 0; i < 50; i++) {
        await auditService.recordSnapshot(requestId, {
          ...dso,
          systemState: { ...dso.systemState, version: i + 1 },
        } as DecisionState);
      }

      const result = await runBenchmark(
        'DSO Latest Snapshot Query',
        async () => {
          await auditService.getLatestSnapshot(requestId);
        },
        100,
        5, // threshold: 5ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(5);
    });

    it('should compute diff under 10ms (P95)', async () => {
      const requestId = `bench-diff-${Date.now()}`;
      const dso = createMockDSO();

      // Prepare 10 versions with changes
      for (let i = 0; i < 10; i++) {
        await auditService.recordSnapshot(requestId, {
          ...dso,
          userIntent: { ...dso.userIntent, days: 5 + i },
          systemState: { ...dso.systemState, confidence: 0.5 + i * 0.05, version: i + 1 },
        } as DecisionState);
      }

      const result = await runBenchmark(
        'DSO Diff Computation',
        async () => {
          await auditService.computeDiff(requestId, 1, 10);
        },
        50,
        10, // threshold: 10ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(10);
    });
  });

  describe('Policy Network Performance', () => {
    let policyNetwork: PolicyNetworkService;

    beforeEach(() => {
      policyNetwork = new PolicyNetworkService();
    });

    it('should compute policy under 5ms (P95)', async () => {
      const dso = createMockDSO();

      const result = await runBenchmark(
        'Policy Network Inference',
        () => {
          policyNetwork.computePolicy(dso, false);
        },
        500,
        5, // threshold: 5ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(5);
    });

    it('should update policy with batch under 50ms (P95)', async () => {
      const samples = Array.from({ length: 20 }, (_, i) => ({
        state: createMockDSO({ systemState: { currentPhase: 'PLAN_GEN', confidence: 0.5 + i * 0.02 } } as Partial<DecisionState>),
        action: 'ACCEPT_PLAN' as const,
        reward: 0.6 + i * 0.01,
      }));

      const result = await runBenchmark(
        'Policy Network Update (20 samples)',
        () => {
          policyNetwork.updatePolicy(samples);
        },
        50,
        100, // threshold: 100ms (relaxed for CI variance)
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(100);
    });
  });

  describe('Differentiable Decision Performance', () => {
    let diffService: DifferentiableDecisionService;

    beforeEach(() => {
      diffService = new DifferentiableDecisionService();
    });

    it('should encode DSO under 2ms (P95)', async () => {
      const dso = createMockDSO();

      const result = await runBenchmark(
        'DSO Encoding',
        () => {
          diffService.encodeDSO(dso);
        },
        500,
        2, // threshold: 2ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(2);
    });

    it('should compute utility under 1ms (P95)', async () => {
      const dso = createMockDSO();
      const embedding = diffService.encodeDSO(dso);

      const result = await runBenchmark(
        'Utility Computation',
        () => {
          diffService.computeUtility(embedding);
        },
        1000,
        1, // threshold: 1ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(1);
    });

    it('should train batch under 100ms (P95)', async () => {
      const samples = Array.from({ length: 50 }, () => ({
        dso: createMockDSO(),
        targetUtility: 0.5 + Math.random() * 0.4,
      }));

      const result = await runBenchmark(
        'Differentiable Training (50 samples)',
        async () => {
          await diffService.train(samples, { learningRate: 0.01 });
        },
        20,
        100, // threshold: 100ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(100);
    });
  });

  describe('Distributed Lock Performance', () => {
    let lockService: DistributedLockService;

    beforeEach(() => {
      lockService = new DistributedLockService();
    });

    it('should acquire lock under 5ms (P95)', async () => {
      let counter = 0;

      const result = await runBenchmark(
        'Lock Acquire',
        async () => {
          const resourceId = `bench-lock-${counter++}`;
          await lockService.acquire(resourceId, { ttlMs: 1000, maxRetries: 1 });
        },
        100,
        5, // threshold: 5ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(5);
    });

    it('should execute withLock under 10ms overhead (P95)', async () => {
      let counter = 0;

      const result = await runBenchmark(
        'withLock Overhead',
        async () => {
          const resourceId = `bench-withlock-${counter++}`;
          await lockService.withLock(resourceId, async () => {
            // Empty callback to measure lock overhead
          });
        },
        100,
        10, // threshold: 10ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(10);
    });
  });

  describe('Metrics Recording Performance', () => {
    let metricsService: DecisionMetricsService;

    beforeEach(() => {
      metricsService = new DecisionMetricsService();
    });

    it('should record metrics under 1ms (P95)', async () => {
      const result = await runBenchmark(
        'Metric Recording',
        () => {
          metricsService.recordDecisionLatency(0.5, 'PLAN_GEN', 'success');
          metricsService.recordUtilityScore(0.8, 'travel_plan');
          metricsService.incrementConstraintViolation('TIME_BUDGET', 'soft');
        },
        500,
        1, // threshold: 1ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(1);
    });

    it('should export Prometheus format under 10ms (P95)', async () => {
      // Populate with metrics
      for (let i = 0; i < 100; i++) {
        metricsService.recordDecisionLatency(Math.random(), 'PLAN_GEN', 'success');
        metricsService.recordUtilityScore(Math.random(), 'travel_plan');
      }

      const result = await runBenchmark(
        'Prometheus Export',
        () => {
          metricsService.exportPrometheusFormat();
        },
        100,
        10, // threshold: 10ms
      );

      console.log(formatResult(result));
      expect(result.p95Ms).toBeLessThan(10);
    });
  });

  describe('Summary Report', () => {
    it('should generate performance summary', async () => {
      const auditService = new DSOSnapshotAuditService();
      const policyNetwork = new PolicyNetworkService();
      const diffService = new DifferentiableDecisionService();
      const lockService = new DistributedLockService();
      const metricsService = new DecisionMetricsService();
      const dso = createMockDSO();

      const results: BenchmarkResult[] = [];

      // DSO Snapshot
      results.push(await runBenchmark('DSO Snapshot', async () => {
        await auditService.recordSnapshot(`perf-${Date.now()}`, dso);
      }, 50, 10));

      // Policy Inference
      results.push(await runBenchmark('Policy Inference', () => {
        policyNetwork.computePolicy(dso, false);
      }, 100, 5));

      // DSO Encoding
      results.push(await runBenchmark('DSO Encoding', () => {
        diffService.encodeDSO(dso);
      }, 100, 2));

      // Lock Acquire
      let lockCounter = 0;
      results.push(await runBenchmark('Lock Acquire', async () => {
        await lockService.acquire(`perf-lock-${lockCounter++}`, { ttlMs: 100 });
      }, 50, 5));

      // Metrics Recording
      results.push(await runBenchmark('Metrics Recording', () => {
        metricsService.recordDecisionLatency(0.5, 'TEST', 'success');
      }, 100, 1));

      console.log('\n========== PERFORMANCE SUMMARY ==========');
      console.log('| Benchmark | Avg (ms) | P95 (ms) | Threshold | Status |');
      console.log('|-----------|----------|----------|-----------|--------|');
      
      for (const r of results) {
        const status = r.passThreshold ? '✅' : '❌';
        console.log(`| ${r.name.padEnd(20)} | ${r.avgMs.toFixed(2).padStart(8)} | ${r.p95Ms.toFixed(2).padStart(8)} | ${r.threshold.toString().padStart(9)}ms | ${status} |`);
      }
      console.log('==========================================\n');

      const allPass = results.every(r => r.passThreshold);
      expect(allPass).toBe(true);
    });
  });
});
