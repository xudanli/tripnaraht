/**
 * Decision OS TensorFlow.js 差分决策服务
 * 
 * 提供:
 * - 端到端可微分决策
 * - 自动梯度计算
 * - Actor-Critic 架构
 * - 优势函数估计
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as tf from '@tensorflow/tfjs';

// ========== 类型定义 ==========

export interface DifferentiableConfig {
  stateSize: number;
  actionSize: number;
  actorLearningRate: number;
  criticLearningRate: number;
  gamma: number;
  tau: number;
  entropy_coef: number;
  value_coef: number;
  hiddenUnits: number[];
}

export interface ActorCriticOutput {
  policy: number[];
  value: number;
  action: number;
  logProb: number;
}

export interface A2CTrainingResult {
  policyLoss: number;
  valueLoss: number;
  entropy: number;
  totalLoss: number;
  epoch: number;
}

export interface Trajectory {
  states: number[][];
  actions: number[];
  rewards: number[];
  values: number[];
  logProbs: number[];
  dones: boolean[];
}

export interface GAEResult {
  advantages: number[];
  returns: number[];
}

// ========== 默认配置 ==========

const DEFAULT_DIFF_CONFIG: DifferentiableConfig = {
  stateSize: 64,
  actionSize: 10,
  actorLearningRate: 0.0003,
  criticLearningRate: 0.001,
  gamma: 0.99,
  tau: 0.95,
  entropy_coef: 0.01,
  value_coef: 0.5,
  hiddenUnits: [256, 128],
};

// ========== Actor-Critic 网络 ==========

@Injectable()
export class TFJSDifferentiableDecisionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TFJSDifferentiableDecisionService.name);
  private actor: tf.LayersModel | null = null;
  private critic: tf.LayersModel | null = null;
  private actorOptimizer: tf.Optimizer | null = null;
  private criticOptimizer: tf.Optimizer | null = null;
  private config: DifferentiableConfig;
  private isInitialized = false;
  private trainingEpoch = 0;

  constructor(config?: Partial<DifferentiableConfig>) {
    this.config = { ...DEFAULT_DIFF_CONFIG, ...config };
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async onModuleDestroy(): Promise<void> {
    await this.dispose();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.logger.log('[TFJS-A2C] Initializing Actor-Critic network...');

    try {
      await tf.ready();

      this.actor = this.buildActor();
      this.critic = this.buildCritic();
      this.actorOptimizer = tf.train.adam(this.config.actorLearningRate);
      this.criticOptimizer = tf.train.adam(this.config.criticLearningRate);

      this.isInitialized = true;
      this.logger.log('[TFJS-A2C] Actor-Critic network initialized');
    } catch (error) {
      this.logger.error(`[TFJS-A2C] Initialization failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private buildActor(): tf.LayersModel {
    const input = tf.input({ shape: [this.config.stateSize] });
    let x: tf.SymbolicTensor = input;

    for (const units of this.config.hiddenUnits) {
      x = tf.layers.dense({
        units,
        activation: 'relu',
        kernelInitializer: 'heNormal',
      }).apply(x) as tf.SymbolicTensor;
    }

    const output = tf.layers.dense({
      units: this.config.actionSize,
      activation: 'softmax',
      kernelInitializer: tf.initializers.randomUniform({ minval: -0.003, maxval: 0.003 }),
    }).apply(x) as tf.SymbolicTensor;

    return tf.model({ inputs: input, outputs: output });
  }

  private buildCritic(): tf.LayersModel {
    const input = tf.input({ shape: [this.config.stateSize] });
    let x: tf.SymbolicTensor = input;

    for (const units of this.config.hiddenUnits) {
      x = tf.layers.dense({
        units,
        activation: 'relu',
        kernelInitializer: 'heNormal',
      }).apply(x) as tf.SymbolicTensor;
    }

    const output = tf.layers.dense({
      units: 1,
      kernelInitializer: tf.initializers.randomUniform({ minval: -0.003, maxval: 0.003 }),
    }).apply(x) as tf.SymbolicTensor;

    return tf.model({ inputs: input, outputs: output });
  }

  async forward(state: number[]): Promise<ActorCriticOutput> {
    this.ensureInitialized();

    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state], [1, this.config.stateSize]);

      const policy = (this.actor!.predict(stateTensor) as tf.Tensor).dataSync() as Float32Array;
      const value = (this.critic!.predict(stateTensor) as tf.Tensor).dataSync()[0];

      const policyArray = Array.from(policy);
      const action = this.sampleAction(policyArray);
      const logProb = Math.log(policyArray[action] + 1e-8);

      return {
        policy: policyArray,
        value,
        action,
        logProb,
      };
    });
  }

  async forwardBatch(states: number[][]): Promise<ActorCriticOutput[]> {
    this.ensureInitialized();

    return tf.tidy(() => {
      const stateTensor = tf.tensor2d(states, [states.length, this.config.stateSize]);

      const policies = (this.actor!.predict(stateTensor) as tf.Tensor).arraySync() as number[][];
      const values = (this.critic!.predict(stateTensor) as tf.Tensor).dataSync() as Float32Array;

      return policies.map((policy, i) => {
        const action = this.sampleAction(policy);
        return {
          policy,
          value: values[i],
          action,
          logProb: Math.log(policy[action] + 1e-8),
        };
      });
    });
  }

  async trainA2C(trajectory: Trajectory): Promise<A2CTrainingResult> {
    this.ensureInitialized();

    const { advantages, returns } = this.computeGAE(
      trajectory.rewards,
      trajectory.values,
      trajectory.dones,
    );

    const stateTensor = tf.tensor2d(
      trajectory.states,
      [trajectory.states.length, this.config.stateSize],
    );
    const actionTensor = tf.tensor1d(trajectory.actions, 'int32');
    const oldLogProbsTensor = tf.tensor1d(trajectory.logProbs);
    const advantagesTensor = tf.tensor1d(advantages);
    const returnsTensor = tf.tensor1d(returns);

    let policyLoss = 0;
    let valueLoss = 0;
    let entropy = 0;

    policyLoss = tf.tidy(() => {
      const loss = this.actorOptimizer!.minimize(() => {
        const policyOutput = this.actor!.predict(stateTensor) as tf.Tensor;
        const logPolicy = tf.log(tf.add(policyOutput, 1e-8));

        const oneHot = tf.oneHot(actionTensor, this.config.actionSize);
        const selectedLogProbs = tf.sum(tf.mul(logPolicy, oneHot), 1);

        const entropyTerm = tf.neg(tf.sum(tf.mul(policyOutput, logPolicy), 1));
        entropy = tf.mean(entropyTerm).dataSync()[0];

        const policyGradient = tf.neg(tf.mul(selectedLogProbs, advantagesTensor));
        const entropyBonus = tf.mul(tf.scalar(-this.config.entropy_coef), entropyTerm);

        return tf.mean(tf.add(policyGradient, entropyBonus)).asScalar();
      }, true);

      return loss?.dataSync()[0] ?? 0;
    });

    valueLoss = tf.tidy(() => {
      const loss = this.criticOptimizer!.minimize(() => {
        const valueOutput = this.critic!.predict(stateTensor) as tf.Tensor;
        const valuePredictions = tf.squeeze(valueOutput);
        return tf.losses.meanSquaredError(returnsTensor, valuePredictions).asScalar();
      }, true);

      return loss?.dataSync()[0] ?? 0;
    });

    stateTensor.dispose();
    actionTensor.dispose();
    oldLogProbsTensor.dispose();
    advantagesTensor.dispose();
    returnsTensor.dispose();

    this.trainingEpoch++;

    const totalLoss = policyLoss + this.config.value_coef * valueLoss;

    this.logger.debug(
      `[TFJS-A2C] Epoch ${this.trainingEpoch}: policy_loss=${policyLoss.toFixed(4)}, value_loss=${valueLoss.toFixed(4)}, entropy=${entropy.toFixed(4)}`,
    );

    return {
      policyLoss,
      valueLoss,
      entropy,
      totalLoss,
      epoch: this.trainingEpoch,
    };
  }

  async trainPPO(
    trajectory: Trajectory,
    clipEpsilon = 0.2,
    epochs = 4,
  ): Promise<A2CTrainingResult[]> {
    this.ensureInitialized();

    const results: A2CTrainingResult[] = [];
    const { advantages, returns } = this.computeGAE(
      trajectory.rewards,
      trajectory.values,
      trajectory.dones,
    );

    const normalizedAdvantages = this.normalizeAdvantages(advantages);

    for (let epoch = 0; epoch < epochs; epoch++) {
      const stateTensor = tf.tensor2d(
        trajectory.states,
        [trajectory.states.length, this.config.stateSize],
      );
      const actionTensor = tf.tensor1d(trajectory.actions, 'int32');
      const oldLogProbsTensor = tf.tensor1d(trajectory.logProbs);
      const advantagesTensor = tf.tensor1d(normalizedAdvantages);
      const returnsTensor = tf.tensor1d(returns);

      let policyLoss = 0;
      let valueLoss = 0;
      let entropy = 0;

      policyLoss = tf.tidy(() => {
        const loss = this.actorOptimizer!.minimize(() => {
          const policyOutput = this.actor!.predict(stateTensor) as tf.Tensor;
          const logPolicy = tf.log(tf.add(policyOutput, 1e-8));

          const oneHot = tf.oneHot(actionTensor, this.config.actionSize);
          const newLogProbs = tf.sum(tf.mul(logPolicy, oneHot), 1);

          const ratio = tf.exp(tf.sub(newLogProbs, oldLogProbsTensor));
          const clippedRatio = tf.clipByValue(ratio, 1 - clipEpsilon, 1 + clipEpsilon);

          const surrogate1 = tf.mul(ratio, advantagesTensor);
          const surrogate2 = tf.mul(clippedRatio, advantagesTensor);
          const ppoLoss = tf.neg(tf.mean(tf.minimum(surrogate1, surrogate2)));

          const entropyTerm = tf.neg(tf.sum(tf.mul(policyOutput, logPolicy), 1));
          entropy = tf.mean(entropyTerm).dataSync()[0];
          const entropyBonus = tf.mul(tf.scalar(-this.config.entropy_coef), tf.mean(entropyTerm));

          return tf.add(ppoLoss, entropyBonus).asScalar();
        }, true);

        return loss?.dataSync()[0] ?? 0;
      });

      valueLoss = tf.tidy(() => {
        const loss = this.criticOptimizer!.minimize(() => {
          const valueOutput = this.critic!.predict(stateTensor) as tf.Tensor;
          const valuePredictions = tf.squeeze(valueOutput);
          return tf.mul(
            tf.scalar(this.config.value_coef),
            tf.losses.meanSquaredError(returnsTensor, valuePredictions),
          ).asScalar();
        }, true);

        return loss?.dataSync()[0] ?? 0;
      });

      stateTensor.dispose();
      actionTensor.dispose();
      oldLogProbsTensor.dispose();
      advantagesTensor.dispose();
      returnsTensor.dispose();

      this.trainingEpoch++;

      results.push({
        policyLoss,
        valueLoss,
        entropy,
        totalLoss: policyLoss + valueLoss,
        epoch: this.trainingEpoch,
      });
    }

    return results;
  }

  computeGAE(rewards: number[], values: number[], dones: boolean[]): GAEResult {
    const advantages: number[] = new Array(rewards.length);
    const returns: number[] = new Array(rewards.length);

    let gae = 0;
    const nextValue = 0;

    for (let i = rewards.length - 1; i >= 0; i--) {
      const nextVal = i === rewards.length - 1 ? nextValue : values[i + 1];
      const mask = dones[i] ? 0 : 1;

      const delta = rewards[i] + this.config.gamma * nextVal * mask - values[i];
      gae = delta + this.config.gamma * this.config.tau * mask * gae;
      advantages[i] = gae;
      returns[i] = advantages[i] + values[i];
    }

    return { advantages, returns };
  }

  async getValue(state: number[]): Promise<number> {
    this.ensureInitialized();

    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state], [1, this.config.stateSize]);
      const value = (this.critic!.predict(stateTensor) as tf.Tensor).dataSync()[0];
      return value;
    });
  }

  async getPolicy(state: number[]): Promise<number[]> {
    this.ensureInitialized();

    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state], [1, this.config.stateSize]);
      const policy = (this.actor!.predict(stateTensor) as tf.Tensor).dataSync() as Float32Array;
      return Array.from(policy);
    });
  }

  async saveModels(basePath: string): Promise<void> {
    this.ensureInitialized();

    await this.actor!.save(`file://${basePath}/actor`);
    await this.critic!.save(`file://${basePath}/critic`);
    this.logger.log(`[TFJS-A2C] Models saved to ${basePath}`);
  }

  async loadModels(basePath: string): Promise<void> {
    try {
      this.actor = await tf.loadLayersModel(`file://${basePath}/actor/model.json`);
      this.critic = await tf.loadLayersModel(`file://${basePath}/critic/model.json`);
      this.isInitialized = true;
      this.logger.log(`[TFJS-A2C] Models loaded from ${basePath}`);
    } catch (error) {
      this.logger.error(`[TFJS-A2C] Failed to load models: ${(error as Error).message}`);
      throw error;
    }
  }

  getConfig(): DifferentiableConfig {
    return { ...this.config };
  }

  getTrainingEpoch(): number {
    return this.trainingEpoch;
  }

  async dispose(): Promise<void> {
    if (this.actor) {
      this.actor.dispose();
      this.actor = null;
    }
    if (this.critic) {
      this.critic.dispose();
      this.critic = null;
    }
    if (this.actorOptimizer) {
      this.actorOptimizer.dispose();
      this.actorOptimizer = null;
    }
    if (this.criticOptimizer) {
      this.criticOptimizer.dispose();
      this.criticOptimizer = null;
    }
    this.isInitialized = false;
    this.logger.log('[TFJS-A2C] Resources disposed');
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.actor || !this.critic) {
      throw new Error('Actor-Critic network not initialized');
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

  private normalizeAdvantages(advantages: number[]): number[] {
    const mean = advantages.reduce((a, b) => a + b, 0) / advantages.length;
    const variance = advantages.reduce((a, b) => a + (b - mean) ** 2, 0) / advantages.length;
    const std = Math.sqrt(variance) + 1e-8;

    return advantages.map(a => (a - mean) / std);
  }
}
