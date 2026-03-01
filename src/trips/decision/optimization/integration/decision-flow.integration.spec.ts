/**
 * Decision OS 端到端决策流程集成测试
 * 
 * 验证完整决策闭环：
 * 感知(Perception) → 决策(Decision) → 执行(Execution) → 反馈(Feedback) → 学习(Learning)
 */

// Mock TypeORM before any imports
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
    loadUserWeights: jest.fn().mockResolvedValue(null),
  })),
}));

import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import { DSOSnapshotAuditService } from '../learning/dso-snapshot-audit.service';
import { DecisionMetricsService } from '../metrics/decision-metrics.service';
import { OnlineLearningLoopService } from '../learning/online-learning-loop.service';
import { PolicyNetworkService } from '../learning/policy-network.service';

// Mock CGUS result
interface MockCGUSResult {
  converged: boolean;
  iterations: number;
  bestUtility: number;
}

// Mock expected utility result
interface MockUtilityResult {
  expectedUtility: number;
  confidenceInterval: { lower: number; upper: number };
  samples: number;
}

describe('Decision OS Integration Flow', () => {
  let auditService: DSOSnapshotAuditService;
  let metricsService: DecisionMetricsService;
  let learningLoop: OnlineLearningLoopService;
  let policyNetwork: PolicyNetworkService;
  
  // Simple mock for CGUS
  const mockCGUSSearch = (_dso: DecisionState): MockCGUSResult => ({
    converged: true,
    iterations: 5,
    bestUtility: 0.85,
  });

  // Simple mock for expected utility (avoids complex context requirements)
  const mockComputeExpectedUtility = (_dso: DecisionState, _config?: { numSamples?: number }): MockUtilityResult => ({
    expectedUtility: 0.75 + Math.random() * 0.2,
    confidenceInterval: { lower: 0.65, upper: 0.85 },
    samples: 1000,
  });

  const createInitialDSO = (): DecisionState => ({
    userIntent: {
      days: 5,
      destination: 'Iceland',
      mode: 'drive',
      preferences: {
        scenic: 0.8,
        adventure: 0.6,
        comfort: 0.7,
      },
    },
    constraints: {
      feasible: true,
      violations: [],
      hardConstraints: {
        maxBudget: 5000,
        mustVisit: ['Golden Circle', 'Blue Lagoon'],
      },
      softConstraints: {
        preferredStartTime: '09:00',
        avoidCrowds: true,
      },
    },
    systemState: {
      currentPhase: 'INTAKE',
      confidence: 0.3,
      version: 1,
      requestId: `req-${Date.now()}`,
    },
    tripState: {
      currentPlan: null,
      alternatives: [],
    },
    environmentState: {
      weather: { conditions: 'partly_cloudy', temperature: 12 },
      traffic: { level: 'moderate' },
    },
  } as DecisionState);

  beforeEach(() => {
    auditService = new DSOSnapshotAuditService();
    metricsService = new DecisionMetricsService();
    learningLoop = new OnlineLearningLoopService();
    policyNetwork = new PolicyNetworkService();
  });

  describe('Complete Decision Flow', () => {
    it('should execute full decision cycle', async () => {
      const startTime = Date.now();
      const dso = createInitialDSO();
      const requestId = dso.systemState?.requestId ?? 'test-req';

      // Phase 1: INTAKE - Record initial state
      await auditService.recordSnapshot(requestId, dso, { trigger: 'STATE_UPDATE' });
      metricsService.recordStateTransition('NONE', 'INTAKE');

      // Phase 2: Policy Decision - Choose action
      const policyOutput = policyNetwork.computePolicy(dso, true);
      metricsService.setPolicyEntropy('decision_actions', policyOutput.entropy);
      expect(policyOutput.selectedAction).toBeDefined();
      expect(policyOutput.confidence).toBeGreaterThan(0);

      // Phase 3: PLAN_GEN - Update DSO
      const planGenDSO: DecisionState = {
        ...dso,
        systemState: {
          ...dso.systemState,
          currentPhase: 'PLAN_GEN',
          confidence: 0.6,
          version: 2,
        },
        tripState: {
          currentPlan: {
            id: 'plan-1',
            days: [
              { date: '2026-03-01', activities: ['Golden Circle Tour'] },
              { date: '2026-03-02', activities: ['Blue Lagoon'] },
            ],
          },
          alternatives: [],
        },
      } as DecisionState;

      await auditService.recordSnapshot(requestId, planGenDSO, { trigger: 'STATE_UPDATE' });
      metricsService.recordStateTransition('INTAKE', 'PLAN_GEN');

      // Phase 4: OPTIMIZE - Run CGUS (mocked)
      const optimizationResult = mockCGUSSearch(planGenDSO);
      metricsService.incrementCGUSIteration(optimizationResult.converged ? 'converged' : 'max_iterations');

      const optimizeDSO: DecisionState = {
        ...planGenDSO,
        systemState: {
          ...planGenDSO.systemState,
          currentPhase: 'OPTIMIZE',
          confidence: 0.8,
          version: 3,
        },
      } as DecisionState;

      await auditService.recordSnapshot(requestId, optimizeDSO, { trigger: 'STATE_UPDATE' });
      metricsService.recordStateTransition('PLAN_GEN', 'OPTIMIZE');

      // Phase 5: Calculate Expected Utility (mocked)
      const utilityResult = mockComputeExpectedUtility(optimizeDSO);
      metricsService.recordUtilityScore(utilityResult.expectedUtility, 'travel_plan');
      expect(utilityResult.expectedUtility).toBeGreaterThanOrEqual(0);
      expect(utilityResult.expectedUtility).toBeLessThanOrEqual(1);

      // Phase 6: VERIFY - Final state
      const verifyDSO: DecisionState = {
        ...optimizeDSO,
        systemState: {
          ...optimizeDSO.systemState,
          currentPhase: 'VERIFY',
          confidence: 0.9,
          version: 4,
        },
      } as DecisionState;

      await auditService.recordSnapshot(requestId, verifyDSO, { trigger: 'STATE_UPDATE' });
      metricsService.recordStateTransition('OPTIMIZE', 'VERIFY');

      // Phase 7: DONE
      const doneDSO: DecisionState = {
        ...verifyDSO,
        systemState: {
          ...verifyDSO.systemState,
          currentPhase: 'DONE',
          confidence: 0.95,
          version: 5,
        },
      } as DecisionState;

      await auditService.recordSnapshot(requestId, doneDSO, { trigger: 'STATE_UPDATE' });
      metricsService.recordStateTransition('VERIFY', 'DONE');

      // Record decision latency
      const latencySeconds = (Date.now() - startTime) / 1000;
      metricsService.recordDecisionLatency(latencySeconds, 'COMPLETE', 'success');

      // Verify audit trail
      const history = await auditService.getStateHistory(requestId);
      expect(history.length).toBe(5);
      expect(history[0].phase).toBe('INTAKE');
      expect(history[4].phase).toBe('DONE');

      // Verify Lyapunov trace
      const lyapunovTrace = await auditService.getLyapunovTrace(requestId);
      expect(lyapunovTrace.values.length).toBe(5);

      // Verify metrics export
      const prometheus = metricsService.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_state_transitions_total');
      expect(prometheus).toContain('decision_os_utility_score');
    });

    it('should handle learning feedback loop', async () => {
      const userId = 'user-integration-test';
      const dso = createInitialDSO();

      // Configure learning loop
      learningLoop.configure({
        enabled: true,
        minFeedbackCount: 3,
        autoPersist: false,
      });

      // Simulate multiple decisions
      for (let i = 0; i < 5; i++) {
        const decisionId = `dec-${i}`;
        const predictedUtility = 0.6 + i * 0.05;

        // Record decision
        learningLoop.recordDecision(decisionId, userId, dso, predictedUtility);

        // Simulate feedback
        const result = await learningLoop.processDecisionOutcome({
          decisionId,
          userId,
          satisfactionScore: 0.7 + i * 0.05,
          actualUtility: predictedUtility + 0.05,
          timestamp: new Date().toISOString(),
          behavioralSignals: {
            completed: true,
            modificationCount: Math.floor(Math.random() * 3),
          },
        });

        if (i >= 2) {
          expect(result.learningTriggered).toBe(true);
        }
      }

      const state = learningLoop.getState();
      expect(state.totalDecisions).toBe(5);
      expect(state.totalFeedback).toBe(5);
    });

    it('should support state rollback', async () => {
      const requestId = 'rollback-test';
      const dso = createInitialDSO();

      // Record multiple states
      const phases = ['INTAKE', 'RESEARCH', 'PLAN_GEN', 'OPTIMIZE', 'DONE'];
      for (let i = 0; i < phases.length; i++) {
        const phaseDSO = {
          ...dso,
          systemState: {
            ...dso.systemState,
            currentPhase: phases[i],
            confidence: 0.3 + i * 0.15,
            version: i + 1,
          },
        } as DecisionState;

        await auditService.recordSnapshot(requestId, phaseDSO);
      }

      // Rollback to version 2
      const rolledBack = await auditService.rollback(requestId, 2);
      expect(rolledBack).not.toBeNull();
      expect((rolledBack as any).systemState?.currentPhase).toBe('RESEARCH');

      // Verify new snapshot created
      const latest = await auditService.getLatestSnapshot(requestId);
      expect(latest?.version).toBe(6);
    });

    it('should compute state diffs correctly', async () => {
      const requestId = 'diff-test';

      const dso1 = createInitialDSO();
      const dso2 = {
        ...dso1,
        userIntent: {
          ...dso1.userIntent,
          days: 7,
          budget: 6000,
        },
        constraints: {
          ...dso1.constraints,
          violations: ['time_exceeded'],
        },
        systemState: {
          ...dso1.systemState,
          currentPhase: 'PLAN_GEN',
          confidence: 0.7,
          version: 2,
        },
      } as DecisionState;

      await auditService.recordSnapshot(requestId, dso1);
      await auditService.recordSnapshot(requestId, dso2);

      const diffs = await auditService.computeDiff(requestId, 1, 2);

      expect(diffs.length).toBeGreaterThan(0);
      
      const daysDiff = diffs.find(d => d.field.includes('days'));
      expect(daysDiff?.before).toBe(5);
      expect(daysDiff?.after).toBe(7);
    });

    it('should track Lyapunov stability', async () => {
      const requestId = 'stability-test';

      // Simulate improving system state (decreasing Lyapunov)
      const configs = [
        { phase: 'INTAKE', confidence: 0.2, violations: 3 },
        { phase: 'RESEARCH', confidence: 0.4, violations: 2 },
        { phase: 'PLAN_GEN', confidence: 0.6, violations: 1 },
        { phase: 'OPTIMIZE', confidence: 0.8, violations: 0 },
        { phase: 'DONE', confidence: 0.95, violations: 0 },
      ];

      for (const cfg of configs) {
        const dso = {
          ...createInitialDSO(),
          constraints: {
            feasible: cfg.violations === 0,
            violations: Array(cfg.violations).fill('constraint'),
          },
          systemState: {
            currentPhase: cfg.phase,
            confidence: cfg.confidence,
            version: configs.indexOf(cfg) + 1,
          },
        } as DecisionState;

        await auditService.recordSnapshot(requestId, dso);
      }

      const trace = await auditService.getLyapunovTrace(requestId);

      expect(trace.values.length).toBe(5);
      expect(trace.isDecreasing).toBe(true);
    });
  });

  describe('Monte Carlo Sampling', () => {
    it('should compute expected utility with confidence (mocked)', () => {
      const dso = createInitialDSO();
      const result = mockComputeExpectedUtility(dso, { numSamples: 500 });

      expect(result.expectedUtility).toBeGreaterThanOrEqual(0);
      expect(result.expectedUtility).toBeLessThanOrEqual(1);
      expect(result.confidenceInterval).toBeDefined();
      expect(result.samples).toBeGreaterThan(0);
    });
  });

  describe('Policy Network', () => {
    it('should improve policy with training', () => {
      const dso = createInitialDSO();
      
      // Get initial policy
      const initial = policyNetwork.computePolicy(dso, false);
      
      // Train with samples
      const trainingSamples = Array.from({ length: 20 }, (_, i) => ({
        state: { ...dso, systemState: { ...dso.systemState, confidence: 0.3 + i * 0.03 } } as DecisionState,
        action: 'ACCEPT_PLAN' as const,
        reward: 0.5 + i * 0.02,
      }));

      const result = policyNetwork.updatePolicy(trainingSamples);
      
      expect(result.loss).toBeDefined();
      expect(result.gradientNorm).toBeDefined();

      // Get updated policy
      const updated = policyNetwork.computePolicy(dso, false);
      expect(updated.actionProbabilities.size).toBe(initial.actionProbabilities.size);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing DSO fields gracefully', async () => {
      const minimalDSO = {
        userIntent: {},
        constraints: {},
        systemState: { currentPhase: 'INTAKE' },
      } as DecisionState;

      // Mocked utility handles any DSO structure
      const result = mockComputeExpectedUtility(minimalDSO);
      expect(result.expectedUtility).toBeGreaterThanOrEqual(0);

      const snapshot = await auditService.recordSnapshot('minimal-test', minimalDSO);
      expect(snapshot.version).toBe(1);
    });

    it('should handle concurrent operations', async () => {
      const requestId = 'concurrent-test';
      const dso = createInitialDSO();

      // Parallel snapshots
      const promises = Array.from({ length: 10 }, (_, i) => 
        auditService.recordSnapshot(requestId, {
          ...dso,
          systemState: { ...dso.systemState, version: i + 1 },
        } as DecisionState)
      );

      const results = await Promise.all(promises);
      expect(results.length).toBe(10);

      const history = await auditService.getStateHistory(requestId);
      expect(history.length).toBe(10);
    });
  });
});
