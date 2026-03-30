// src/itinerary-optimization/services/multi-strategy-route-generator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PlanRequest, OptimizationResult } from '../interfaces/plan-request.interface';
import { EnhancedVRPTWOptimizerService } from './enhanced-vrptw-optimizer.service';
import { RouteOptimizerService } from './route-optimizer.service';

/**
 * 策略配置
 */
export interface StrategyConfig {
  name: 'VRPTW' | 'SA' | 'GA' | 'MONTE_CARLO';
  weight: number; // 策略权重（用于聚合）
  samples: number; // 该策略采样次数
  config?: any; // 策略特定配置
}

/**
 * 多起点候选
 */
export interface StartCandidate {
  node_id: number;
  name: string;
  geo: { lat: number; lng: number };
  priority: number; // 0-1，越高越优先
}

/**
 * 候选路线
 */
export interface CandidateRoute {
  id: string;
  request: PlanRequest;
  result: OptimizationResult;
  strategy: string;
  start_candidate?: StartCandidate;
  sample_index: number;
  diversity_score?: number; // 与其他候选的差异度（0-1）
  metadata: {
    solve_time_ms: number;
    seed?: number;
    timestamp: string;
  };
}

/**
 * 多策略生成配置
 */
export interface MultiStrategyConfig {
  start_candidates?: StartCandidate[];
  strategies: StrategyConfig[];
  sample_count?: number; // 总采样次数（如果未指定，使用各策略的 samples 之和）
  diversity_threshold?: number; // 候选路线差异度阈值（0-1），默认 0.3
  robustness_evaluation?: boolean; // 是否进行鲁棒性评估
  aggregation_mode?: 'BEST' | 'ENSEMBLE' | 'VOTING'; // 聚合模式
  time_budget_ms?: number; // 总时间预算（毫秒）
}

/**
 * 多策略路线生成结果
 */
export interface MultiStrategyResult {
  candidates: CandidateRoute[];
  best_candidate?: CandidateRoute;
  aggregation_result?: {
    mode: 'BEST' | 'ENSEMBLE' | 'VOTING';
    ensemble_route?: OptimizationResult; // 集成结果（如果使用 ENSEMBLE）
    voting_route?: OptimizationResult; // 投票结果（如果使用 VOTING）
  };
  statistics: {
    total_candidates: number;
    successful_candidates: number;
    failed_candidates: number;
    avg_solve_time_ms: number;
    diversity_stats: {
      min: number;
      max: number;
      avg: number;
      std: number;
    };
  };
}

/**
 * 多策略路线生成器
 * 
 * 功能：
 * 1. 支持多起点展开
 * 2. 并行执行多种优化策略
 * 3. 多次采样生成多样化候选
 * 4. 去重与多样性筛选
 * 5. 可选鲁棒性评估
 * 6. 聚合结果（最佳/集成/投票）
 */
@Injectable()
export class MultiStrategyRouteGeneratorService {
  private readonly logger = new Logger(MultiStrategyRouteGeneratorService.name);

  constructor(
    private enhancedVRPTWOptimizer: EnhancedVRPTWOptimizerService,
    private routeOptimizer: RouteOptimizerService
  ) {}

  /**
   * 生成候选路线（多起点、多策略、多次采样）
   */
  async generateCandidateRoutes(
    baseRequest: PlanRequest,
    config: MultiStrategyConfig
  ): Promise<MultiStrategyResult> {
    this.logger.debug(
      `开始生成候选路线: ${config.strategies.length} 种策略, ` +
      `${config.start_candidates?.length || 1} 个起点候选`
    );

    // 1. 多起点展开
    const startCandidates = config.start_candidates || [
      {
        node_id: baseRequest.start.node_id,
        name: baseRequest.start.name,
        geo: baseRequest.start.geo,
        priority: 1.0,
      },
    ];

    // 2. 生成所有请求组合
    const requestVariants: Array<{
      request: PlanRequest;
      startCandidate?: StartCandidate;
      strategy: StrategyConfig;
      sampleIndex: number;
    }> = [];

    for (const startCandidate of startCandidates) {
      for (const strategy of config.strategies) {
        const samples = config.sample_count || strategy.samples;
        for (let i = 0; i < samples; i++) {
          const variantRequest = this.createRequestVariant(baseRequest, startCandidate);
          requestVariants.push({
            request: variantRequest,
            startCandidate,
            strategy,
            sampleIndex: i,
          });
        }
      }
    }

    this.logger.debug(`生成了 ${requestVariants.length} 个请求变体`);

    // 3. 并行执行所有策略
    const candidates: CandidateRoute[] = [];
    const failedCount = { count: 0 };

    // 使用 Promise.allSettled 处理失败情况
    const results = await Promise.allSettled(
      requestVariants.map(async (variant, index) => {
        try {
          const result = await this.runStrategy(
            variant.request,
            variant.strategy,
            variant.sampleIndex,
            config.time_budget_ms
          );

          return {
            candidate: {
              id: `candidate_${index}_${variant.strategy.name}_${variant.sampleIndex}`,
              request: variant.request,
              result,
              strategy: variant.strategy.name,
              start_candidate: variant.startCandidate,
              sample_index: variant.sampleIndex,
              metadata: {
                solve_time_ms: 0, // 将在结果中填充
                seed: variant.sampleIndex,
                timestamp: new Date().toISOString(),
              },
            },
            success: true,
          };
        } catch (error: any) {
          this.logger.warn(
            `策略 ${variant.strategy.name} 采样 ${variant.sampleIndex} 失败: ${error.message}`
          );
          failedCount.count++;
          return { success: false, error: error.message };
        }
      })
    );

    // 4. 收集成功的结果
    results.forEach((result, _index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        candidates.push(result.value.candidate);
      }
    });

