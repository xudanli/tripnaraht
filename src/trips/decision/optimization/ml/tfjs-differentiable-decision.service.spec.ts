/**
 * TensorFlow.js 差分决策服务测试
 */

import {
  TFJSDifferentiableDecisionService,
  DifferentiableConfig,
  Trajectory,
} from './tfjs-differentiable-decision.service';

describe('TFJSDifferentiableDecisionService', () => {
  let service: TFJSDifferentiableDecisionService;

  const testConfig: Partial<DifferentiableConfig> = {
    stateSize: 8,
    actionSize: 4,
    actorLearningRate: 0.001,
    criticLearningRate: 0.001,
    gamma: 0.99,
    tau: 0.95,
    hiddenUnits: [16, 8],
  };

  beforeEach(async () => {
    service = new TFJSDifferentiableDecisionService(testConfig);
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      const config = service.getConfig();
      expect(config.stateSize).toBe(8);
      expect(config.actionSize).toBe(4);
    });

    it('should return training epoch', () => {
      expect(service.getTrainingEpoch()).toBe(0);
    });
  });

  describe('forward', () => {
    it('should compute policy and value', async () => {
      const state = Array(8).fill(0.5);
      const output = await service.forward(state);

      expect(output.policy).toHaveLength(4);
      expect(typeof output.value).toBe('number');
      expect(output.action).toBeGreaterThanOrEqual(0);
      expect(output.action).toBeLessThan(4);
      expect(typeof output.logProb).toBe('number');
    });

    it('should produce valid probability distribution', async () => {
      const state = Array(8).fill(0.5);
      const output = await service.forward(state);

      const sum = output.policy.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('forwardBatch', () => {
    it('should compute for multiple states', async () => {
      const states = [
        Array(8).fill(0.1),
        Array(8).fill(0.5),
        Array(8).fill(0.9),
      ];

      const outputs = await service.forwardBatch(states);

      expect(outputs).toHaveLength(3);
      outputs.forEach(output => {
        expect(output.policy).toHaveLength(4);
        expect(typeof output.value).toBe('number');
      });
    });
  });

  describe('getValue', () => {
    it('should return state value', async () => {
      const state = Array(8).fill(0.5);
      const value = await service.getValue(state);

      expect(typeof value).toBe('number');
    });
  });

  describe('getPolicy', () => {
    it('should return action probabilities', async () => {
      const state = Array(8).fill(0.5);
      const policy = await service.getPolicy(state);

      expect(policy).toHaveLength(4);
      const sum = policy.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('computeGAE', () => {
    it('should compute generalized advantage estimation', () => {
      const rewards = [1, 0, 1, 0, 1];
      const values = [0.5, 0.5, 0.5, 0.5, 0.5];
      const dones = [false, false, false, false, true];

      const result = service.computeGAE(rewards, values, dones);

      expect(result.advantages).toHaveLength(5);
      expect(result.returns).toHaveLength(5);
    });

    it('should handle terminal states', () => {
      const rewards = [1, 1, 1];
      const values = [0.5, 0.5, 0.5];
      const dones = [false, false, true];

      const result = service.computeGAE(rewards, values, dones);

      expect(result.advantages[2]).toBeGreaterThan(0);
    });
  });

  describe('trainA2C', () => {
    it('should train using A2C algorithm', async () => {
      const trajectory: Trajectory = {
        states: Array(10).fill(null).map(() => Array(8).fill(Math.random())),
        actions: Array(10).fill(null).map(() => Math.floor(Math.random() * 4)),
        rewards: Array(10).fill(null).map(() => Math.random()),
        values: Array(10).fill(null).map(() => Math.random()),
        logProbs: Array(10).fill(null).map(() => Math.log(0.25)),
        dones: Array(10).fill(false).map((_, i) => i === 9),
      };

      const result = await service.trainA2C(trajectory);

      expect(typeof result.policyLoss).toBe('number');
      expect(typeof result.valueLoss).toBe('number');
      expect(typeof result.entropy).toBe('number');
      expect(typeof result.totalLoss).toBe('number');
      expect(result.epoch).toBeGreaterThan(0);
    });

    it('should update training epoch', async () => {
      const trajectory: Trajectory = {
        states: Array(5).fill(null).map(() => Array(8).fill(Math.random())),
        actions: Array(5).fill(null).map(() => Math.floor(Math.random() * 4)),
        rewards: Array(5).fill(null).map(() => Math.random()),
        values: Array(5).fill(null).map(() => Math.random()),
        logProbs: Array(5).fill(null).map(() => Math.log(0.25)),
        dones: [false, false, false, false, true],
      };

      await service.trainA2C(trajectory);
      expect(service.getTrainingEpoch()).toBe(1);

      await service.trainA2C(trajectory);
      expect(service.getTrainingEpoch()).toBe(2);
    });
  });

  describe('trainPPO', () => {
    it('should train using PPO algorithm', async () => {
      const trajectory: Trajectory = {
        states: Array(10).fill(null).map(() => Array(8).fill(Math.random())),
        actions: Array(10).fill(null).map(() => Math.floor(Math.random() * 4)),
        rewards: Array(10).fill(null).map(() => Math.random()),
        values: Array(10).fill(null).map(() => Math.random()),
        logProbs: Array(10).fill(null).map(() => Math.log(0.25)),
        dones: Array(10).fill(false).map((_, i) => i === 9),
      };

      const results = await service.trainPPO(trajectory, 0.2, 2);

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(typeof result.policyLoss).toBe('number');
        expect(typeof result.valueLoss).toBe('number');
      });
    });

    it('should apply clipping', async () => {
      const trajectory: Trajectory = {
        states: Array(5).fill(null).map(() => Array(8).fill(Math.random())),
        actions: Array(5).fill(null).map(() => Math.floor(Math.random() * 4)),
        rewards: Array(5).fill(null).map(() => Math.random()),
        values: Array(5).fill(null).map(() => Math.random()),
        logProbs: Array(5).fill(null).map(() => Math.log(0.25)),
        dones: [false, false, false, false, true],
      };

      const results = await service.trainPPO(trajectory, 0.1, 1);
      expect(results[0].policyLoss).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should dispose resources', async () => {
      await service.dispose();

      await expect(service.forward(Array(8).fill(0.5))).rejects.toThrow('not initialized');
    });
  });
});
