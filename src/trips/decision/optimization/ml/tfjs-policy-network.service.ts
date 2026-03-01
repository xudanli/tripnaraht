/**
 * Decision OS TensorFlow.js 策略网络
 * 
 * 提供:
 * - 基于 TensorFlow.js 的神经网络
 * - 策略梯度学习
 * - 模型保存/加载
 * - GPU 加速支持
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as tf from '@tensorflow/tfjs';

// ========== 类型定义 ==========

export interface TFJSPolicyConfig {
  inputDim: number;
  hiddenLayers: number[];
  outputDim: number;
  learningRate: number;
  activation: 'relu' | 'tanh' | 'sigmoid' | 'elu';
  outputActivation: 'softmax' | 'linear';
  dropout?: number;
  l2Regularization?: number;
}

export interface TrainingSample {
  state: number[];
  action: number;
  reward: number;
  nextState?: number[];
  done?: boolean;
}

export interface TrainingResult {
  loss: number;
  accuracy?: number;
  epoch: number;
  batchSize: number;
  duration: number;
}

export interface PolicyOutput {
  actionProbabilities: number[];
  selectedAction: number;
  confidence: number;
  entropy: number;
}

export interface ModelMetadata {
  version: string;
  inputDim: number;
  outputDim: number;
  trainedEpochs: number;
  lastTrainingLoss: number;
  createdAt: string;
  updatedAt: string;
}

// ========== 默认配置 ==========

const DEFAULT_CONFIG: TFJSPolicyConfig = {
  inputDim: 64,
  hiddenLayers: [128, 64, 32],
  outputDim: 10,
  learningRate: 0.001,
  activation: 'relu',
  outputActivation: 'softmax',
  dropout: 0.1,
  l2Regularization: 0.001,
};

// ========== TensorFlow.js 策略网络服务 ==========

@Injectable()
export class TFJSPolicyNetworkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TFJSPolicyNetworkService.name);
  private model: tf.LayersModel | null = null;
  private optimizer: tf.Optimizer | null = null;
  private config: TFJSPolicyConfig;
  private metadata: ModelMetadata;
  private isInitialized = false;
  private replayBuffer: TrainingSample[] = [];
  private readonly maxBufferSize = 10000;

  constructor(config?: Partial<TFJSPolicyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metadata = {
      version: '1.0.0',
      inputDim: this.config.inputDim,
      outputDim: this.config.outputDim,
      trainedEpochs: 0,
      lastTrainingLoss: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async onModuleDestroy(): Promise<void> {
    await this.dispose();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.logger.log('[TFJS] Initializing policy network...');

    try {
      await tf.ready();
      this.logger.log(`[TFJS] Backend: ${tf.getBackend()}`);

      this.model = this.buildModel();
      this.optimizer = tf.train.adam(this.config.learningRate);

      this.isInitialized = true;
      this.logger.log('[TFJS] Policy network initialized');
    } catch (error) {
      this.logger.error(`[TFJS] Initialization failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private buildModel(): tf.LayersModel {
    const model = tf.sequential();

    model.add(tf.layers.dense({
      inputShape: [this.config.inputDim],
      units: this.config.hiddenLayers[0],
      activation: this.config.activation,
      kernelRegularizer: this.config.l2Regularization
        ? tf.regularizers.l2({ l2: this.config.l2Regularization })
        : undefined,
    }));

    if (this.config.dropout) {
      model.add(tf.layers.dropout({ rate: this.config.dropout }));
    }

    for (let i = 1; i < this.config.hiddenLayers.length; i++) {
      model.add(tf.layers.dense({
        units: this.config.hiddenLayers[i],
        activation: this.config.activation,
        kernelRegularizer: this.config.l2Regularization
          ? tf.regularizers.l2({ l2: this.config.l2Regularization })
          : undefined,
      }));

      if (this.config.dropout) {
        model.add(tf.layers.dropout({ rate: this.config.dropout }));
      }
    }

    model.add(tf.layers.dense({
      units: this.config.outputDim,
      activation: this.config.outputActivation,
    }));

    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  async predict(state: number[]): Promise<PolicyOutput> {
    this.ensureInitialized();

    return tf.tidy(() => {
      const inputTensor = tf.tensor2d([state], [1, this.config.inputDim]);
      const output = this.model!.predict(inputTensor) as tf.Tensor;
      const probabilities = output.dataSync() as Float32Array;

      const probs = Array.from(probabilities);
      const selectedAction = this.sampleAction(probs);
      const confidence = probs[selectedAction];
      const entropy = this.computeEntropy(probs);

      return {
        actionProbabilities: probs,
        selectedAction,
        confidence,
        entropy,
      };
    });
  }

  async predictBatch(states: number[][]): Promise<PolicyOutput[]> {
    this.ensureInitialized();

    return tf.tidy(() => {
      const inputTensor = tf.tensor2d(states, [states.length, this.config.inputDim]);
      const output = this.model!.predict(inputTensor) as tf.Tensor;
      const probabilities = output.arraySync() as number[][];

      return probabilities.map(probs => {
        const selectedAction = this.sampleAction(probs);
        return {
          actionProbabilities: probs,
          selectedAction,
          confidence: probs[selectedAction],
          entropy: this.computeEntropy(probs),
        };
      });
    });
  }

  addSample(sample: TrainingSample): void {
    this.replayBuffer.push(sample);

    if (this.replayBuffer.length > this.maxBufferSize) {
      this.replayBuffer.shift();
    }
  }

  async train(samples?: TrainingSample[], epochs = 1): Promise<TrainingResult> {
    this.ensureInitialized();

    const trainingSamples = samples ?? this.replayBuffer;
    if (trainingSamples.length === 0) {
      throw new Error('No training samples available');
    }

    const startTime = Date.now();

    const states = trainingSamples.map(s => s.state);
    const actions = trainingSamples.map(s => s.action);
    const rewards = trainingSamples.map(s => s.reward);

    const normalizedRewards = this.normalizeRewards(rewards);

    const xTensor = tf.tensor2d(states, [states.length, this.config.inputDim]);
    const actionMask = this.createActionMask(actions, normalizedRewards);

    let totalLoss = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const loss = await this.trainStep(xTensor, actionMask);
      totalLoss = loss;
    }

    xTensor.dispose();
    actionMask.dispose();

    this.metadata.trainedEpochs += epochs;
    this.metadata.lastTrainingLoss = totalLoss;
    this.metadata.updatedAt = new Date().toISOString();

    const duration = Date.now() - startTime;

    this.logger.debug(`[TFJS] Training completed: loss=${totalLoss.toFixed(4)}, duration=${duration}ms`);

    return {
      loss: totalLoss,
      epoch: this.metadata.trainedEpochs,
      batchSize: trainingSamples.length,
      duration,
    };
  }

  private async trainStep(states: tf.Tensor, targets: tf.Tensor): Promise<number> {
    return tf.tidy(() => {
      const loss = this.optimizer!.minimize(() => {
        const predictions = this.model!.predict(states) as tf.Tensor;
        return tf.losses.softmaxCrossEntropy(targets, predictions).asScalar();
      }, true);

      return loss?.dataSync()[0] ?? 0;
    });
  }

  async trainPolicyGradient(
    samples: TrainingSample[],
    gamma = 0.99,
  ): Promise<TrainingResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const states = samples.map(s => s.state);
    const actions = samples.map(s => s.action);
    const rewards = samples.map(s => s.reward);

    const returns = this.computeReturns(rewards, gamma);
    const normalizedReturns = this.normalizeRewards(returns);

    const xTensor = tf.tensor2d(states, [states.length, this.config.inputDim]);
    const actionTensor = tf.tensor1d(actions, 'int32');
    const returnsTensor = tf.tensor1d(normalizedReturns);

    const lossValue = tf.tidy(() => {
      const loss = this.optimizer!.minimize(() => {
        const logits = this.model!.predict(xTensor) as tf.Tensor;
        const logProbs = tf.logSoftmax(logits);

        const oneHot = tf.oneHot(actionTensor, this.config.outputDim);
        const selectedLogProbs = tf.sum(tf.mul(logProbs, oneHot), 1);

        const policyLoss = tf.neg(tf.mean(tf.mul(selectedLogProbs, returnsTensor)));

        return policyLoss.asScalar();
      }, true);

      return loss?.dataSync()[0] ?? 0;
    });

    xTensor.dispose();
    actionTensor.dispose();
    returnsTensor.dispose();

    this.metadata.trainedEpochs++;
    this.metadata.lastTrainingLoss = lossValue;
    this.metadata.updatedAt = new Date().toISOString();

    return {
      loss: lossValue,
      epoch: this.metadata.trainedEpochs,
      batchSize: samples.length,
      duration: Date.now() - startTime,
    };
  }

  async saveModel(path: string): Promise<void> {
    this.ensureInitialized();

    await this.model!.save(`file://${path}`);
    this.logger.log(`[TFJS] Model saved to ${path}`);
  }

  async loadModel(path: string): Promise<void> {
    try {
      this.model = await tf.loadLayersModel(`file://${path}/model.json`);
      this.isInitialized = true;
      this.logger.log(`[TFJS] Model loaded from ${path}`);
    } catch (error) {
      this.logger.error(`[TFJS] Failed to load model: ${(error as Error).message}`);
      throw error;
    }
  }

  getMetadata(): ModelMetadata {
    return { ...this.metadata };
  }

  getConfig(): TFJSPolicyConfig {
    return { ...this.config };
  }

  getBufferSize(): number {
    return this.replayBuffer.length;
  }

  clearBuffer(): void {
    this.replayBuffer = [];
  }

  async dispose(): Promise<void> {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    if (this.optimizer) {
      this.optimizer.dispose();
      this.optimizer = null;
    }
    this.isInitialized = false;
    this.logger.log('[TFJS] Resources disposed');
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.model) {
      throw new Error('Policy network not initialized');
    }
  }

  private sampleAction(probabilities: number[]): number {
    const random = Math.random();
    let cumulative = 0;

    for (let i = 0; i < probabilities.length; i++) {
      cumulative += probabilities[i];
      if (random < cumulative) {
        return i;
      }
    }

    return probabilities.length - 1;
  }

  private computeEntropy(probabilities: number[]): number {
    let entropy = 0;
    for (const p of probabilities) {
      if (p > 0) {
        entropy -= p * Math.log(p);
      }
    }
    return entropy;
  }

  private normalizeRewards(rewards: number[]): number[] {
    const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const variance = rewards.reduce((a, b) => a + (b - mean) ** 2, 0) / rewards.length;
    const std = Math.sqrt(variance) + 1e-8;

    return rewards.map(r => (r - mean) / std);
  }

  private computeReturns(rewards: number[], gamma: number): number[] {
    const returns: number[] = new Array(rewards.length);
    let runningReturn = 0;

    for (let i = rewards.length - 1; i >= 0; i--) {
      runningReturn = rewards[i] + gamma * runningReturn;
      returns[i] = runningReturn;
    }

    return returns;
  }

  private createActionMask(actions: number[], rewards: number[]): tf.Tensor {
    const mask = new Array(actions.length)
      .fill(null)
      .map((_, i) => {
        const oneHot = new Array(this.config.outputDim).fill(0);
        oneHot[actions[i]] = rewards[i];
        return oneHot;
      });

    return tf.tensor2d(mask, [actions.length, this.config.outputDim]);
  }
}