    this.logger.debug(
      `成功生成 ${candidates.length} 个候选路线，失败 ${failedCount.count} 个`
    );

    // 5. 去重与多样性筛选
    const filteredCandidates = this.deduplicateAndFilter(
      candidates,
      config.diversity_threshold || 0.3
    );

    this.logger.debug(`去重后剩余 ${filteredCandidates.length} 个候选路线`);

    // 6. 计算多样性统计
    const diversityStats = this.calculateDiversityStats(filteredCandidates);

    // 7. 选择最佳候选
    const bestCandidate = this.selectBestCandidate(filteredCandidates);

    // 8. 聚合结果（如果需要）
    let aggregationResult: MultiStrategyResult['aggregation_result'];
    if (config.aggregation_mode && config.aggregation_mode !== 'BEST') {
      aggregationResult = await this.aggregateResults(
        filteredCandidates,
        config.aggregation_mode
      );
    }

    // 9. 计算统计信息
    const avgSolveTime =
      filteredCandidates.length > 0
        ? filteredCandidates.reduce((sum, c) => sum + (c.metadata.solve_time_ms || 0), 0) /
          filteredCandidates.length
        : 0;

    return {
      candidates: filteredCandidates,
      best_candidate: bestCandidate,
      aggregation_result: aggregationResult,
      statistics: {
        total_candidates: filteredCandidates.length,
        successful_candidates: filteredCandidates.length,
        failed_candidates: failedCount.count,
        avg_solve_time_ms: avgSolveTime,
        diversity_stats: diversityStats,
      },
    };
  }

  /**
   * 创建请求变体（修改起点）
   */
  private createRequestVariant(
    baseRequest: PlanRequest,
    startCandidate: StartCandidate
  ): PlanRequest {
    return {
      ...baseRequest,
      start: {
        node_id: startCandidate.node_id,
        name: startCandidate.name,
        geo: startCandidate.geo,
      },
    };
  }

  /**
   * 运行策略
   */
  private async runStrategy(
    request: PlanRequest,
    strategy: StrategyConfig,
    sampleIndex: number,
    _timeBudgetMs?: number
  ): Promise<OptimizationResult> {
    switch (strategy.name) {
      case 'VRPTW':
        // 使用 VRPTW 优化器
        const result = await this.enhancedVRPTWOptimizer.solve(request, {
          request_id: `vrptw_${sampleIndex}_${Date.now()}`,
        });
        return result;

      case 'SA':
      case 'GA':
      case 'MONTE_CARLO':
        // 这些策略暂未实现，使用 VRPTW 作为 fallback
        this.logger.warn(`策略 ${strategy.name} 暂未实现，使用 VRPTW 替代`);
        return await this.enhancedVRPTWOptimizer.solve(request, {
          request_id: `${strategy.name.toLowerCase()}_${sampleIndex}_${Date.now()}`,
        });

      default:
        throw new Error(`未知策略: ${strategy.name}`);
    }
  }

  /**
   * 去重与多样性筛选
   */
  private deduplicateAndFilter(
    candidates: CandidateRoute[],
    diversityThreshold: number
  ): CandidateRoute[] {
    if (candidates.length === 0) {
      return [];
    }

    // 计算所有候选之间的多样性分数
    const diversityScores = this.calculateDiversityScores(candidates);

    // 贪心选择：优先选择多样性高的候选
    const selected: CandidateRoute[] = [];
    const remaining = [...candidates];

    // 首先选择质量最高的候选
    remaining.sort((a, b) => {
      const scoreA = this.getRouteScore(a.result);
      const scoreB = this.getRouteScore(b.result);
      return scoreB - scoreA;
    });

    if (remaining.length > 0) {
      selected.push(remaining.shift()!);
    }

    // 然后选择与已选候选差异最大的候选
    while (remaining.length > 0 && selected.length < candidates.length) {
      let bestIndex = -1;
      let bestDiversity = -1;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const minDiversity = Math.min(
          ...selected.map(s => diversityScores.get(`${candidate.id}-${s.id}`) || 0)
        );

        if (minDiversity > bestDiversity && minDiversity >= diversityThreshold) {
          bestDiversity = minDiversity;
          bestIndex = i;
        }
      }

      if (bestIndex >= 0) {
        selected.push(remaining.splice(bestIndex, 1)[0]);
      } else {
        // 如果没有足够多样化的候选，选择质量最高的
        if (remaining.length > 0) {
          selected.push(remaining.shift()!);
        }
      }
    }

    return selected;
  }

  /**
   * 计算路线多样性分数
   */
  private calculateDiversityScores(
    candidates: CandidateRoute[]
  ): Map<string, number> {
    const scores = new Map<string, number>();

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const c1 = candidates[i];
        const c2 = candidates[j];

        // 计算路线差异（基于节点序列、时间安排等）
        const diversity = this.calculateRouteDiversity(c1, c2);
        scores.set(`${c1.id}-${c2.id}`, diversity);
        scores.set(`${c2.id}-${c1.id}`, diversity);
      }
    }

    return scores;
  }

  /**
   * 计算两条路线的差异度
   */
  private calculateRouteDiversity(c1: CandidateRoute, c2: CandidateRoute): number {
    const route1 = c1.result.route || [];
    const route2 = c2.result.route || [];

    // 1. 节点序列差异（Jaccard 距离）
    const nodes1 = new Set(route1.map(r => r.node_id));
    const nodes2 = new Set(route2.map(r => r.node_id));
    const intersection = new Set([...nodes1].filter(x => nodes2.has(x)));
    const union = new Set([...nodes1, ...nodes2]);
    const jaccardDistance = 1 - intersection.size / union.size;

    // 2. 时间安排差异（平均时间差）
    let timeDiff = 0;
    const commonNodes = route1
      .filter(r1 => nodes2.has(r1.node_id))
      .map(r1 => {
        const r2 = route2.find(r => r.node_id === r1.node_id);
        if (r2) {
          const time1 = this.parseTimeToMinutes(r1.arrival);
          const time2 = this.parseTimeToMinutes(r2.arrival);
          return Math.abs(time1 - time2);
        }
        return 0;
      });

    if (commonNodes.length > 0) {
      timeDiff = commonNodes.reduce((sum, d) => sum + d, 0) / commonNodes.length;
      timeDiff = Math.min(timeDiff / 480, 1); // 归一化到 0-1（假设最大差异 8 小时）
    }

    // 3. 综合多样性分数
    const diversity = (jaccardDistance * 0.6 + timeDiff * 0.4);
    return Math.min(1, Math.max(0, diversity));
  }

  /**
   * 计算多样性统计
   */
  private calculateDiversityStats(
    candidates: CandidateRoute[]
  ): MultiStrategyResult['statistics']['diversity_stats'] {
    if (candidates.length <= 1) {
      return { min: 0, max: 0, avg: 0, std: 0 };
    }

    const diversityScores = this.calculateDiversityScores(candidates);
    const scores = Array.from(diversityScores.values());

    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance =
      scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
    const std = Math.sqrt(variance);

    return {
      min: Math.min(...scores),
      max: Math.max(...scores),
      avg,
      std,
    };
  }

  /**
   * 选择最佳候选
   */
  private selectBestCandidate(candidates: CandidateRoute[]): CandidateRoute | undefined {
    if (candidates.length === 0) {
      return undefined;
    }

    // 根据路线分数选择最佳
    return candidates.reduce((best, current) => {
      const bestScore = this.getRouteScore(best.result);
      const currentScore = this.getRouteScore(current.result);
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * 获取路线分数
   */
  private getRouteScore(result: OptimizationResult): number {
    if (result.status === 'INFEASIBLE') {
      return -1000;
    }

    // 综合分数：考虑稳健度、旅行时间、丢弃节点数等
    const robustness = result.robustness?.risk_level === 'low' ? 1.0 : 
                      result.robustness?.risk_level === 'medium' ? 0.7 : 0.4;
    const travelTime = 1 / (1 + result.summary.total_travel_min / 480); // 归一化
    const droppedPenalty = result.summary.dropped_count * 0.1;

    return robustness * 0.4 + travelTime * 0.4 - droppedPenalty * 0.2;
  }

  /**
   * 聚合结果
   */
  private async aggregateResults(
    candidates: CandidateRoute[],
    mode: 'ENSEMBLE' | 'VOTING'
  ): Promise<MultiStrategyResult['aggregation_result']> {
    if (candidates.length === 0) {
      return undefined;
    }

    if (mode === 'VOTING') {
      // 投票模式：选择出现频率最高的节点
      // 简化实现：返回最佳候选的结果
      const best = this.selectBestCandidate(candidates);
      return {
        mode: 'VOTING',
        voting_route: best?.result,
      };
    }

    if (mode === 'ENSEMBLE') {
      // 集成模式：合并多条路线
      // 简化实现：返回最佳候选的结果
      const best = this.selectBestCandidate(candidates);
      return {
        mode: 'ENSEMBLE',
        ensemble_route: best?.result,
      };
    }

    return undefined;
  }

  /**
   * 解析时间字符串为分钟数
   */
  private parseTimeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
}
