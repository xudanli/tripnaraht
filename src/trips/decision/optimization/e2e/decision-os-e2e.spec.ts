/**
 * Decision OS E2E 测试
 * 
 * 测试完整的决策流程，包括：
 * - 决策请求
 * - 反馈提交
 * - 快照查询
 * - 稳定性分析
 * - 健康检查
 */

// Mock TypeORM dependencies before imports
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  TypeOrmModule: { forFeature: () => ({ module: class {} }) },
}), { virtual: true });

jest.mock('typeorm', () => ({
  Repository: class {},
  Entity: () => () => {},
  PrimaryGeneratedColumn: () => () => {},
  Column: () => () => {},
  CreateDateColumn: () => () => {},
  UpdateDateColumn: () => () => {},
  Index: () => () => {},
  ManyToOne: () => () => {},
  JoinColumn: () => () => {},
  MoreThanOrEqual: () => {},
  LessThanOrEqual: () => {},
  Between: () => {},
}), { virtual: true });

jest.mock('../learning/weight-persistence.service', () => ({
  WeightPersistenceService: class {
    async saveWeights() { return {}; }
    async loadWeights() { return null; }
    async recordLearningHistory() { return {}; }
  },
}));

import { DecisionOSFacadeService, DecisionRequest, FeedbackRequest } from '../decision-os-facade.service';
import { PolicyNetworkService } from '../learning/policy-network.service';
import { OnlineLearningLoopService } from '../learning/online-learning-loop.service';
import { DSOSnapshotAuditService } from '../learning/dso-snapshot-audit.service';
import { DecisionMetricsService } from '../metrics/decision-metrics.service';
import { DifferentiableDecisionService } from '../differentiable/differentiable-decision.service';
import { FeatureFlagService } from '../features/feature-flags.service';
import { AuditLogService } from '../interceptors/decision-interceptor.service';
import { DecisionTracingService } from '../tracing/decision-tracing.service';
import { RateLimiterService, DecisionOSRateLimits } from '../middleware/rate-limiter.middleware';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { DecisionCacheService } from '../cache/decision-cache.service';
import { DecisionEventBus, DecisionEventType } from '../events/decision-events';

// Mock DecisionState
const createMockDSO = (overrides?: Partial<any>) => ({
  requestId: `req-${Date.now()}`,
  version: 1,
  phase: 'PLAN_GEN',
  lastUpdated: new Date().toISOString(),
  userPreferences: {
    travelStyle: 'relaxed',
    budgetLevel: 'medium',
    interests: ['culture', 'food'],
  },
  tripContext: {
    destination: 'Tokyo',
    duration: 5,
    travelers: 2,
  },
  constraints: {
    hardConstraints: [],
    softConstraints: [],
    violations: [],
  },
  candidates: [
    { id: 'plan-a', score: 0.8, feasible: true },
    { id: 'plan-b', score: 0.7, feasible: true },
  ],
  selectedPlan: null,
  confidence: 0.75,
  ...overrides,
});

