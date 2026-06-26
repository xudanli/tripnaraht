// Round 3: Shapley Attribution Service
// 基于 Shapley Value 的决策归因引擎
// 参考: SCAR (2025), C-SHAP (2025)

import { Injectable, Logger } from '@nestjs/common';
import {
  DecisionNode,
  DecisionNodeType,
  ShapleyAttribution,
} from './types/self-evolution.types';

/**
 * Shapley 归因配置
 */
interface ShapleyConfig {
  exactThreshold: number; // 精确计算的最大节点数
  sampleSize: number; // C-SHAP 采样大小
  clusterCount: number; // 聚类数量
}

@Injectable()
export class ShapleyAttributionService {
  private readonly logger = new Logger(ShapleyAttributionService.name);
  private config: ShapleyConfig = {
    exactThreshold: 7, // 7 个节点以内使用精确计算
    sampleSize: 1000, // C-SHAP 采样 1000 次
    clusterCount: 5, // 聚类为 5 组
  };

  /**
   * 计算决策节点的 Shapley Value
   * @param decisionNodes 决策节点列表
   * @param outcome 总体结果分数 (0-1)
   * @param context 上下文信息（用于评估子集结果）
   * @returns 各节点的 Shapley Value 归因结果
   */
  async calculateShapley(
    decisionNodes: DecisionNode[],
    outcome: number,
    context?: any,
  ): Promise<ShapleyAttribution[]> {
    const n = decisionNodes.length;

    // 根据节点数量选择计算方法
    if (n <= this.config.exactThreshold) {
      this.logger.log(`Using exact Shapley calculation for ${n} nodes`);
      return this.exactShapley(decisionNodes, outcome, context);
    }

    this.logger.log(`Using C-SHAP approximation for ${n} nodes`);
    return this.cShapApproximation(decisionNodes, outcome, context);
  }

  /**
   * 精确 Shapley Value 计算 (O(2^n))
   * 适用于节点数较少的情况 (n <= 7)
   */
  private exactShapley(
    decisionNodes: DecisionNode[],
    outcome: number,
    context?: any,
  ): ShapleyAttribution[] {
    const n = decisionNodes.length;
    const shapleyValues = new Map<string, number>();

    // 为每个节点计算 Shapley Value
    for (const node of decisionNodes) {
      let contribution = 0;
      const otherNodes = decisionNodes.filter(n => n.id !== node.id);
      const subsets = this.generateSubsets(otherNodes);

      // Shapley Value 公式: φ_i = (1/n!) * Σ_{S⊆N\{i}} |S|!(n-|S|-1)![v(S∪{i}) - v(S)]
      for (const subset of subsets) {
        const withNode = this.evaluateOutcome([...subset, node], context);
        const withoutNode = this.evaluateOutcome(subset, context);
        const subsetSize = subset.length;
        const weight =
          (this.factorial(subsetSize) * this.factorial(n - subsetSize - 1)) /
          this.factorial(n);
        contribution += weight * (withNode - withoutNode);
      }

      shapleyValues.set(node.id, contribution);
    }

    // 归一化到 0-1
    const total = Array.from(shapleyValues.values()).reduce((a, b) => a + b, 0);
    const normalized = new Map<string, number>();
    for (const [id, value] of shapleyValues) {
      normalized.set(id, total > 0 ? value / total : 1 / n);
    }

    // 构建结果
    return this.buildAttributionResults(decisionNodes, normalized, outcome);
  }

  /**
   * C-SHAP 近似计算
   * 通过聚类预计算 + 采样近似加速
   */
  private cShapApproximation(
    decisionNodes: DecisionNode[],
    outcome: number,
    context?: any,
  ): ShapleyAttribution[] {
    // 步骤 1: 聚类节点
    const clusters = this.clusterNodes(decisionNodes);

    // 步骤 2: 采样子集
    const samples = this.sampleSubsets(clusters, this.config.sampleSize);

    // 步骤 3: 估计 Shapley Value
    const shapleyValues = this.estimateShapleyFromSamples(
      decisionNodes,
      samples,
      context,
    );

    // 归一化
    const total = Array.from(shapleyValues.values()).reduce((a, b) => a + b, 0);
    const normalized = new Map<string, number>();
    for (const [id, value] of shapleyValues) {
      normalized.set(id, total > 0 ? value / total : 1 / decisionNodes.length);
    }

    return this.buildAttributionResults(decisionNodes, normalized, outcome);
  }

  /**
   * 生成所有子集
   */
  private generateSubsets(nodes: DecisionNode[]): DecisionNode[][] {
    const subsets: DecisionNode[][] = [[]];
    for (const node of nodes) {
      const currentLength = subsets.length;
      for (let i = 0; i < currentLength; i++) {
        subsets.push([...subsets[i], node]);
      }
    }
    return subsets;
  }

