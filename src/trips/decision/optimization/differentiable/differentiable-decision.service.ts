/**
 * 可微决策服务
 *
 * 顶级强化方向 ③：可微决策架构
 * z = f_θ(DSO), ∇_θ U → 端到端可训练决策系统
 *
 * 专利实现：
 * - MLP 编码器将 DSO 映射到潜在空间
 * - 可学习参数 θ 支持梯度下降优化
 * - 支持批量训练和在线更新
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.11.3
 */

import { Injectable, Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import {
  IDifferentiableDecisionService,
  DSOEmbedding,
} from './differentiable-decision.interface';

// ========== 配置常量 ==========

const INPUT_DIM = 24;       // DSO 特征维度
const HIDDEN_DIM = 16;      // 隐藏层维度
const EMBEDDING_DIM = 8;    // 输出嵌入维度
const GRADIENT_EPS = 1e-5;  // 数值梯度步长
const DEFAULT_LEARNING_RATE = 0.01;

// ========== 神经网络层接口 ==========

interface LayerWeights {
  W: number[][];  // 权重矩阵 [out_dim, in_dim]
  b: number[];    // 偏置向量 [out_dim]
}

interface ForwardCache {
  input: number[];
  preActivation: number[];
  output: number[];
}

interface NetworkParameters {
  layer1: LayerWeights;
  layer2: LayerWeights;
  utilityWeights: number[];
}

interface TrainingConfig {
  learningRate: number;
  momentum?: number;
  weightDecay?: number;
  clipGradient?: number;
}

interface TrainingResult {
  loss: number;
  gradientNorm: number;
  parametersUpdated: boolean;
}

@Injectable()
export class DifferentiableDecisionService implements IDifferentiableDecisionService {
  private readonly logger = new Logger(DifferentiableDecisionService.name);

  // 网络参数
  private params: NetworkParameters;
  
  // 前向传播缓存（用于反向传播）
  private cache: { layer1: ForwardCache; layer2: ForwardCache } | null = null;
  
  // 动量（用于优化）
  private momentum: NetworkParameters | null = null;

  constructor() {
    this.params = this.initializeParameters();
    this.logger.log(`[DifferentiableDecision] 初始化 MLP 编码器: ${INPUT_DIM} → ${HIDDEN_DIM} → ${EMBEDDING_DIM}`);
  }

  // ========== 公开接口 ==========

  /**
   * 将 DSO 编码为紧凑表示 z = f_θ(DSO)
   * 
   * 架构：MLP(DSO_features) → z ∈ R^d
   */
  encodeDSO(dso: DecisionState): DSOEmbedding {
    // 1. 提取 DSO 特征
    const features = this.extractDSOFeatures(dso);
    
    // 2. 前向传播
    const { output: hidden, cache: cache1 } = this.forwardLayer(
      features,
      this.params.layer1,
      'relu',
    );
    
    const { output: z, cache: cache2 } = this.forwardLayer(
      hidden,
      this.params.layer2,
      'tanh',
    );
    
    // 缓存用于反向传播
    this.cache = { layer1: cache1, layer2: cache2 };
    
    return { z, dim: EMBEDDING_DIM };
  }

  /**
   * 计算效用 U(z) = σ(w · z + b)
   */
  computeUtility(z: number[]): number {
    if (z.length === 0) return 0;
    
    const w = this.params.utilityWeights;
    let u = 0;
    for (let i = 0; i < Math.min(z.length, w.length); i++) {
      u += w[i] * (z[i] ?? 0);
    }
    
    // Sigmoid 激活确保输出在 [0, 1]
    return this.sigmoid(u);
  }

  /**
   * 计算梯度 ∇_z U
   */
  computeGradient(z: number[]): number[] {
    const baseU = this.computeUtility(z);
    const grad: number[] = [];
    
    for (let i = 0; i < z.length; i++) {
      const zPlus = [...z];
      zPlus[i] = (z[i] ?? 0) + GRADIENT_EPS;
      const uPlus = this.computeUtility(zPlus);
      grad.push((uPlus - baseU) / GRADIENT_EPS);
    }
    
    return grad;
  }

  /**
   * 端到端训练：给定 (DSO, target_utility) 对，更新参数 θ
   * 
   * 专利实现：θ_{k+1} = θ_k − η ∇_θ L
   */
  train(
    samples: Array<{ dso: DecisionState; targetUtility: number }>,
    config: TrainingConfig = { learningRate: DEFAULT_LEARNING_RATE },
  ): TrainingResult {
    if (samples.length === 0) {
      return { loss: 0, gradientNorm: 0, parametersUpdated: false };
    }

    // 初始化梯度累加器
    const gradAccum = this.zeroGradients();
    let totalLoss = 0;

    // 批量前向 + 反向
    for (const { dso, targetUtility } of samples) {
      // 前向传播
      const embedding = this.encodeDSO(dso);
      const predictedUtility = this.computeUtility(embedding.z);
      
      // 计算损失 L = (U - U*)²
      const loss = Math.pow(predictedUtility - targetUtility, 2);
      totalLoss += loss;
      
      // 反向传播（梯度累加）
      this.backwardPass(
        embedding.z,
        predictedUtility,
        targetUtility,
        gradAccum,
      );
    }

    // 平均梯度
    const batchSize = samples.length;
    this.scaleGradients(gradAccum, 1 / batchSize);

    // 梯度裁剪
    const gradNorm = this.computeGradientNorm(gradAccum);
    if (config.clipGradient && gradNorm > config.clipGradient) {
      this.scaleGradients(gradAccum, config.clipGradient / gradNorm);
    }

    // 参数更新（带动量）
    this.updateParameters(gradAccum, config);

    const avgLoss = totalLoss / batchSize;
    this.logger.debug(
      `[DifferentiableDecision] 训练完成: loss=${avgLoss.toFixed(4)}, gradNorm=${gradNorm.toFixed(4)}`,
    );

    return {
      loss: avgLoss,
      gradientNorm: gradNorm,
      parametersUpdated: true,
    };
  }

  /**
   * 获取当前参数（用于保存）
   */
  getParameters(): NetworkParameters {
    return JSON.parse(JSON.stringify(this.params));
  }

  /**
   * 设置参数（用于加载）
   */
  setParameters(params: NetworkParameters): void {
    this.params = JSON.parse(JSON.stringify(params));
    this.logger.log('[DifferentiableDecision] 参数已加载');
  }

  // ========== DSO 特征提取 ==========

  private extractDSOFeatures(dso: DecisionState): number[] {
    const features: number[] = [];
    
    // 用户意图特征 (6 维)
    const intent = dso.userIntent ?? {};
    features.push((intent.days ?? 1) / 30);                                    // 行程天数
    features.push(intent.mode === 'drive' ? 1 : intent.mode === 'transit' ? 0.5 : 0);
    features.push(intent.budget ? Math.min(1, intent.budget / 50000) : 0.5);   // 预算
    features.push(intent.flexibility ?? 0.5);
    features.push(intent.fitnessLevel ?? 0.5);
    features.push(intent.riskTolerance ?? 0.5);

    // 约束状态特征 (4 维)
    const constraints = dso.constraints;
    features.push(constraints?.feasible ? 1 : 0);
    features.push(Math.min(1, (constraints?.violations?.length ?? 0) / 5));
    features.push((constraints?.hardViolationCount ?? 0) > 0 ? 0 : 1);
    features.push(constraints?.softSatisfactionRate ?? 0.8);

    // 行程状态特征 (4 维)
    const tripState = dso.tripState ?? {};
    const planDraft = tripState.planDraft as { days?: unknown[]; activities?: unknown[] } | undefined;
    features.push(Math.min(1, (planDraft?.days?.length ?? 0) / 14));
    features.push(Math.min(1, (planDraft?.activities?.length ?? 0) / 50));
    features.push(tripState.completionRate ?? 0);
    features.push(tripState.qualityScore ?? 0.5);

    // 环境状态特征 (6 维)
    const env = dso.environmentState ?? {};
    features.push(env.weatherRisk ?? 0.2);
    features.push(env.failureRiskLevel === 'HIGH' ? 1 : env.failureRiskLevel === 'MEDIUM' ? 0.5 : 0);
    features.push(env.seasonScore ?? 0.7);
    features.push(env.accessibilityScore ?? 0.8);
    features.push(env.crowdLevel ?? 0.3);
    features.push(env.priceLevel ?? 0.5);

    // 系统状态特征 (4 维)
    const sys = dso.systemState;
    features.push(this.encodePhase(sys?.currentPhase));
    features.push(sys?.confidence ?? 0.5);
    features.push(Math.min(1, (sys?.version ?? 1) / 20));
    features.push(sys?.iterationCount ? Math.min(1, sys.iterationCount / 10) : 0);

    // 填充到固定维度
    while (features.length < INPUT_DIM) {
      features.push(0.5);
    }

    return features.slice(0, INPUT_DIM);
  }

  private encodePhase(phase?: string): number {
    const phaseMap: Record<string, number> = {
      INTAKE: 0.1,
      RESEARCH: 0.2,
      GATE_EVAL: 0.3,
      CONTEXT_BUILD: 0.4,
      PLAN_GEN: 0.5,
      OPTIMIZE: 0.6,
      VERIFY: 0.7,
      NARRATE: 0.8,
      DONE: 1.0,
    };
    return phaseMap[phase ?? ''] ?? 0.5;
  }

  // ========== 神经网络操作 ==========

  private initializeParameters(): NetworkParameters {
    // Xavier 初始化
    const initWeight = (outDim: number, inDim: number): number[][] => {
      const scale = Math.sqrt(2 / (inDim + outDim));
      return Array.from({ length: outDim }, () =>
        Array.from({ length: inDim }, () => (Math.random() * 2 - 1) * scale),
      );
    };

    return {
      layer1: {
        W: initWeight(HIDDEN_DIM, INPUT_DIM),
        b: Array(HIDDEN_DIM).fill(0),
      },
      layer2: {
        W: initWeight(EMBEDDING_DIM, HIDDEN_DIM),
        b: Array(EMBEDDING_DIM).fill(0),
      },
      utilityWeights: Array.from({ length: EMBEDDING_DIM }, () =>
        (Math.random() * 2 - 1) * Math.sqrt(2 / EMBEDDING_DIM),
      ),
    };
  }

  private forwardLayer(
    input: number[],
    layer: LayerWeights,
    activation: 'relu' | 'tanh' | 'none',
  ): { output: number[]; cache: ForwardCache } {
    const { W, b } = layer;
    const preActivation: number[] = [];

    // 线性变换: z = Wx + b
    for (let i = 0; i < W.length; i++) {
      let sum = b[i];
      for (let j = 0; j < input.length; j++) {
        sum += W[i][j] * input[j];
      }
      preActivation.push(sum);
    }

    // 激活函数
    const output = preActivation.map(z => {
      switch (activation) {
        case 'relu': return Math.max(0, z);
        case 'tanh': return Math.tanh(z);
        default: return z;
      }
    });

    return {
      output,
      cache: { input, preActivation, output },
    };
  }

  private backwardPass(
    z: number[],
    predicted: number,
    target: number,
    gradAccum: NetworkParameters,
  ): void {
    if (!this.cache) return;

    // dL/dU = 2(U - U*)
    const dLdU = 2 * (predicted - target);
    
    // dU/dz = U(1-U) * w (sigmoid derivative)
    const sigmoidGrad = predicted * (1 - predicted);
    const dLdz = this.params.utilityWeights.map(w => dLdU * sigmoidGrad * w);

    // 更新 utility weights 梯度
    for (let i = 0; i < z.length; i++) {
      gradAccum.utilityWeights[i] += dLdU * sigmoidGrad * z[i];
    }

    // Layer 2 反向传播
    const { layer1: cache1, layer2: cache2 } = this.cache;
    const dLdHidden = this.backwardLayer(
      dLdz,
      cache2,
      this.params.layer2,
      gradAccum.layer2,
      'tanh',
    );

    // Layer 1 反向传播
    this.backwardLayer(
      dLdHidden,
      cache1,
      this.params.layer1,
      gradAccum.layer1,
      'relu',
    );
  }

  private backwardLayer(
    dLdOutput: number[],
    cache: ForwardCache,
    layer: LayerWeights,
    gradAccum: LayerWeights,
    activation: 'relu' | 'tanh' | 'none',
  ): number[] {
    const { input, preActivation, output } = cache;

    // 激活函数导数
    const dActivation = preActivation.map((z, i) => {
      switch (activation) {
        case 'relu': return output[i] > 0 ? 1 : 0;
        case 'tanh': return 1 - output[i] * output[i];
        default: return 1;
      }
    });

    // dL/dPreAct = dL/dOutput * dActivation/dPreAct
    const dLdPreAct = dLdOutput.map((d, i) => d * dActivation[i]);

    // 更新权重梯度: dL/dW = dL/dPreAct * input^T
    for (let i = 0; i < layer.W.length; i++) {
      for (let j = 0; j < input.length; j++) {
        gradAccum.W[i][j] += dLdPreAct[i] * input[j];
      }
      gradAccum.b[i] += dLdPreAct[i];
    }

    // 计算输入梯度: dL/dInput = W^T * dL/dPreAct
    const dLdInput: number[] = Array(input.length).fill(0);
    for (let j = 0; j < input.length; j++) {
      for (let i = 0; i < layer.W.length; i++) {
        dLdInput[j] += layer.W[i][j] * dLdPreAct[i];
      }
    }

    return dLdInput;
  }

  private zeroGradients(): NetworkParameters {
    return {
      layer1: {
        W: this.params.layer1.W.map(row => row.map(() => 0)),
        b: this.params.layer1.b.map(() => 0),
      },
      layer2: {
        W: this.params.layer2.W.map(row => row.map(() => 0)),
        b: this.params.layer2.b.map(() => 0),
      },
      utilityWeights: this.params.utilityWeights.map(() => 0),
    };
  }

  private scaleGradients(grad: NetworkParameters, scale: number): void {
    for (const layer of [grad.layer1, grad.layer2]) {
      for (let i = 0; i < layer.W.length; i++) {
        for (let j = 0; j < layer.W[i].length; j++) {
          layer.W[i][j] *= scale;
        }
        layer.b[i] *= scale;
      }
    }
    for (let i = 0; i < grad.utilityWeights.length; i++) {
      grad.utilityWeights[i] *= scale;
    }
  }

  private computeGradientNorm(grad: NetworkParameters): number {
    let sumSquared = 0;
    for (const layer of [grad.layer1, grad.layer2]) {
      for (const row of layer.W) {
        for (const w of row) {
          sumSquared += w * w;
        }
      }
      for (const b of layer.b) {
        sumSquared += b * b;
      }
    }
    for (const w of grad.utilityWeights) {
      sumSquared += w * w;
    }
    return Math.sqrt(sumSquared);
  }

  private updateParameters(grad: NetworkParameters, config: TrainingConfig): void {
    const { learningRate, momentum: momentumCoef = 0.9, weightDecay = 0 } = config;

    // 初始化动量
    if (!this.momentum) {
      this.momentum = this.zeroGradients();
    }

    // 更新各层
    for (const [key, layer] of [
      ['layer1', this.params.layer1] as const,
      ['layer2', this.params.layer2] as const,
    ]) {
      const gradLayer = grad[key];
      const momLayer = this.momentum[key];

      for (let i = 0; i < layer.W.length; i++) {
        for (let j = 0; j < layer.W[i].length; j++) {
          // 动量更新
          momLayer.W[i][j] = momentumCoef * momLayer.W[i][j] + gradLayer.W[i][j];
          // 权重衰减 + 参数更新
          layer.W[i][j] -= learningRate * (momLayer.W[i][j] + weightDecay * layer.W[i][j]);
        }
        momLayer.b[i] = momentumCoef * momLayer.b[i] + gradLayer.b[i];
        layer.b[i] -= learningRate * momLayer.b[i];
      }
    }

    // 更新效用权重
    for (let i = 0; i < this.params.utilityWeights.length; i++) {
      this.momentum.utilityWeights[i] =
        momentumCoef * this.momentum.utilityWeights[i] + grad.utilityWeights[i];
      this.params.utilityWeights[i] -=
        learningRate * (this.momentum.utilityWeights[i] + weightDecay * this.params.utilityWeights[i]);
    }
  }

  // ========== 辅助函数 ==========

  private sigmoid(x: number): number {
    if (x > 20) return 1;
    if (x < -20) return 0;
    return 1 / (1 + Math.exp(-x));
  }
}
