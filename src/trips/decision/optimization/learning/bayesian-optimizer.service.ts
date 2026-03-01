/**
 * 贝叶斯优化服务
 *
 * P1.2 优化：实现高斯过程 (GP) + Expected Improvement (EI)
 *
 * 用于权重学习和超参数优化
 * - 样本效率高于纯梯度下降
 * - 适合黑盒优化和代价高昂的函数评估
 *
 * 数学基础：
 * - GP: f(x) ~ GP(μ(x), k(x, x'))
 * - EI: EI(x) = E[max(f(x) - f(x*), 0)]
 */

import { Injectable, Logger } from '@nestjs/common';

export interface BayesianPoint {
  x: number[];
  y: number;
  variance?: number;
}

export interface GPConfig {
  lengthScale: number;
  signalVariance: number;
  noiseVariance: number;
  kernel: 'rbf' | 'matern32' | 'matern52';
}

export interface BayesianOptimizerConfig {
  dimensions: number;
  bounds: { min: number; max: number }[];
  gpConfig: Partial<GPConfig>;
  acquisitionFunction: 'ei' | 'ucb' | 'poi';
  explorationWeight: number;
  maxIterations: number;
  tolerance: number;
}

const DEFAULT_GP_CONFIG: GPConfig = {
  lengthScale: 1.0,
  signalVariance: 1.0,
  noiseVariance: 0.1,
  kernel: 'rbf',
};

const DEFAULT_OPTIMIZER_CONFIG: Partial<BayesianOptimizerConfig> = {
  acquisitionFunction: 'ei',
  explorationWeight: 0.01,
  maxIterations: 100,
  tolerance: 1e-6,
};

export interface AcquisitionResult {
  point: number[];
  acquisitionValue: number;
  mean: number;
  std: number;
}

export interface BayesianOptimizationResult {
  bestPoint: number[];
  bestValue: number;
  history: BayesianPoint[];
  convergenceInfo: {
    iterations: number;
    improvement: number;
    converged: boolean;
  };
}

@Injectable()
export class BayesianOptimizerService {
  private readonly logger = new Logger(BayesianOptimizerService.name);
  private observations: BayesianPoint[] = [];
  private config: BayesianOptimizerConfig;
  private gpConfig: GPConfig;
  private covarianceMatrix: number[][] | null = null;
  private covarianceInverse: number[][] | null = null;

  constructor() {
    this.config = {
      dimensions: 1,
      bounds: [{ min: 0, max: 1 }],
      gpConfig: DEFAULT_GP_CONFIG,
      ...DEFAULT_OPTIMIZER_CONFIG,
    } as BayesianOptimizerConfig;
    this.gpConfig = { ...DEFAULT_GP_CONFIG };
  }