  /**
   * 评估给定节点集合的结果
   * 这是一个简化版本，实际应该基于历史数据或模型预测
   */
  private evaluateOutcome(nodes: DecisionNode[], context?: any): number {
    // 简化实现：基于节点类型和值的启发式评估
    // 实际应该使用机器学习模型或历史数据

    let score = 0.5; // 基准分数

    for (const node of nodes) {
      switch (node.type) {
        case DecisionNodeType.DESTINATION:
          score += 0.1;
          break;
        case DecisionNodeType.COMPANION:
          score += 0.15;
          break;
        case DecisionNodeType.BUDGET:
          score += 0.05;
          break;
        case DecisionNodeType.ITINERARY:
          score += 0.1;
          break;
        case DecisionNodeType.WEATHER_LUCK:
          score += 0.05;
          break;
        default:
          score += 0.05;
      }
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * 聚类节点（C-SHAP 第一步）
   */
  private clusterNodes(nodes: DecisionNode[]): Map<string, DecisionNode[]> {
    const clusters = new Map<string, DecisionNode[]>();

    // 简化实现：按类型聚类
    for (const node of nodes) {
      const clusterKey = node.type;
      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, []);
      }
      clusters.get(clusterKey)!.push(node);
    }

    return clusters;
  }

  /**
   * 采样子集（C-SHAP 第二步）
   */
  private sampleSubsets(
    clusters: Map<string, DecisionNode[]>,
    sampleSize: number,
  ): DecisionNode[][] {
    const samples: DecisionNode[][] = [];
    const allNodes = Array.from(clusters.values()).flat();

    for (let i = 0; i < sampleSize; i++) {
      // 随机采样子集
      const subsetSize = Math.floor(Math.random() * allNodes.length);
      const shuffled = [...allNodes].sort(() => Math.random() - 0.5);
      samples.push(shuffled.slice(0, subsetSize));
    }

    return samples;
  }

  /**
   * 从采样估计 Shapley Value
   */
  private estimateShapleyFromSamples(
    decisionNodes: DecisionNode[],
    samples: DecisionNode[][],
    context?: any,
  ): Map<string, number> {
    const shapleyValues = new Map<string, number>();
    const n = decisionNodes.length;

    // 初始化
    for (const node of decisionNodes) {
      shapleyValues.set(node.id, 0);
    }

    // 计算边际贡献
    for (const sample of samples) {
      for (const node of decisionNodes) {
        const withNode = this.evaluateOutcome([...sample, node], context);
        const withoutNode = this.evaluateOutcome(sample, context);
        const contribution = (withNode - withoutNode) / n;
        shapleyValues.set(
          node.id,
          (shapleyValues.get(node.id) || 0) + contribution,
        );
      }
    }

    // 平均
    for (const [id, value] of shapleyValues) {
      shapleyValues.set(id, value / samples.length);
    }

    return shapleyValues;
  }

  /**
   * 构建归因结果
   */
  private buildAttributionResults(
    decisionNodes: DecisionNode[],
    shapleyValues: Map<string, number>,
    outcome: number,
  ): ShapleyAttribution[] {
    const results: ShapleyAttribution[] = [];

    for (const node of decisionNodes) {
      const value = shapleyValues.get(node.id) || 0;
      results.push({
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        shapleyValue: value,
        rank: 0, // 稍后排序
        confidence: this.calculateConfidence(value, outcome),
        marginalContribution: value * outcome,
      });
    }

    // 按贡献排序
    results.sort((a, b) => b.shapleyValue - a.shapleyValue);
    results.forEach((r, i) => (r.rank = i + 1));

    return results;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(shapleyValue: number, outcome: number): number {
    // 简化实现：基于 Shapley Value 和结果的置信度
    // 实际应该基于采样方差或模型不确定性
    const baseConfidence = 0.7;
    const valueWeight = Math.abs(shapleyValue);
    const outcomeWeight = outcome;

    return Math.min(1, baseConfidence + valueWeight * 0.2 + outcomeWeight * 0.1);
  }

  /**
   * 阶乘计算
   */
  private factorial(n: number): number {
    if (n <= 1) return 1;
    return n * this.factorial(n - 1);
  }

  /**
   * 组合数计算 C(n, k)
   */
  private combinations(n: number, k: number): number {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;
    return this.factorial(n) / (this.factorial(k) * this.factorial(n - k));
  }

  /**
   * 获取 Top-K 归因结果
   */
  getTopK(attributions: ShapleyAttribution[], k: number): ShapleyAttribution[] {
    return attributions.slice(0, k);
  }

  /**
   * 按节点类型过滤归因结果
   */
  filterByType(
    attributions: ShapleyAttribution[],
    type: DecisionNodeType,
  ): ShapleyAttribution[] {
    return attributions.filter(a => a.nodeType === type);
  }

  /**
   * 计算归因分布统计
   */
  getAttributionStats(attributions: ShapleyAttribution[]) {
    const values = attributions.map(a => a.shapleyValue);
    return {
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      std: Math.sqrt(
        values.reduce((sum, v) => sum + Math.pow(v - values[0], 2), 0) /
          values.length,
      ),
      min: Math.min(...values),
      max: Math.max(...values),
      entropy: this.calculateEntropy(values),
    };
  }

  /**
   * 计算熵（衡量归因分布的均匀性）
   */
  private calculateEntropy(values: number[]): number {
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;

    return -values.reduce((entropy, v) => {
      const p = v / sum;
      return entropy + (p > 0 ? p * Math.log2(p) : 0);
    }, 0);
  }
}
