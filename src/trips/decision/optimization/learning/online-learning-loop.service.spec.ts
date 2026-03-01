// Mock TypeORM dependencies before imports
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

// Mock the persistence service to avoid entity loading
jest.mock('./weight-persistence.service', () => ({
  WeightPersistenceService: jest.fn().mockImplementation(() => ({
    saveLearningResult: jest.fn(),
    loadUserWeights: jest.fn(),
  })),
}));

import { OnlineLearningLoopService, DecisionOutcome, OnlineLearningConfig } from './online-learning-loop.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

interface MockWeightLearner {
  learnFromFeedback: jest.Mock;
}

interface MockPersistence {
  saveLearningResult: jest.Mock;
}

interface MockRegretTracker {
  recordUtility: jest.Mock;
  getCumulativeRegret: jest.Mock;
  getTheoreticalBound: jest.Mock;
}

interface MockDifferentiable {
  train: jest.Mock;
}

describe('OnlineLearningLoopService', () => {
  let service: OnlineLearningLoopService;
  let mockWeightLearner: MockWeightLearner;
  let mockPersistence: MockPersistence;
  let mockRegretTracker: MockRegretTracker;
  let mockDifferentiable: MockDifferentiable;

  const createMockDSO = (): DecisionState => ({
    userIntent: { days: 5, mode: 'drive' },
    constraints: { feasible: true, violations: [] },
    systemState: { currentPhase: 'PLAN_GEN', confidence: 0.8 },
    tripState: {},
    environmentState: {},
  } as DecisionState);

  const createOutcome = (userId: string, overrides: Partial<DecisionOutcome> = {}): DecisionOutcome => ({
    decisionId: `dec-${Date.now()}`,
    userId,
    satisfactionScore: 0.8,
    actualUtility: 0.75,
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    mockWeightLearner = {
      learnFromFeedback: jest.fn().mockResolvedValue({
        newWeights: { timeBudget: 0.3, travelEfficiency: 0.25, variety: 0.2, cost: 0.15, comfort: 0.1 },
        confidence: 0.7,
        method: 'GRADIENT_DESCENT',
      }),
    };

    mockPersistence = {
      saveLearningResult: jest.fn().mockResolvedValue(undefined),
    };

    mockRegretTracker = {
      recordUtility: jest.fn(),
      getCumulativeRegret: jest.fn().mockReturnValue(0.5),
      getTheoreticalBound: jest.fn().mockReturnValue(2.0),
    };

    mockDifferentiable = {
      train: jest.fn().mockResolvedValue({ loss: 0.1, parametersUpdated: true }),
    };

    service = new OnlineLearningLoopService(
      mockWeightLearner as any,
      mockPersistence as any,
      mockRegretTracker as any,
      mockDifferentiable as any,
    );
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      const state = service.getState();
      expect(state.totalDecisions).toBe(0);
      expect(state.totalFeedback).toBe(0);
      expect(state.totalUpdates).toBe(0);
      expect(state.convergenceStatus).toBe('NOT_STARTED');
    });

    it('should work without dependencies', () => {
      const minimalService = new OnlineLearningLoopService();
      expect(minimalService.getState()).toBeDefined();
    });
  });

  describe('configure', () => {
    it('should update configuration', () => {
      const newConfig: Partial<OnlineLearningConfig> = {
        learningRate: 0.05,
        minFeedbackCount: 10,
      };

      service.configure(newConfig);

      const state = service.getState();
      expect(state).toBeDefined();
    });

    it('should disable learning when enabled is false', async () => {
      service.configure({ enabled: false });

      const result = await service.processDecisionOutcome(createOutcome('user-1'));

      expect(result.learningTriggered).toBe(false);
      expect(result.weightsUpdated).toBe(false);
    });
  });

  describe('recordDecision', () => {
    it('should increment total decisions', () => {
      service.recordDecision('dec-1', 'user-1', createMockDSO(), 0.8);
      service.recordDecision('dec-2', 'user-1', createMockDSO(), 0.7);

      const state = service.getState();
      expect(state.totalDecisions).toBe(2);
    });

    it('should record utility in regret tracker', () => {
      service.recordDecision('dec-1', 'user-1', createMockDSO(), 0.85);

      expect(mockRegretTracker.recordUtility).toHaveBeenCalledWith(1, 0.85);
    });
  });

  describe('processDecisionOutcome', () => {
    it('should accumulate feedback in buffer', async () => {
      const outcomes = [
        createOutcome('user-1', { satisfactionScore: 0.8 }),
        createOutcome('user-1', { satisfactionScore: 0.9 }),
        createOutcome('user-1', { satisfactionScore: 0.7 }),
      ];

      for (const o of outcomes) {
        await service.processDecisionOutcome(o);
      }

      const state = service.getState();
      expect(state.totalFeedback).toBe(3);
    });

    it('should not trigger learning below threshold', async () => {
      service.configure({ minFeedbackCount: 5 });

      const result = await service.processDecisionOutcome(createOutcome('user-1'));

      expect(result.learningTriggered).toBe(false);
    });

    it('should trigger learning when threshold reached', async () => {
      service.configure({ minFeedbackCount: 3 });

      for (let i = 0; i < 3; i++) {
        await service.processDecisionOutcome(createOutcome('user-1', { 
          satisfactionScore: 0.5 + i * 0.1 
        }));
      }

      const state = service.getState();
      expect(state.totalUpdates).toBeGreaterThanOrEqual(1);
    });

    it('should record regret when actualUtility provided', async () => {
      await service.processDecisionOutcome(createOutcome('user-1', { actualUtility: 0.75 }));

      expect(mockRegretTracker.recordUtility).toHaveBeenCalled();
    });

    it('should handle multiple users independently', async () => {
      service.configure({ minFeedbackCount: 2 });

      await service.processDecisionOutcome(createOutcome('user-1'));
      await service.processDecisionOutcome(createOutcome('user-2'));
      await service.processDecisionOutcome(createOutcome('user-1'));

      const state = service.getState();
      expect(state.totalFeedback).toBe(3);
    });

    it('should clear buffer after successful learning', async () => {
      service.configure({ minFeedbackCount: 2 });

      await service.processDecisionOutcome(createOutcome('user-1'));
      const result = await service.processDecisionOutcome(createOutcome('user-1'));

      expect(result.learningTriggered).toBe(true);
      expect(result.weightsUpdated).toBe(true);

      const nextResult = await service.processDecisionOutcome(createOutcome('user-1'));
      expect(nextResult.learningTriggered).toBe(false);
    });

    it('should persist weights when autoPersist enabled', async () => {
      service.configure({ minFeedbackCount: 2, autoPersist: true });

      await service.processDecisionOutcome(createOutcome('user-1'));
      await service.processDecisionOutcome(createOutcome('user-1'));

      expect(mockPersistence.saveLearningResult).toHaveBeenCalled();
    });
  });

  describe('trainDifferentiableModel', () => {
    it('should train differentiable model with samples', async () => {
      const samples = [
        { dso: createMockDSO(), targetUtility: 0.8 },
        { dso: createMockDSO(), targetUtility: 0.7 },
      ];

      const result = await service.trainDifferentiableModel(samples);

      expect(result.loss).toBeDefined();
      expect(mockDifferentiable.train).toHaveBeenCalled();
    });

    it('should return default when no differentiable service', async () => {
      const minimalService = new OnlineLearningLoopService();
      const result = await minimalService.trainDifferentiableModel([]);

      expect(result.loss).toBe(0);
      expect(result.parametersUpdated).toBe(false);
    });
  });

  describe('getRegretStatistics', () => {
    it('should return regret statistics', () => {
      service.recordDecision('dec-1', 'user-1', createMockDSO(), 0.8);
      service.recordDecision('dec-2', 'user-1', createMockDSO(), 0.7);

      const stats = service.getRegretStatistics();

      expect(stats).not.toBeNull();
      expect(stats?.cumulativeRegret).toBe(0.5);
      expect(stats?.theoreticalBound).toBe(2.0);
      expect(stats?.totalRounds).toBe(2);
    });

    it('should return null when no regret tracker', () => {
      const minimalService = new OnlineLearningLoopService();
      expect(minimalService.getRegretStatistics()).toBeNull();
    });
  });

  describe('getEventLog', () => {
    it('should return empty array initially', () => {
      const log = service.getEventLog();
      expect(log).toEqual([]);
    });

    it('should support limit parameter', () => {
      const log = service.getEventLog(5);
      expect(Array.isArray(log)).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset state to initial values', async () => {
      service.configure({ minFeedbackCount: 1 });
      await service.processDecisionOutcome(createOutcome('user-1'));
      service.recordDecision('dec-1', 'user-1', createMockDSO(), 0.8);

      service.reset();

      const state = service.getState();
      expect(state.totalDecisions).toBe(0);
      expect(state.totalFeedback).toBe(0);
      expect(state.totalUpdates).toBe(0);
      expect(state.convergenceStatus).toBe('NOT_STARTED');
    });

    it('should clear feedback buffer', async () => {
      await service.processDecisionOutcome(createOutcome('user-1'));
      await service.processDecisionOutcome(createOutcome('user-1'));

      service.reset();
      service.configure({ minFeedbackCount: 2 });

      const result = await service.processDecisionOutcome(createOutcome('user-1'));
      expect(result.learningTriggered).toBe(false);
    });

    it('should clear event log', () => {
      service.reset();
      expect(service.getEventLog()).toEqual([]);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete learning cycle', async () => {
      service.configure({ minFeedbackCount: 3, autoPersist: true });

      service.recordDecision('dec-1', 'user-1', createMockDSO(), 0.6);
      service.recordDecision('dec-2', 'user-1', createMockDSO(), 0.7);
      service.recordDecision('dec-3', 'user-1', createMockDSO(), 0.8);

      await service.processDecisionOutcome(createOutcome('user-1', { actualUtility: 0.65 }));
      await service.processDecisionOutcome(createOutcome('user-1', { actualUtility: 0.75 }));
      const result = await service.processDecisionOutcome(createOutcome('user-1', { actualUtility: 0.85 }));

      expect(result.learningTriggered).toBe(true);
      expect(result.weightsUpdated).toBe(true);
      expect(result.regretRecorded).toBe(true);

      const state = service.getState();
      expect(state.totalDecisions).toBe(3);
      expect(state.totalFeedback).toBe(3);
      expect(state.totalUpdates).toBeGreaterThanOrEqual(1);
    });

    it('should handle learning failure gracefully', async () => {
      mockWeightLearner.learnFromFeedback = jest.fn().mockRejectedValue(new Error('Learning failed'));
      service.configure({ minFeedbackCount: 2 });

      await service.processDecisionOutcome(createOutcome('user-1'));
      const result = await service.processDecisionOutcome(createOutcome('user-1'));

      expect(result.learningTriggered).toBe(true);
      expect(result.weightsUpdated).toBe(false);
    });

    it('should handle outcomes without satisfaction score', async () => {
      service.configure({ minFeedbackCount: 2 });

      await service.processDecisionOutcome(createOutcome('user-1', { 
        satisfactionScore: undefined,
        actualUtility: undefined,
      }));
      
      const result = await service.processDecisionOutcome(createOutcome('user-1', {
        satisfactionScore: undefined,
        actualUtility: undefined,
      }));

      expect(result.learningTriggered).toBe(true);
      expect(result.weightsUpdated).toBe(false);
    });
  });
});