  /**
   * 配置优化器
   */
  configure(config: Partial<BayesianOptimizerConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.gpConfig) {
      this.gpConfig = { ...this.gpConfig, ...config.gpConfig };
    }
    this.invalidateCache();
  }

  /**
   * 添加观测点
   */
  addObservation(x: number[], y: number): void {
    this.observations.push({ x, y });
    this.invalidateCache();
    this.logger.debug(`[BayesianOpt] 添加观测: x=${JSON.stringify(x)}, y=${y.toFixed(4)}`);
  }

  /**
   * 批量添加观测
   */
  addObservations(points: BayesianPoint[]): void {
    for (const point of points) {
      this.observations.push(point);
    }
    this.invalidateCache();
  }

  /**
   * 预测给定点的均值和方差
   */
  predict(x: number[]): { mean: number; variance: number; std: number } {
    if (this.observations.length === 0) {
      return { mean: 0, variance: this.gpConfig.signalVariance, std: Math.sqrt(this.gpConfig.signalVariance) };
    }

    this.ensureCovarianceComputed();

    const kStar = this.observations.map((obs) => this.kernel(x, obs.x));
    const kStarStar = this.kernel(x, x);

    const alpha = this.matrixVectorMultiply(this.covarianceInverse!, this.observations.map((o) => o.y));
    const mean = this.dotProduct(kStar, alpha);

    const v = this.matrixVectorMultiply(this.covarianceInverse!, kStar);
    const variance = Math.max(0, kStarStar - this.dotProduct(kStar, v));

    return { mean, variance, std: Math.sqrt(variance) };
  }

  /**
   * 计算 Expected Improvement (EI)
   */
  computeExpectedImprovement(x: number[]): number {
    if (this.observations.length === 0) {
      return this.gpConfig.signalVariance;
    }

    const bestY = Math.max(...this.observations.map((o) => o.y));
    const { mean, std } = this.predict(x);

    if (std < 1e-10) {
      return mean > bestY ? mean - bestY : 0;
    }

    const z = (mean - bestY - this.config.explorationWeight) / std;
    const ei = (mean - bestY - this.config.explorationWeight) * this.normalCDF(z) + std * this.normalPDF(z);

    return Math.max(0, ei);
  }

  /**
   * 计算 Upper Confidence Bound (UCB)
   */
  computeUCB(x: number[], beta = 2.0): number {
    const { mean, std } = this.predict(x);
    return mean + beta * std;
  }

  /**
   * 计算 Probability of Improvement (POI)
   */
  computePOI(x: number[]): number {
    if (this.observations.length === 0) {
      return 0.5;
    }

    const bestY = Math.max(...this.observations.map((o) => o.y));
    const { mean, std } = this.predict(x);

    if (std < 1e-10) {
      return mean > bestY ? 1 : 0;
    }

    const z = (mean - bestY - this.config.explorationWeight) / std;
    return this.normalCDF(z);
  }

  /**
   * 建议下一个采样点
   */
  suggestNextPoint(numCandidates = 1000): AcquisitionResult {
    let bestCandidate: number[] = [];
    let bestAcquisition = -Infinity;
    let bestMean = 0;
    let bestStd = 0;

    for (let i = 0; i < numCandidates; i++) {
      const candidate = this.sampleRandomPoint();
      let acquisitionValue: number;

      switch (this.config.acquisitionFunction) {
        case 'ei':
          acquisitionValue = this.computeExpectedImprovement(candidate);
          break;
        case 'ucb':
          acquisitionValue = this.computeUCB(candidate);
          break;
        case 'poi':
          acquisitionValue = this.computePOI(candidate);
          break;
        default:
          acquisitionValue = this.computeExpectedImprovement(candidate);
      }

      if (acquisitionValue > bestAcquisition) {
        bestAcquisition = acquisitionValue;
        bestCandidate = candidate;
        const pred = this.predict(candidate);
        bestMean = pred.mean;
        bestStd = pred.std;
      }
    }

    return {
      point: bestCandidate,
      acquisitionValue: bestAcquisition,
      mean: bestMean,
      std: bestStd,
    };
  }

  /**
   * 运行优化循环
   */
  async optimize(
    objectiveFunction: (x: number[]) => Promise<number>,
    initialPoints?: BayesianPoint[],
  ): Promise<BayesianOptimizationResult> {
    if (initialPoints) {
      this.addObservations(initialPoints);
    } else if (this.observations.length === 0) {
      const numInitial = Math.max(2, this.config.dimensions + 1);
      for (let i = 0; i < numInitial; i++) {
        const x = this.sampleRandomPoint();
        const y = await objectiveFunction(x);
        this.addObservation(x, y);
      }
    }

    let bestValue = Math.max(...this.observations.map((o) => o.y));
    let bestPoint = this.observations.find((o) => o.y === bestValue)?.x ?? [];
    let converged = false;
    let iterations = 0;

    for (let i = 0; i < this.config.maxIterations; i++) {
      iterations++;
      const suggestion = this.suggestNextPoint();

      if (suggestion.acquisitionValue < this.config.tolerance) {
        converged = true;
        break;
      }

      const y = await objectiveFunction(suggestion.point);
      this.addObservation(suggestion.point, y);

      if (y > bestValue) {
        const improvement = y - bestValue;
        bestValue = y;
        bestPoint = suggestion.point;
        this.logger.debug(
          `[BayesianOpt] 迭代 ${i + 1}: 新最优值 ${bestValue.toFixed(4)}, 提升 ${improvement.toFixed(4)}`,
        );
      }
    }

    return {
      bestPoint,
      bestValue,
      history: [...this.observations],
      convergenceInfo: {
        iterations,
        improvement: bestValue - (initialPoints?.[0]?.y ?? 0),
        converged,
      },
    };
  }

  /**
   * 获取当前最优点
   */
  getBestObservation(): BayesianPoint | null {
    if (this.observations.length === 0) return null;
    return this.observations.reduce((best, curr) => (curr.y > best.y ? curr : best));
  }

  /**
   * 重置优化器
   */
  reset(): void {
    this.observations = [];
    this.invalidateCache();
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    numObservations: number;
    bestValue: number | null;
    meanValue: number | null;
    stdValue: number | null;
  } {
    if (this.observations.length === 0) {
      return { numObservations: 0, bestValue: null, meanValue: null, stdValue: null };
    }

    const values = this.observations.map((o) => o.y);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;

    return {
      numObservations: this.observations.length,
      bestValue: Math.max(...values),
      meanValue: mean,
      stdValue: Math.sqrt(variance),
    };
  }

  // ========== 私有方法 ==========

  private invalidateCache(): void {
    this.covarianceMatrix = null;
    this.covarianceInverse = null;
  }

  private ensureCovarianceComputed(): void {
    if (this.covarianceMatrix !== null) return;

    const n = this.observations.length;
    this.covarianceMatrix = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        this.covarianceMatrix[i][j] = this.kernel(this.observations[i].x, this.observations[j].x);
        if (i === j) {
          this.covarianceMatrix[i][j] += this.gpConfig.noiseVariance;
        }
      }
    }

    this.covarianceInverse = this.invertMatrix(this.covarianceMatrix);
  }

  private kernel(x1: number[], x2: number[]): number {
    const sqDist = x1.reduce((sum, _, i) => sum + (x1[i] - x2[i]) ** 2, 0);

    switch (this.gpConfig.kernel) {
      case 'rbf':
        return this.gpConfig.signalVariance * Math.exp(-sqDist / (2 * this.gpConfig.lengthScale ** 2));

      case 'matern32': {
        const r = Math.sqrt(sqDist) / this.gpConfig.lengthScale;
        return this.gpConfig.signalVariance * (1 + Math.sqrt(3) * r) * Math.exp(-Math.sqrt(3) * r);
      }

      case 'matern52': {
        const r = Math.sqrt(sqDist) / this.gpConfig.lengthScale;
        return (
          this.gpConfig.signalVariance *
          (1 + Math.sqrt(5) * r + (5 * r * r) / 3) *
          Math.exp(-Math.sqrt(5) * r)
        );
      }

      default:
        return this.gpConfig.signalVariance * Math.exp(-sqDist / (2 * this.gpConfig.lengthScale ** 2));
    }
  }

  private sampleRandomPoint(): number[] {
    return this.config.bounds.map((bound) => bound.min + Math.random() * (bound.max - bound.min));
  }

  private normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, _, i) => sum + a[i] * b[i], 0);
  }

  private matrixVectorMultiply(matrix: number[][], vector: number[]): number[] {
    return matrix.map((row) => this.dotProduct(row, vector));
  }

  private invertMatrix(matrix: number[][]): number[][] {
    const n = matrix.length;
    const augmented: number[][] = matrix.map((row, i) => [
      ...row,
      ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    ]);

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      const pivot = augmented[i][i];
      if (Math.abs(pivot) < 1e-10) {
        for (let j = 0; j < 2 * n; j++) {
          augmented[i][j] = 0;
        }
        augmented[i][i] = 1;
        augmented[i][n + i] = 0;
        continue;
      }

      for (let j = 0; j < 2 * n; j++) {
        augmented[i][j] /= pivot;
      }

      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = augmented[k][i];
          for (let j = 0; j < 2 * n; j++) {
            augmented[k][j] -= factor * augmented[i][j];
          }
        }
      }
    }

    return augmented.map((row) => row.slice(n));
  }
}
