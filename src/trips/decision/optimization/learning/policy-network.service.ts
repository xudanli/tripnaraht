/**
 * 策略网络服务
 *
 * 专利实现：π_θ(a|s) = argmax E[U(a|s)]
 * 学习在给定状态 s 下选择最优动作 a 的策略
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import { DifferentiableDecisionService } from '../differentiable/differentiable-decision.service';

export type ActionType = 'ACCEPT_PLAN' | 'MODIFY_PLAN' | 'REGENERATE' | 'REQUEST_INFO' | 'RELAX_CONSTRAINT' | 'ESCALATE';

export interface ActionSpace {
  actions: ActionType[];
  parameters?: { [action: string]: { name: string; min: number; max: number; default: number }[] };
}

export interface PolicyOutput {
  selectedAction: ActionType;
  actionProbabilities: Map<ActionType, number>;
  actionParameters?: Record<string, number>;
  confidence: number;
  entropy: number;
}

export interface PolicyNetworkConfig {
  hiddenDim: number;
  temperature: number;
  learningRate: number;
  entropyCoef: number;
  useTemperatureAnnealing: boolean;
  initialTemperature?: number;
  finalTemperature?: number;
}

const DEFAULT_CONFIG: PolicyNetworkConfig = {
  hiddenDim: 32,
  temperature: 1.0,
  learningRate: 0.001,
  entropyCoef: 0.01,
  useTemperatureAnnealing: true,
  initialTemperature: 2.0,
  finalTemperature: 0.5,
};

const DEFAULT_ACTIONS: ActionType[] = ['ACCEPT_PLAN', 'MODIFY_PLAN', 'REGENERATE', 'REQUEST_INFO', 'RELAX_CONSTRAINT', 'ESCALATE'];

interface PolicyParameters {
  W1: number[][];
  b1: number[];
  W2: number[][];
  b2: number[];
}

export interface PolicyTrainingSample {
  state: DecisionState;
  action: ActionType;
  reward: number;
  advantage?: number;
}

// ========== P1.1 优化：Experience Replay ==========

export interface Experience {
  state: DecisionState;
  action: ActionType;
  reward: number;
  nextState: DecisionState | null;
  done: boolean;
  timestamp: number;
  priority?: number;
}

export interface ReplayBufferConfig {
  maxSize: number;
  batchSize: number;
  prioritized: boolean;
  alpha: number;
  beta: number;
  betaIncrement: number;
}

const DEFAULT_REPLAY_CONFIG: ReplayBufferConfig = {
  maxSize: 10000,
  batchSize: 32,
  prioritized: true,
  alpha: 0.6,
  beta: 0.4,
  betaIncrement: 0.001,
};

export class ExperienceReplayBuffer {
  private buffer: Experience[] = [];
  private priorities: number[] = [];
  private position = 0;
  private config: ReplayBufferConfig;
  private currentBeta: number;

  constructor(config: Partial<ReplayBufferConfig> = {}) {
    this.config = { ...DEFAULT_REPLAY_CONFIG, ...config };
    this.currentBeta = this.config.beta;
  }

  add(experience: Experience): void {
    const maxPriority = this.priorities.length > 0 ? Math.max(...this.priorities) : 1.0;

    if (this.buffer.length < this.config.maxSize) {
      this.buffer.push(experience);
      this.priorities.push(maxPriority);
    } else {
      this.buffer[this.position] = experience;
      this.priorities[this.position] = maxPriority;
    }

    this.position = (this.position + 1) % this.config.maxSize;
  }

  sample(): { experiences: Experience[]; indices: number[]; weights: number[] } {
    const n = Math.min(this.config.batchSize, this.buffer.length);

    if (!this.config.prioritized) {
      const indices: number[] = [];
      while (indices.length < n) {
        const idx = Math.floor(Math.random() * this.buffer.length);
        if (!indices.includes(idx)) indices.push(idx);
      }
      return {
        experiences: indices.map((i) => this.buffer[i]),
        indices,
        weights: new Array(n).fill(1.0),
      };
    }

    const probabilities = this.computeProbabilities();
    const indices: number[] = [];
    const weights: number[] = [];

    while (indices.length < n) {
      const rand = Math.random();
      let cumulative = 0;
      for (let i = 0; i < probabilities.length; i++) {
        cumulative += probabilities[i];
        if (rand < cumulative && !indices.includes(i)) {
          indices.push(i);
          const weight = Math.pow(this.buffer.length * probabilities[i], -this.currentBeta);
          weights.push(weight);
          break;
        }
      }
    }

    const maxWeight = Math.max(...weights);
    const normalizedWeights = weights.map((w) => w / maxWeight);
    this.currentBeta = Math.min(1.0, this.currentBeta + this.config.betaIncrement);

    return {
      experiences: indices.map((i) => this.buffer[i]),
      indices,
      weights: normalizedWeights,
    };
  }

  updatePriorities(indices: number[], tdErrors: number[]): void {
    for (let i = 0; i < indices.length; i++) {
      const priority = Math.pow(Math.abs(tdErrors[i]) + 1e-6, this.config.alpha);
      this.priorities[indices[i]] = priority;
    }
  }

  private computeProbabilities(): number[] {
    const sum = this.priorities.reduce((s, p) => s + p, 0);
    return this.priorities.map((p) => p / sum);
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
    this.priorities = [];
    this.position = 0;
  }
}

// ========== P1.1 优化：Target Network 配置 ==========

export interface TargetNetworkConfig {
  enabled: boolean;
  updateFrequency: number;
  softUpdateTau: number;
  useSoftUpdate: boolean;
}

const DEFAULT_TARGET_CONFIG: TargetNetworkConfig = {
  enabled: true,
  updateFrequency: 100,
  softUpdateTau: 0.005,
  useSoftUpdate: true,
};

@Injectable()
export class PolicyNetworkService {
  private readonly logger = new Logger(PolicyNetworkService.name);
  private config: PolicyNetworkConfig;
  private actionSpace: ActionSpace;
  private params: PolicyParameters;
  private targetParams: PolicyParameters | null = null;
  private stepCount = 0;
  private stateEncoder?: DifferentiableDecisionService;
  private replayBuffer: ExperienceReplayBuffer;
  private targetConfig: TargetNetworkConfig;

  constructor(@Optional() stateEncoder?: DifferentiableDecisionService) {
    this.config = DEFAULT_CONFIG;
    this.actionSpace = { actions: DEFAULT_ACTIONS };
    this.stateEncoder = stateEncoder;
    this.params = this.initializeParameters();
    this.replayBuffer = new ExperienceReplayBuffer();
    this.targetConfig = DEFAULT_TARGET_CONFIG;

    if (this.targetConfig.enabled) {
      this.initializeTargetNetwork();
    }
  }

  /**
   * 初始化 Target Network（P1.1 优化）
   */
  private initializeTargetNetwork(): void {
    this.targetParams = JSON.parse(JSON.stringify(this.params));
    this.logger.log('[PolicyNetwork] Target Network 已初始化');
  }

  /**
   * 配置 Target Network
   */
  configureTargetNetwork(config: Partial<TargetNetworkConfig>): void {
    this.targetConfig = { ...this.targetConfig, ...config };
    if (this.targetConfig.enabled && !this.targetParams) {
      this.initializeTargetNetwork();
    }
  }

  /**
   * 更新 Target Network（硬更新或软更新）
   */
  private updateTargetNetwork(): void {
    if (!this.targetConfig.enabled || !this.targetParams) return;

    if (this.targetConfig.useSoftUpdate) {
      this.softUpdateTarget();
    } else if (this.stepCount % this.targetConfig.updateFrequency === 0) {
      this.hardUpdateTarget();
    }
  }

  private softUpdateTarget(): void {
    const tau = this.targetConfig.softUpdateTau;
    for (let i = 0; i < this.params.W1.length; i++) {
      for (let j = 0; j < this.params.W1[i].length; j++) {
        this.targetParams!.W1[i][j] = tau * this.params.W1[i][j] + (1 - tau) * this.targetParams!.W1[i][j];
      }
      this.targetParams!.b1[i] = tau * this.params.b1[i] + (1 - tau) * this.targetParams!.b1[i];
    }
    for (let i = 0; i < this.params.W2.length; i++) {
      for (let j = 0; j < this.params.W2[i].length; j++) {
        this.targetParams!.W2[i][j] = tau * this.params.W2[i][j] + (1 - tau) * this.targetParams!.W2[i][j];
      }
      this.targetParams!.b2[i] = tau * this.params.b2[i] + (1 - tau) * this.targetParams!.b2[i];
    }
  }

  private hardUpdateTarget(): void {
    this.targetParams = JSON.parse(JSON.stringify(this.params));
    this.logger.debug(`[PolicyNetwork] Target Network 硬更新 (step=${this.stepCount})`);
  }

  /**
   * 添加经验到 Replay Buffer（P1.1 优化）
   */
  addExperience(experience: Experience): void {
    this.replayBuffer.add(experience);
  }

  /**
   * 从 Replay Buffer 训练（P1.1 优化）
   */
  trainFromReplay(
    discountFactor = 0.99,
  ): { loss: number; tdErrors: number[]; batchSize: number } | null {
    if (this.replayBuffer.size() < this.config.hiddenDim) {
      return null;
    }

    const { experiences, indices, weights } = this.replayBuffer.sample();
    const samples: PolicyTrainingSample[] = [];
    const tdErrors: number[] = [];

    for (let i = 0; i < experiences.length; i++) {
      const exp = experiences[i];
      let targetValue = exp.reward;

      if (!exp.done && exp.nextState && this.targetParams) {
        const nextStateFeatures = this.encodeState(exp.nextState);
        const hidden = this.forward(nextStateFeatures, this.targetParams.W1, this.targetParams.b1, 'relu');
        const nextLogits = this.forward(hidden, this.targetParams.W2, this.targetParams.b2, 'none');
        const nextProbs = this.softmax(nextLogits);
        const maxNextQ = Math.max(...nextProbs);
        targetValue = exp.reward + discountFactor * maxNextQ;
      }

      const stateFeatures = this.encodeState(exp.state);
      const hidden = this.forward(stateFeatures, this.params.W1, this.params.b1, 'relu');
      const logits = this.forward(hidden, this.params.W2, this.params.b2, 'none');
      const probs = this.softmax(logits);
      const actionIdx = this.actionSpace.actions.indexOf(exp.action);
      const currentQ = probs[actionIdx] ?? 0;

      const tdError = targetValue - currentQ;
      tdErrors.push(tdError);

      samples.push({
        state: exp.state,
        action: exp.action,
        reward: exp.reward,
        advantage: tdError * weights[i],
      });
    }

    const result = this.updatePolicy(samples);
    this.replayBuffer.updatePriorities(indices, tdErrors);
    this.updateTargetNetwork();

    return {
      loss: result.loss,
      tdErrors,
      batchSize: experiences.length,
    };
  }

  /**
   * 获取 Replay Buffer 统计
   */
  getReplayStats(): { size: number; capacity: number } {
    return {
      size: this.replayBuffer.size(),
      capacity: DEFAULT_REPLAY_CONFIG.maxSize,
    };
  }

  configure(config: Partial<PolicyNetworkConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setActionSpace(space: ActionSpace): void {
    this.actionSpace = space;
    this.params = this.initializeParameters();
  }

  computePolicy(state: DecisionState, explore = true): PolicyOutput {
    const stateFeatures = this.encodeState(state);
    const hidden = this.forward(stateFeatures, this.params.W1, this.params.b1, 'relu');
    const logits = this.forward(hidden, this.params.W2, this.params.b2, 'none');
    const temperature = this.getCurrentTemperature();
    const scaledLogits = logits.map(l => l / temperature);
    const probs = this.softmax(scaledLogits);
    
    const actionProbabilities = new Map<ActionType, number>();
    this.actionSpace.actions.forEach((action, i) => {
      actionProbabilities.set(action, probs[i] ?? 0);
    });
    
    const selectedAction = explore ? this.sampleAction(actionProbabilities) : this.greedyAction(actionProbabilities);
    const entropy = this.computeEntropy(probs);
    const confidence = Math.max(...probs);
    
    return { selectedAction, actionProbabilities, confidence, entropy };
  }

  updatePolicy(samples: PolicyTrainingSample[]): { loss: number; entropyLoss: number; gradientNorm: number } {
    if (samples.length === 0) return { loss: 0, entropyLoss: 0, gradientNorm: 0 };

    const baseline = samples.reduce((s, x) => s + x.reward, 0) / samples.length;
    const gradW1 = this.zeroMatrix(this.params.W1.length, this.params.W1[0].length);
    const gradb1 = new Array(this.params.b1.length).fill(0);
    const gradW2 = this.zeroMatrix(this.params.W2.length, this.params.W2[0].length);
    const gradb2 = new Array(this.params.b2.length).fill(0);
    
    let totalLoss = 0, totalEntropyLoss = 0;

    for (const sample of samples) {
      const stateFeatures = this.encodeState(sample.state);
      const hidden = this.forward(stateFeatures, this.params.W1, this.params.b1, 'relu');
      const logits = this.forward(hidden, this.params.W2, this.params.b2, 'none');
      const probs = this.softmax(logits);
      const actionIdx = this.actionSpace.actions.indexOf(sample.action);
      if (actionIdx === -1) continue;
      
      const advantage = sample.advantage ?? (sample.reward - baseline);
      const logProb = Math.log(Math.max(probs[actionIdx], 1e-10));
      totalLoss += -logProb * advantage;
      totalEntropyLoss -= this.config.entropyCoef * this.computeEntropy(probs);
      
      const dLogits = [...probs];
      dLogits[actionIdx] -= 1;
      const scaledDLogits = dLogits.map(d => d * advantage);
      this.accumulateGradients(stateFeatures, hidden, scaledDLogits, gradW1, gradb1, gradW2, gradb2);
    }

    const n = samples.length;
    this.scaleGradients(gradW1, gradb1, gradW2, gradb2, 1 / n);
    const gradientNorm = this.computeGradientNorm(gradW1, gradb1, gradW2, gradb2);
    if (gradientNorm > 1.0) this.scaleGradients(gradW1, gradb1, gradW2, gradb2, 1.0 / gradientNorm);
    this.applyGradients(gradW1, gradb1, gradW2, gradb2);
    this.stepCount++;

    return { loss: totalLoss / n, entropyLoss: totalEntropyLoss / n, gradientNorm };
  }

  getParameters(): PolicyParameters { return JSON.parse(JSON.stringify(this.params)); }
  setParameters(params: PolicyParameters): void { this.params = JSON.parse(JSON.stringify(params)); }
  getStepCount(): number { return this.stepCount; }

  private initializeParameters(): PolicyParameters {
    const inputDim = 24, hiddenDim = this.config.hiddenDim, outputDim = this.actionSpace.actions.length;
    return {
      W1: this.xavierInit(hiddenDim, inputDim),
      b1: new Array(hiddenDim).fill(0),
      W2: this.xavierInit(outputDim, hiddenDim),
      b2: new Array(outputDim).fill(0),
    };
  }

  private xavierInit(rows: number, cols: number): number[][] {
    const scale = Math.sqrt(2 / (rows + cols));
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale));
  }

  private encodeState(state: DecisionState): number[] {
    if (this.stateEncoder) return this.stateEncoder.encodeDSO(state).z;
    const features: number[] = [];
    const intent = state.userIntent;
    features.push((intent?.days ?? 1) / 30, intent?.mode === 'drive' ? 1 : 0, intent?.budget ? Math.min(1, intent.budget / 50000) : 0.5, intent?.flexibility ?? 0.5);
    const constraints = state.constraints;
    features.push(constraints?.feasible ? 1 : 0, Math.min(1, (constraints?.violations?.length ?? 0) / 5));
    const sys = state.systemState;
    features.push(sys?.confidence ?? 0.5, this.encodePhase(sys?.currentPhase));
    while (features.length < 24) features.push(0.5);
    return features.slice(0, 24);
  }

  private encodePhase(phase?: string): number {
    const map: Record<string, number> = { INTAKE: 0.1, RESEARCH: 0.2, GATE_EVAL: 0.3, PLAN_GEN: 0.5, OPTIMIZE: 0.6, VERIFY: 0.7, NARRATE: 0.8, DONE: 1.0 };
    return map[phase ?? ''] ?? 0.5;
  }

  private forward(input: number[], W: number[][], b: number[], activation: 'relu' | 'tanh' | 'none'): number[] {
    const output: number[] = [];
    for (let i = 0; i < W.length; i++) {
      let sum = b[i];
      for (let j = 0; j < input.length; j++) sum += W[i][j] * input[j];
      switch (activation) {
        case 'relu': output.push(Math.max(0, sum)); break;
        case 'tanh': output.push(Math.tanh(sum)); break;
        default: output.push(sum);
      }
    }
    return output;
  }

  private softmax(logits: number[]): number[] {
    const max = Math.max(...logits);
    const exps = logits.map(l => Math.exp(l - max));
    const sum = exps.reduce((s, e) => s + e, 0);
    return exps.map(e => e / sum);
  }

  private computeEntropy(probs: number[]): number {
    return -probs.filter(p => p > 0).reduce((sum, p) => sum + p * Math.log(p), 0);
  }

  private sampleAction(probs: Map<ActionType, number>): ActionType {
    const rand = Math.random();
    let cumulative = 0;
    for (const [action, prob] of probs) {
      cumulative += prob;
      if (rand < cumulative) return action;
    }
    return this.actionSpace.actions[0];
  }

  private greedyAction(probs: Map<ActionType, number>): ActionType {
    let maxProb = -1, bestAction = this.actionSpace.actions[0];
    for (const [action, prob] of probs) {
      if (prob > maxProb) { maxProb = prob; bestAction = action; }
    }
    return bestAction;
  }

  private getCurrentTemperature(): number {
    if (!this.config.useTemperatureAnnealing) return this.config.temperature;
    const initial = this.config.initialTemperature ?? 2.0, final = this.config.finalTemperature ?? 0.5, decaySteps = 10000;
    const progress = Math.min(this.stepCount / decaySteps, 1);
    return initial + (final - initial) * progress;
  }

  private zeroMatrix(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  private accumulateGradients(input: number[], hidden: number[], dLogits: number[], gradW1: number[][], gradb1: number[], gradW2: number[][], gradb2: number[]): void {
    for (let i = 0; i < gradW2.length; i++) {
      for (let j = 0; j < hidden.length; j++) gradW2[i][j] += dLogits[i] * hidden[j];
      gradb2[i] += dLogits[i];
    }
    for (let j = 0; j < hidden.length; j++) {
      let dHidden = 0;
      for (let i = 0; i < dLogits.length; i++) dHidden += this.params.W2[i][j] * dLogits[i];
      if (hidden[j] <= 0) dHidden = 0;
      for (let k = 0; k < input.length; k++) gradW1[j][k] += dHidden * input[k];
      gradb1[j] += dHidden;
    }
  }

  private scaleGradients(gradW1: number[][], gradb1: number[], gradW2: number[][], gradb2: number[], scale: number): void {
    for (const row of gradW1) for (let j = 0; j < row.length; j++) row[j] *= scale;
    for (let i = 0; i < gradb1.length; i++) gradb1[i] *= scale;
    for (const row of gradW2) for (let j = 0; j < row.length; j++) row[j] *= scale;
    for (let i = 0; i < gradb2.length; i++) gradb2[i] *= scale;
  }

  private computeGradientNorm(gradW1: number[][], gradb1: number[], gradW2: number[][], gradb2: number[]): number {
    let sum = 0;
    for (const row of gradW1) for (const v of row) sum += v * v;
    for (const v of gradb1) sum += v * v;
    for (const row of gradW2) for (const v of row) sum += v * v;
    for (const v of gradb2) sum += v * v;
    return Math.sqrt(sum);
  }

  private applyGradients(gradW1: number[][], gradb1: number[], gradW2: number[][], gradb2: number[]): void {
    const lr = this.config.learningRate;
    for (let i = 0; i < this.params.W1.length; i++) {
      for (let j = 0; j < this.params.W1[i].length; j++) this.params.W1[i][j] -= lr * gradW1[i][j];
      this.params.b1[i] -= lr * gradb1[i];
    }
    for (let i = 0; i < this.params.W2.length; i++) {
      for (let j = 0; j < this.params.W2[i].length; j++) this.params.W2[i][j] -= lr * gradW2[i][j];
      this.params.b2[i] -= lr * gradb2[i];
    }
  }
}
