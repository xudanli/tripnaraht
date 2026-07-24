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

jest.mock('./learning/weight-persistence.service', () => ({
  WeightPersistenceService: jest.fn().mockImplementation(() => ({
    saveLearningResult: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { DecisionOSFacadeService, DecisionRequest, FeedbackRequest } from './decision-os-facade.service';
import { PolicyNetworkService } from './learning/policy-network.service';
import { OnlineLearningLoopService } from './learning/online-learning-loop.service';
import { DSOSnapshotAuditService } from './learning/dso-snapshot-audit.service';
import { DecisionMetricsService } from './metrics/decision-metrics.service';
import { DifferentiableDecisionService } from './differentiable/differentiable-decision.service';
import { DistributedLockService } from '../../../redis/distributed-lock.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';

describe('DecisionOSFacadeService', () => {
  let facade: DecisionOSFacadeService;
  let policyNetwork: PolicyNetworkService;
  let learningLoop: OnlineLearningLoopService;
  let auditService: DSOSnapshotAuditService;
  let metricsService: DecisionMetricsService;
  let differentiable: DifferentiableDecisionService;
  let lockService: DistributedLockService;

  const createMockDSO = (): DecisionState => ({
    userIntent: { days: 5, mode: 'drive' },
    constraints: { feasible: true, violations: [] },
    systemState: { currentPhase: 'PLAN_GEN', confidence: 0.8, version: 1 },
    tripState: {},
    environmentState: {},
  } as DecisionState);

  beforeEach(async () => {
    policyNetwork = new PolicyNetworkService();
    learningLoop = new OnlineLearningLoopService();
    auditService = new DSOSnapshotAuditService();
    metricsService = new DecisionMetricsService();
    differentiable = new DifferentiableDecisionService();
    lockService = new DistributedLockService();

    facade = new DecisionOSFacadeService(
      undefined, // objectiveFunction
      undefined, // expectedUtility
      undefined, // worldModel
      policyNetwork,
      learningLoop,
      undefined, // weightLearner
      differentiable,
      auditService,
      metricsService,
      lockService,
      undefined, // rlhfPersistence
    );

    await facade.onModuleInit();
  });

  describe('makeDecision', () => {
    it('should execute full decision flow', async () => {
      const request: DecisionRequest = {
        requestId: 'test-req-1',
        userId: 'user-1',
        dso: createMockDSO(),
      };

      const response = await facade.makeDecision(request);

      expect(response.requestId).toBe('test-req-1');
      expect(response.recommendedAction).toBeDefined();
      expect(response.actionProbabilities).toBeDefined();
      expect(response.expectedUtility).toBeGreaterThanOrEqual(0);
      expect(response.expectedUtility).toBeLessThanOrEqual(1);
      expect(response.confidence).toBeGreaterThan(0);
      expect(response.latencyMs).toBeGreaterThan(0);
    });

    it('should record DSO snapshot', async () => {
      const request: DecisionRequest = {
        requestId: 'test-req-2',
        userId: 'user-1',
        dso: createMockDSO(),
      };

      await facade.makeDecision(request);

      const snapshot = await auditService.getLatestSnapshot('test-req-2');
      expect(snapshot).not.toBeNull();
      expect(snapshot?.version).toBe(1);
    });

    it('should record decision in learning loop', async () => {
      const request: DecisionRequest = {
        requestId: 'test-req-3',
        userId: 'user-1',
        dso: createMockDSO(),
      };

      await facade.makeDecision(request);

      const state = learningLoop.getState();
      expect(state.totalDecisions).toBe(1);
    });

    it('should use distributed lock when timeout specified', async () => {
      const request: DecisionRequest = {
        requestId: 'test-req-4',
        userId: 'user-1',
        dso: createMockDSO(),
        options: { lockTimeout: 5000 },
      };

      const response = await facade.makeDecision(request);
      expect(response.requestId).toBe('test-req-4');
    });
  });

  describe('processFeedback', () => {
    it('should process feedback and trigger learning', async () => {
      learningLoop.configure({ minFeedbackCount: 2 });

      // Make decisions first
      for (let i = 0; i < 2; i++) {
        await facade.makeDecision({
          requestId: `feedback-test-${i}`,
          userId: 'user-feedback',
          dso: createMockDSO(),
        });
      }

      // Submit feedback
      const feedback1: FeedbackRequest = {
        decisionId: 'feedback-test-0',
        userId: 'user-feedback',
        satisfactionScore: 0.8,
      };

      const result1 = await facade.processFeedback(feedback1);
      expect(result1.processed).toBe(true);

      const feedback2: FeedbackRequest = {
        decisionId: 'feedback-test-1',
        userId: 'user-feedback',
        satisfactionScore: 0.9,
        actualUtility: 0.85,
      };

      const result2 = await facade.processFeedback(feedback2);
      expect(result2.processed).toBe(true);
    });

    it('应在同时提供 predictedUtility 与 actualUtility 时返回 predictionRegret01', async () => {
      learningLoop.configure({ minFeedbackCount: 99 });
      const res = await facade.processFeedback({
        decisionId: 'd-pred',
        userId: 'u1',
        predictedUtility: 0.9,
        actualUtility: 0.55,
      });
      expect(res.processed).toBe(true);
      expect(res.predictionRegret01).toBeCloseTo(0.35, 5);
    });

    it('应在注入 RlhfPersistence 时用 PREDICTION_REGRET 持久化 regret', async () => {
      const rlhfPersistence = { recordFeedback: jest.fn().mockResolvedValue(undefined) };
      learningLoop.configure({ minFeedbackCount: 99 });
      const f = new DecisionOSFacadeService(
        undefined,
        undefined,
        undefined,
        policyNetwork,
        learningLoop,
        undefined,
        differentiable,
        auditService,
        metricsService,
        lockService,
        rlhfPersistence as any,
      );
      await f.processFeedback({
        decisionId: 'd-rlhf-pred',
        userId: 'u-rlhf',
        predictedUtility: 0.8,
        actualUtility: 0.3,
      });
      expect(rlhfPersistence.recordFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-rlhf',
          tripId: 'd-rlhf-pred',
          feedbackType: 'PREDICTION_REGRET',
          feedbackData: expect.objectContaining({
            predictionRegret01: expect.any(Number),
            predictedUtility: 0.8,
            actualUtility: 0.3,
            decisionId: 'd-rlhf-pred',
          }),
        }),
      );
    });

    it('should return processed false when learning loop unavailable', async () => {
      const minimalFacade = new DecisionOSFacadeService();

      const result = await minimalFacade.processFeedback({
        decisionId: 'test',
        userId: 'user',
        satisfactionScore: 0.8,
      });

      expect(result.processed).toBe(false);
    });
  });

  describe('getSystemStatus', () => {
    it('should return system status', () => {
      const status = facade.getSystemStatus();

      expect(status.healthy).toBe(true);
      expect(status.components.policyNetwork).toBe(true);
      expect(status.components.learningLoop).toBe(true);
      expect(status.components.auditService).toBe(true);
      expect(status.components.metricsService).toBe(true);
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should track metrics after decisions', async () => {
      await facade.makeDecision({
        requestId: 'status-test-1',
        userId: 'user',
        dso: createMockDSO(),
      });

      const status = facade.getSystemStatus();
      expect(status.metrics.totalDecisions).toBe(1);
    });
  });

  describe('getStabilityReport', () => {
    it('should return stability report', async () => {
      const requestId = 'stability-test';

      // Make multiple decisions to create snapshots
      for (let i = 0; i < 3; i++) {
        await facade.makeDecision({
          requestId,
          userId: 'user',
          dso: {
            ...createMockDSO(),
            systemState: { currentPhase: 'PLAN_GEN', confidence: 0.5 + i * 0.15, version: i + 1 },
          } as DecisionState,
        });
      }

      const report = await facade.getStabilityReport(requestId);

      expect(report).not.toBeNull();
      expect(report?.requestId).toBe(requestId);
      expect(report?.lyapunovTrace.values.length).toBe(3);
    });

    it('should return null when audit service unavailable', async () => {
      const minimalFacade = new DecisionOSFacadeService();
      const report = await minimalFacade.getStabilityReport('test');
      expect(report).toBeNull();
    });
  });

  describe('getLearningStatistics', () => {
    it('should return learning statistics', async () => {
      await facade.makeDecision({
        requestId: 'stats-test',
        userId: 'user',
        dso: createMockDSO(),
      });

      const stats = facade.getLearningStatistics();

      expect(stats.convergence).toBeDefined();
      expect(stats.totalUpdates).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rollbackDSO', () => {
    it('should rollback to specified version', async () => {
      const requestId = 'rollback-test';

      // Create multiple versions
      for (let i = 0; i < 3; i++) {
        await facade.makeDecision({
          requestId,
          userId: 'user',
          dso: {
            ...createMockDSO(),
            systemState: { currentPhase: 'PLAN_GEN', confidence: 0.5 + i * 0.1, version: i + 1 },
          } as DecisionState,
        });
      }

      const rolledBack = await facade.rollbackDSO(requestId, 1);

      expect(rolledBack).not.toBeNull();
    });
  });

  describe('trainDifferentiableModel', () => {
    it('should train model with samples', async () => {
      const samples = [
        { dso: createMockDSO(), targetUtility: 0.8 },
        { dso: createMockDSO(), targetUtility: 0.7 },
      ];

      const result = await facade.trainDifferentiableModel(samples, { learningRate: 0.01 });

      expect(result.loss).toBeDefined();
    });

    it('should return default when differentiable unavailable', async () => {
      const minimalFacade = new DecisionOSFacadeService();
      const result = await minimalFacade.trainDifferentiableModel([]);
      expect(result.parametersUpdated).toBe(false);
    });
  });

  describe('updatePolicyNetwork', () => {
    it('should update policy with samples', () => {
      const samples = [
        { state: createMockDSO(), action: 'ACCEPT_PLAN' as const, reward: 0.8 },
      ];

      const result = facade.updatePolicyNetwork(samples);

      expect(result.loss).toBeDefined();
      expect(result.gradientNorm).toBeDefined();
    });
  });

  describe('exportMetrics', () => {
    it('should export Prometheus metrics', async () => {
      await facade.makeDecision({
        requestId: 'metrics-test',
        userId: 'user',
        dso: createMockDSO(),
      });

      const metrics = facade.exportMetrics();

      expect(metrics).toContain('decision_os_');
    });
  });

  describe('resetLearningState', () => {
    it('should reset learning state', async () => {
      await facade.makeDecision({
        requestId: 'reset-test',
        userId: 'user',
        dso: createMockDSO(),
      });

      facade.resetLearningState();

      const status = facade.getSystemStatus();
      expect(status.metrics.totalDecisions).toBe(0);
    });
  });

  describe('minimal configuration', () => {
    it('should work with minimal dependencies', async () => {
      const minimalFacade = new DecisionOSFacadeService();

      const request: DecisionRequest = {
        requestId: 'minimal-test',
        userId: 'user',
        dso: createMockDSO(),
      };

      const response = await minimalFacade.makeDecision(request);

      expect(response.requestId).toBe('minimal-test');
      expect(response.recommendedAction).toBe('ACCEPT_PLAN');
    });
  });
});
