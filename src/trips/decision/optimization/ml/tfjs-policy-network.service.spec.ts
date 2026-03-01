/**
 * TensorFlow.js 策略网络服务测试
 */

import { TFJSPolicyNetworkService, TrainingSample, TFJSPolicyConfig } from './tfjs-policy-network.service';

describe('TFJSPolicyNetworkService', () => {
  let service: TFJSPolicyNetworkService;

  const testConfig: Partial<TFJSPolicyConfig> = {
    inputDim: 8,
    hiddenLayers: [16, 8],
    outputDim: 4,
    learningRate: 0.01,
    activation: 'relu',
    outputActivation: 'softmax',
  };

  beforeEach(async () => {
    service = new TFJSPolicyNetworkService(testConfig);
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      const metadata = service.getMetadata();
      expect(metadata.inputDim).toBe(8);
      expect(metadata.outputDim).toBe(4);
    });

    it('should return correct config', () => {
      const config = service.getConfig();
      expect(config.inputDim).toBe(8);
      expect(config.outputDim).toBe(4);
      expect(config.hiddenLayers).toEqual([16, 8]);
    });

    it('should not re-initialize if already initialized', async () => {
      const metadataBefore = service.getMetadata();
      await service.initialize();
      const metadataAfter = service.getMetadata();
      expect(metadataBefore.createdAt).toBe(metadataAfter.createdAt);
    });
  });

  describe('predict', () => {
    it('should predict action probabilities', async () => {
      const state = Array(8).fill(0.5);
      const output = await service.predict(state);

      expect(output.actionProbabilities).toHaveLength(4);
      expect(output.selectedAction).toBeGreaterThanOrEqual(0);
      expect(output.selectedAction).toBeLessThan(4);
      expect(output.confidence).toBeGreaterThan(0);
      expect(output.confidence).toBeLessThanOrEqual(1);
    });

    it('should compute entropy', async () => {
      const state = Array(8).fill(0.5);
      const output = await service.predict(state);

      expect(output.entropy).toBeGreaterThanOrEqual(0);
    });

    it('should sum probabilities to approximately 1', async () => {
      const state = Array(8).fill(0.5);
      const output = await service.predict(state);

      const sum = output.actionProbabilities.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('predictBatch', () => {
    it('should predict for multiple states', async () => {
      const states = [
        Array(8).fill(0.1),
        Array(8).fill(0.5),
        Array(8).fill(0.9),
      ];

      const outputs = await service.predictBatch(states);

      expect(outputs).toHaveLength(3);
      outputs.forEach(output => {
        expect(output.actionProbabilities).toHaveLength(4);
        expect(output.selectedAction).toBeGreaterThanOrEqual(0);
        expect(output.selectedAction).toBeLessThan(4);
      });
    });
  });

  describe('replay buffer', () => {
    it('should add samples to buffer', () => {
      const sample: TrainingSample = {
        state: Array(8).fill(0.5),
        action: 1,
        reward: 1.0,
      };

      service.addSample(sample);
      expect(service.getBufferSize()).toBe(1);
    });

    it('should clear buffer', () => {
      const sample: TrainingSample = {
        state: Array(8).fill(0.5),
        action: 1,
        reward: 1.0,
      };

      service.addSample(sample);
      service.clearBuffer();
      expect(service.getBufferSize()).toBe(0);
    });
  });

  describe('train', () => {
    it('should train on samples', async () => {
      const samples: TrainingSample[] = Array(10).fill(null).map((_, i) => ({
        state: Array(8).fill(Math.random()),
        action: i % 4,
        reward: Math.random(),
      }));

      const result = await service.train(samples);

      expect(result.loss).toBeDefined();
      expect(result.epoch).toBeGreaterThan(0);
      expect(result.batchSize).toBe(10);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should train from replay buffer', async () => {
      const samples: TrainingSample[] = Array(10).fill(null).map((_, i) => ({
        state: Array(8).fill(Math.random()),
        action: i % 4,
        reward: Math.random(),
      }));

      samples.forEach(s => service.addSample(s));
      const result = await service.train();

      expect(result.batchSize).toBe(10);
    });

    it('should throw if no samples available', async () => {
      await expect(service.train()).rejects.toThrow('No training samples available');
    });
  });

  describe('trainPolicyGradient', () => {
    it('should train using policy gradient', async () => {
      const samples: TrainingSample[] = Array(10).fill(null).map((_, i) => ({
        state: Array(8).fill(Math.random()),
        action: i % 4,
        reward: Math.random(),
      }));

      const result = await service.trainPolicyGradient(samples);

      expect(result.loss).toBeDefined();
      expect(result.epoch).toBeGreaterThan(0);
    });

    it('should use custom gamma', async () => {
      const samples: TrainingSample[] = Array(10).fill(null).map((_, i) => ({
        state: Array(8).fill(Math.random()),
        action: i % 4,
        reward: Math.random(),
      }));

      const result = await service.trainPolicyGradient(samples, 0.95);
      expect(result.loss).toBeDefined();
    });
  });

  describe('metadata', () => {
    it('should update metadata after training', async () => {
      const samples: TrainingSample[] = Array(10).fill(null).map((_, i) => ({
        state: Array(8).fill(Math.random()),
        action: i % 4,
        reward: Math.random(),
      }));

      await service.train(samples, 2);
      const metadata = service.getMetadata();

      expect(metadata.trainedEpochs).toBe(2);
      expect(metadata.lastTrainingLoss).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should dispose resources', async () => {
      await service.dispose();

      await expect(service.predict(Array(8).fill(0.5))).rejects.toThrow('not initialized');
    });
  });
});