describe('Decision OS E2E Tests', () => {
  let facade: DecisionOSFacadeService;
  let policyNetwork: PolicyNetworkService;
  let learningLoop: OnlineLearningLoopService;
  let snapshotAudit: DSOSnapshotAuditService;
  let metricsService: DecisionMetricsService;
  let diffService: DifferentiableDecisionService;
  let featureFlags: FeatureFlagService;
  let auditService: AuditLogService;
  let tracingService: DecisionTracingService;
  let rateLimiter: RateLimiterService;
  let circuitBreaker: CircuitBreakerService;
  let cacheService: DecisionCacheService;
  let eventBus: DecisionEventBus;

  beforeAll(async () => {
    policyNetwork = new PolicyNetworkService();
    learningLoop = new OnlineLearningLoopService();
    snapshotAudit = new DSOSnapshotAuditService();
    metricsService = new DecisionMetricsService();
    diffService = new DifferentiableDecisionService();
    featureFlags = new FeatureFlagService();
    auditService = new AuditLogService();
    tracingService = new DecisionTracingService({ serviceName: 'decision-os-e2e' });
    rateLimiter = new RateLimiterService();
    circuitBreaker = new CircuitBreakerService();
    cacheService = new DecisionCacheService();
    eventBus = new DecisionEventBus();

    facade = new DecisionOSFacadeService(
      undefined,
      undefined,
      undefined,
      policyNetwork,
      learningLoop,
      undefined,
      diffService,
      snapshotAudit,
      metricsService,
      undefined,
      undefined,
    );

    await facade.onModuleInit();
  });

  afterAll(async () => {
    eventBus.onModuleDestroy();
  });

  describe('Complete Decision Flow', () => {
    let decisionRequestId: string;
    let userId: string;

    beforeEach(() => {
      decisionRequestId = `e2e-req-${Date.now()}`;
      userId = `e2e-user-${Date.now()}`;
    });

    it('should complete full decision lifecycle', async () => {
      // Step 1: Make decision
      const dso = createMockDSO({ requestId: decisionRequestId });
      const request: DecisionRequest = {
        requestId: decisionRequestId,
        userId,
        dso: dso as any,
        options: { useMonteCarlo: false },
      };

      const decision = await facade.makeDecision(request);

      expect(decision).toBeDefined();
      expect(decision.requestId).toBe(decisionRequestId);
      expect(decision.recommendedAction).toBeDefined();
      expect(decision.expectedUtility).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.latencyMs).toBeGreaterThanOrEqual(0);

      // Step 2: Submit feedback
      const feedbackRequest: FeedbackRequest = {
        decisionId: decisionRequestId,
        userId,
        satisfactionScore: 0.8,
        actualUtility: 0.75,
        explicitFeedback: { type: 'LIKE' },
        behavioralSignals: {
          completed: true,
          modificationCount: 1,
          dwellTimeSeconds: 120,
        },
      };

      const feedbackResult = await facade.processFeedback(feedbackRequest);

      expect(feedbackResult.processed).toBe(true);

      // Step 3: Check system status
      const status = await facade.getSystemStatus();

      expect(status.healthy).toBe(true);
    });

    it('should handle multiple sequential decisions', async () => {
      const decisions = [];

      for (let i = 0; i < 5; i++) {
        const dso = createMockDSO({ requestId: `${decisionRequestId}-${i}` });
        const request: DecisionRequest = {
          requestId: `${decisionRequestId}-${i}`,
          userId,
          dso: dso as any,
        };

        const decision = await facade.makeDecision(request);
        decisions.push(decision);
      }

      expect(decisions).toHaveLength(5);
      decisions.forEach((d, i) => {
        expect(d.requestId).toBe(`${decisionRequestId}-${i}`);
      });
    });

    it('should track metrics across decisions', async () => {
      expect(metricsService.getSummary()).toBeDefined();

      for (let i = 0; i < 3; i++) {
        const dso = createMockDSO({ requestId: `metrics-${decisionRequestId}-${i}` });
        await facade.makeDecision({
          requestId: `metrics-${decisionRequestId}-${i}`,
          userId,
          dso: dso as any,
        });
      }

      const finalSummary = metricsService.getSummary();

      expect(finalSummary).toBeDefined();
    });
  });

  describe('Feature Flags Integration', () => {
    it('should respect feature flag for Monte Carlo', () => {
      const mcEnabled = featureFlags.isEnabled('decision.monte_carlo_sampling');
      expect(mcEnabled).toBe(true);
    });

    it('should evaluate percentage rollout consistently', () => {
      const userId = 'consistent-user-123';
      const results = [];

      for (let i = 0; i < 10; i++) {
        const result = featureFlags.evaluate('decision.policy_learning', { userId });
        results.push(result.enabled);
      }

      expect(new Set(results).size).toBe(1);
    });

    it('should assign AB test variant consistently', () => {
      const userId = 'ab-test-user-456';
      const result1 = featureFlags.evaluate('decision.optimization_algorithm', { userId });
      const result2 = featureFlags.evaluate('decision.optimization_algorithm', { userId });

      expect(result1.variant).toBe(result2.variant);
      expect(['cgus', 'legacy']).toContain(result1.variant);
    });
  });

  describe('Audit and Tracing', () => {
    it('should log audit entries', () => {
      auditService.log({
        requestId: 'audit-test-001',
        userId: 'audit-user',
        action: 'MAKE_DECISION',
        resource: 'decision',
        method: 'POST',
        path: '/api/v2/decision',
        statusCode: 200,
        durationMs: 50,
      });

      const logs = auditService.query({ action: 'MAKE_DECISION' });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should create and complete traces', async () => {
      const result = await tracingService.withSpan('e2e-test-operation', async (span) => {
        span.setAttribute('test.key', 'test-value');
        span.addEvent('test-event');
        return 'completed';
      });

      expect(result).toBe('completed');

      const exported = tracingService.getExportedSpans();
      expect(exported.length).toBeGreaterThan(0);
      expect(exported.some(s => s.name === 'e2e-test-operation')).toBe(true);
    });

    it('should propagate trace context', () => {
      const span = tracingService.startSpan('parent-span');
      const headers = tracingService.injectContext();

      expect(headers['traceparent']).toBeDefined();
      expect(headers['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

      span.end();
    });
  });

  describe('Rate Limiting', () => {
    it('should track request counts', async () => {
      const key = 'e2e-rate-limit-user';

      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(key, DecisionOSRateLimits.decision);
      }

      const info = await rateLimiter.checkLimit(key, DecisionOSRateLimits.decision);
      expect(info.remaining).toBe(DecisionOSRateLimits.decision.maxRequests - 6);
    });

    it('should enforce limits', async () => {
      const key = 'e2e-strict-limit-user';
      const config = { windowMs: 60000, maxRequests: 3 };

      await rateLimiter.checkLimit(key, config);
      await rateLimiter.checkLimit(key, config);
      await rateLimiter.checkLimit(key, config);

      const info = await rateLimiter.checkLimit(key, config);
      expect(info.retryAfter).toBeDefined();
    });
  });

  describe('Circuit Breaker', () => {
    it('should create and manage circuit breakers', () => {
      const breaker = circuitBreaker.getOrCreate('e2e-test-circuit', {
        config: { failureThreshold: 3, resetTimeoutMs: 5000 },
      });

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should open circuit after failures', async () => {
      const breaker = circuitBreaker.getOrCreate('e2e-failure-circuit', {
        config: { failureThreshold: 2, resetTimeoutMs: 5000 },
      });

      try {
        await breaker.execute(() => Promise.reject(new Error('fail 1')));
      } catch {}

      try {
        await breaker.execute(() => Promise.reject(new Error('fail 2')));
      } catch {}

      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('Caching', () => {
    it('should cache and retrieve values', async () => {
      const key = 'e2e-cache-key';
      const value = { data: 'test-value' };

      await cacheService.set(key, value, { ttlMs: 60000 });
      const retrieved = await cacheService.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should use getOrSet correctly', async () => {
      const key = 'e2e-get-or-set-key';
      let computeCount = 0;

      const compute = async () => {
        computeCount++;
        return { computed: true };
      };

      await cacheService.getOrSet(key, compute);
      await cacheService.getOrSet(key, compute);
      await cacheService.getOrSet(key, compute);

      expect(computeCount).toBe(1);
    });

    it('should report cache statistics', () => {
      const stats = cacheService.getStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('size');
    });
  });

  describe('Event Bus', () => {
    it('should emit and receive events', (done) => {
      eventBus.on(DecisionEventType.DECISION_COMPLETED, (event) => {
        expect(event.type).toBe(DecisionEventType.DECISION_COMPLETED);
        expect(event.data.requestId).toBe('event-test-001');
        done();
      });

      eventBus.emit({
        type: DecisionEventType.DECISION_COMPLETED,
        timestamp: new Date().toISOString(),
        data: {
          requestId: 'event-test-001',
          action: 'ACCEPT_PLAN',
          utility: 0.85,
        },
      });
    });

    it('should maintain event history when enabled', () => {
      const testEventBus = new DecisionEventBus();
      testEventBus.enableHistoryRecording(true);
      
      testEventBus.emit({
        type: DecisionEventType.LEARNING_TRIGGERED,
        timestamp: new Date().toISOString(),
        data: { reason: 'feedback' },
      });

      const history = testEventBus.getEventHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      
      testEventBus.onModuleDestroy();
    });
  });

  describe('Policy Network', () => {
    it('should compute policy from DSO', () => {
      const dso = createMockDSO();
      const output = policyNetwork.computePolicy(dso as any);

      expect(output.selectedAction).toBeDefined();
      expect(output.actionProbabilities.size).toBeGreaterThan(0);
      expect(output.entropy).toBeGreaterThanOrEqual(0);
    });

    it('should update policy with samples', () => {
      const dso = createMockDSO();
      const samples = [
        { state: dso as any, action: 'ACCEPT_PLAN' as const, reward: 0.9 },
        { state: dso as any, action: 'MODIFY_PLAN' as const, reward: 0.7 },
      ];

      const result = policyNetwork.updatePolicy(samples);

      expect(result.loss).toBeDefined();
      expect(result.gradientNorm).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Differentiable Decision', () => {
    it('should encode DSO to embedding', () => {
      const dso = createMockDSO();
      const embedding = diffService.encodeDSO(dso as any);

      expect(embedding).toBeDefined();
      expect(embedding.z).toBeInstanceOf(Array);
      expect(embedding.z.length).toBeGreaterThan(0);
    });

    it('should compute gradients from embedding', () => {
      const dso = createMockDSO();
      const embedding = diffService.encodeDSO(dso as any);
      const gradients = diffService.computeGradient(embedding.z);

      expect(gradients).toBeDefined();
      expect(gradients.length).toBe(embedding.z.length);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid DSO gracefully', async () => {
      const invalidRequest: DecisionRequest = {
        requestId: 'invalid-request',
        userId: 'user',
        dso: {} as any,
      };

      await expect(facade.makeDecision(invalidRequest)).resolves.toBeDefined();
    });

    it('should handle missing optional services', async () => {
      const minimalFacade = new DecisionOSFacadeService(
        undefined, undefined, undefined,
        new PolicyNetworkService(),
        new OnlineLearningLoopService(),
        undefined,
        new DifferentiableDecisionService(),
        new DSOSnapshotAuditService(),
        new DecisionMetricsService(),
        undefined,
        undefined,
      );

      await minimalFacade.onModuleInit();

      const status = await minimalFacade.getSystemStatus();
      expect(status).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete decision under 100ms', async () => {
      const dso = createMockDSO();
      const request: DecisionRequest = {
        requestId: 'perf-test',
        userId: 'perf-user',
        dso: dso as any,
      };

      const start = Date.now();
      await facade.makeDecision(request);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should handle concurrent decisions', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const dso = createMockDSO({ requestId: `concurrent-${i}` });
        promises.push(
          facade.makeDecision({
            requestId: `concurrent-${i}`,
            userId: `user-${i}`,
            dso: dso as any,
          }),
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((r, i) => {
        expect(r.requestId).toBe(`concurrent-${i}`);
      });
    });
  });
});
