import { PolicyNetworkService, ActionType, PolicyTrainingSample } from './policy-network.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

describe('PolicyNetworkService', () => {
  let service: PolicyNetworkService;

  beforeEach(() => {
    service = new PolicyNetworkService();
  });

  describe('computePolicy', () => {
    it('should return valid policy output', () => {
      const state: DecisionState = {
        userIntent: { days: 5, mode: 'drive' },
        constraints: { feasible: true, violations: [] },
        systemState: { confidence: 0.8, currentPhase: 'PLAN_GEN' },
      } as DecisionState;

      const result = service.computePolicy(state);

      expect(result.selectedAction).toBeDefined();
      expect(result.actionProbabilities).toBeInstanceOf(Map);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.entropy).toBeGreaterThanOrEqual(0);
    });

    it('should return probabilities that sum to 1', () => {
      const state: DecisionState = {
        userIntent: { days: 3 },
        constraints: { feasible: true },
        systemState: { confidence: 0.5 },
      } as DecisionState;

      const result = service.computePolicy(state);
      
      let sum = 0;
      for (const prob of result.actionProbabilities.values()) {
        sum += prob;
      }
      
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should include all action types in probabilities', () => {
      const state: DecisionState = {} as DecisionState;
      const result = service.computePolicy(state);
      
      const expectedActions: ActionType[] = [
        'ACCEPT_PLAN', 'MODIFY_PLAN', 'REGENERATE',
        'REQUEST_INFO', 'RELAX_CONSTRAINT', 'ESCALATE',
      ];
      
      for (const action of expectedActions) {
        expect(result.actionProbabilities.has(action)).toBe(true);
      }
    });

    it('should return greedy action when explore=false', () => {
      const state: DecisionState = {
        userIntent: { days: 7 },
        constraints: { feasible: true },
        systemState: { confidence: 0.9 },
      } as DecisionState;

      const result1 = service.computePolicy(state, false);
      const result2 = service.computePolicy(state, false);
      
      expect(result1.selectedAction).toBe(result2.selectedAction);
    });
  });

  describe('updatePolicy', () => {
    it('should return loss and gradient norm', () => {
      const samples: PolicyTrainingSample[] = [
        {
          state: { userIntent: { days: 3 }, constraints: { feasible: true } } as DecisionState,
          action: 'ACCEPT_PLAN',
          reward: 0.8,
        },
        {
          state: { userIntent: { days: 5 }, constraints: { feasible: false } } as DecisionState,
          action: 'MODIFY_PLAN',
          reward: 0.5,
        },
      ];

      const result = service.updatePolicy(samples);

      expect(result.loss).toBeDefined();
      expect(result.gradientNorm).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty samples', () => {
      const result = service.updatePolicy([]);
      
      expect(result.loss).toBe(0);
      expect(result.gradientNorm).toBe(0);
    });

    it('should update parameters after training', () => {
      const paramsBefore = service.getParameters();
      
      const samples: PolicyTrainingSample[] = Array.from({ length: 10 }, (_, i) => ({
        state: { userIntent: { days: i + 1 }, constraints: { feasible: true } } as DecisionState,
        action: i % 2 === 0 ? 'ACCEPT_PLAN' : 'MODIFY_PLAN' as ActionType,
        reward: 0.5 + Math.random() * 0.5,
      }));

      service.updatePolicy(samples);
      
      const paramsAfter = service.getParameters();
      
      expect(JSON.stringify(paramsBefore)).not.toBe(JSON.stringify(paramsAfter));
    });
  });

  describe('parameters persistence', () => {
    it('should get and set parameters', () => {
      const originalParams = service.getParameters();
      
      originalParams.b1[0] = 999;
      service.setParameters(originalParams);
      
      const newParams = service.getParameters();
      expect(newParams.b1[0]).toBe(999);
    });
  });

  describe('entropy', () => {
    it('should have higher entropy initially (more exploration)', () => {
      const state: DecisionState = {} as DecisionState;
      
      const result = service.computePolicy(state);
      
      expect(result.entropy).toBeGreaterThan(0);
    });
  });
});
