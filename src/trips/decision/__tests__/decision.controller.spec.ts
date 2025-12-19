// src/trips/decision/__tests__/decision.controller.spec.ts

/**
 * Decision Controller 集成测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DecisionController } from '../decision.controller';
import { TripDecisionEngineService } from '../trip-decision-engine.service';
import { ConstraintChecker } from '../constraints/constraint-checker';
import { ExplainabilityService } from '../explainability/explainability.service';
import { LearningService } from '../learning/learning.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import { AdvancedConstraintsService } from '../constraints/advanced-constraints.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { DecisionCacheService } from '../performance/cache.service';
import { BatchProcessingService } from '../performance/batch.service';
import { SenseToolsAdapter } from '../adapters/sense-tools.adapter';

describe('DecisionController', () => {
  let controller: DecisionController;
  let decisionEngine: TripDecisionEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DecisionController],
      providers: [
        {
          provide: TripDecisionEngineService,
          useValue: {
            generatePlan: jest.fn(),
            repairPlan: jest.fn(),
          },
        },
        {
          provide: ConstraintChecker,
          useValue: {
            checkPlan: jest.fn(),
          },
        },
        {
          provide: ExplainabilityService,
          useValue: {
            explainPlan: jest.fn(),
          },
        },
        {
          provide: LearningService,
          useValue: {
            learnFromLogs: jest.fn(),
          },
        },
        {
          provide: EvaluationService,
          useValue: {
            evaluatePlan: jest.fn(),
          },
        },
        {
          provide: AdvancedConstraintsService,
          useValue: {
            checkMutexGroups: jest.fn(),
            checkDependencies: jest.fn(),
          },
        },
        {
          provide: MonitoringService,
          useValue: {
            recordPlanGeneration: jest.fn(),
            recordPlanRepair: jest.fn(),
            getMetrics: jest.fn(),
            getAlerts: jest.fn(),
          },
        },
        {
          provide: DecisionCacheService,
          useValue: {},
        },
        {
          provide: BatchProcessingService,
          useValue: {},
        },
        {
          provide: SenseToolsAdapter,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<DecisionController>(DecisionController);
    decisionEngine = module.get<TripDecisionEngineService>(
      TripDecisionEngineService
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generatePlan', () => {
    it('should generate a plan', async () => {
      const mockState = {
        context: {
          destination: 'IS',
          startDate: '2026-01-02',
          durationDays: 1,
          preferences: {
            intents: { nature: 0.8 },
            pace: 'moderate' as const,
            riskTolerance: 'medium' as const,
          },
        },
        candidatesByDate: {},
        signals: {
          lastUpdatedAt: new Date().toISOString(),
        },
      };

      const mockPlan = {
        version: 'planner-0.1',
        createdAt: new Date().toISOString(),
        days: [],
      };

      const mockLog = {
        runId: 'test-run',
        at: new Date().toISOString(),
        trigger: 'initial_generate' as const,
        plannerVersion: 'planner-0.1',
        strategyMix: ['abu', 'drdre'] as Array<'abu' | 'drdre' | 'neptune'>,
        inputDigest: {
          destination: 'IS',
          startDate: '2026-01-02',
          durationDays: 1,
          signalUpdatedAt: new Date().toISOString(),
        },
        chosenActions: [],
      };

      jest
        .spyOn(decisionEngine, 'generatePlan')
        .mockResolvedValue({ plan: mockPlan, log: mockLog });

      const result = await controller.generatePlan({ state: mockState });

      expect(result.success).toBe(true);
      expect(result.data.plan).toBeDefined();
      expect(result.data.log).toBeDefined();
    });
  });
});

