/**
 * 批量评估服务
 *
 * P2.4 优化：批量约束检查和效用计算
 *
 * 优化策略：
 * - 批量约束检查（减少重复计算）
 * - 批量效用计算（向量化操作）
 * - 结果缓存（避免重复评估）
 */

import { Injectable, Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import { ObjectiveFunctionWeights } from '../objective-function.interface';

export interface BatchCandidate {
  id: string;
  plan: unknown;
  state: DecisionState;
}

export interface ConstraintCheckResult {
  candidateId: string;
  feasible: boolean;
  hardViolations: string[];
  softViolations: Array<{ constraint: string; degree: number; penalty: number }>;
  totalPenalty: number;
  checkDurationMs: number;
}

export interface UtilityResult {
  candidateId: string;
  utility: number;
  dimensions: Record<string, number>;
  confidence: number;
  computeDurationMs: number;
}

export interface BatchEvaluationResult {
  constraintResults: ConstraintCheckResult[];
  utilityResults: UtilityResult[];
  feasibleCount: number;
  bestCandidateId: string | null;
  bestUtility: number;
  totalDurationMs: number;
  cacheHits: number;
}

export interface BatchConfig {
  enableParallel: boolean;
  enableCaching: boolean;
  maxBatchSize: number;
  timeoutMs: number;
  earlyTerminateOnInfeasible: boolean;
}

const DEFAULT_BATCH_CONFIG: BatchConfig = {
  enableParallel: true,
  enableCaching: true,
  maxBatchSize: 100,
  timeoutMs: 30000,
  earlyTerminateOnInfeasible: false,
};

@Injectable()
export class BatchEvaluatorService {
  private readonly logger = new Logger(BatchEvaluatorService.name);
  private config: BatchConfig = DEFAULT_BATCH_CONFIG;

  private constraintCache: Map<string, ConstraintCheckResult> = new Map();
  private utilityCache: Map<string, UtilityResult> = new Map();
  private cacheHits = 0;

  configure(config: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 批量约束检查
   */
  async batchCheckConstraints(
    candidates: BatchCandidate[],
    constraintChecker: (
      plan: unknown,
      state: DecisionState,
    ) => Promise<{ feasible: boolean; violations: string[] }>,
  ): Promise<ConstraintCheckResult[]> {
    const results: ConstraintCheckResult[] = [];
    const startTime = Date.now();

    for (const candidate of candidates) {
      const cacheKey = this.computeCacheKey(candidate, 'constraint');

      if (this.config.enableCaching) {
        const cached = this.constraintCache.get(cacheKey);
        if (cached) {
          this.cacheHits++;
          results.push(cached);
          continue;
        }
      }

      const checkStart = Date.now();
      try {
        const checkResult = await constraintChecker(candidate.plan, candidate.state);

        const result: ConstraintCheckResult = {
          candidateId: candidate.id,
          feasible: checkResult.feasible,
          hardViolations: checkResult.violations.filter((v) => v.startsWith('HARD:')),
          softViolations: checkResult.violations
            .filter((v) => v.startsWith('SOFT:'))
            .map((v) => ({
              constraint: v.replace('SOFT:', ''),
              degree: 0.5,
              penalty: 0.1,
            })),
          totalPenalty: checkResult.violations.filter((v) => v.startsWith('SOFT:')).length * 0.1,
          checkDurationMs: Date.now() - checkStart,
        };

        if (this.config.enableCaching) {
          this.constraintCache.set(cacheKey, result);
        }

        results.push(result);

        if (
          this.config.earlyTerminateOnInfeasible &&
          !result.feasible &&
          results.filter((r) => r.feasible).length === 0
        ) {
          this.logger.debug('[BatchEvaluator] 提前终止：无可行候选');
          break;
        }
      } catch (error) {
        results.push({
          candidateId: candidate.id,
          feasible: false,
          hardViolations: [`ERROR: ${(error as Error).message}`],
          softViolations: [],
          totalPenalty: Infinity,
          checkDurationMs: Date.now() - checkStart,
        });
      }
    }

    this.logger.debug(
      `[BatchEvaluator] 批量约束检查: ${results.length}/${candidates.length}, ` +
        `可行 ${results.filter((r) => r.feasible).length}, ` +
        `耗时 ${Date.now() - startTime}ms`,
    );

    return results;
  }

  /**
   * 批量效用计算
   */
  async batchComputeUtility(
    candidates: BatchCandidate[],
    weights: ObjectiveFunctionWeights,
    utilityComputer: (
      plan: unknown,
      state: DecisionState,
      weights: ObjectiveFunctionWeights,
    ) => Promise<{ utility: number; dimensions: Record<string, number> }>,
  ): Promise<UtilityResult[]> {
    const results: UtilityResult[] = [];
    const startTime = Date.now();

    for (const candidate of candidates) {
      const cacheKey = this.computeCacheKey(candidate, 'utility', weights);

      if (this.config.enableCaching) {
        const cached = this.utilityCache.get(cacheKey);
        if (cached) {
          this.cacheHits++;
          results.push(cached);
          continue;
        }
      }

      const computeStart = Date.now();
      try {
        const computeResult = await utilityComputer(candidate.plan, candidate.state, weights);

        const result: UtilityResult = {
          candidateId: candidate.id,
          utility: computeResult.utility,
          dimensions: computeResult.dimensions,
          confidence: 0.9,
          computeDurationMs: Date.now() - computeStart,
        };

        if (this.config.enableCaching) {
          this.utilityCache.set(cacheKey, result);
        }

        results.push(result);
      } catch (error) {
        results.push({
          candidateId: candidate.id,
          utility: -Infinity,
          dimensions: {},
          confidence: 0,
          computeDurationMs: Date.now() - computeStart,
        });
      }
    }

    this.logger.debug(
      `[BatchEvaluator] 批量效用计算: ${results.length}/${candidates.length}, ` +
        `耗时 ${Date.now() - startTime}ms`,
    );

    return results;
  }

  /**
   * 完整批量评估（约束 + 效用）
   */
  async batchEvaluate(
    candidates: BatchCandidate[],
    weights: ObjectiveFunctionWeights,
    constraintChecker: (
      plan: unknown,
      state: DecisionState,
    ) => Promise<{ feasible: boolean; violations: string[] }>,
    utilityComputer: (
      plan: unknown,
      state: DecisionState,
      weights: ObjectiveFunctionWeights,
    ) => Promise<{ utility: number; dimensions: Record<string, number> }>,
  ): Promise<BatchEvaluationResult> {
    const startTime = Date.now();
    this.cacheHits = 0;

    const constraintResults = await this.batchCheckConstraints(candidates, constraintChecker);

    const feasibleCandidates = candidates.filter((c) => {
      const result = constraintResults.find((r) => r.candidateId === c.id);
      return result?.feasible ?? false;
    });

    const utilityResults = await this.batchComputeUtility(
      feasibleCandidates,
      weights,
      utilityComputer,
    );

    const adjustedUtilities = utilityResults.map((ur) => {
      const cr = constraintResults.find((c) => c.candidateId === ur.candidateId);
      return {
        ...ur,
        utility: ur.utility - (cr?.totalPenalty ?? 0),
      };
    });

    let bestCandidateId: string | null = null;
    let bestUtility = -Infinity;

    for (const result of adjustedUtilities) {
      if (result.utility > bestUtility) {
        bestUtility = result.utility;
        bestCandidateId = result.candidateId;
      }
    }

    return {
      constraintResults,
      utilityResults: adjustedUtilities,
      feasibleCount: feasibleCandidates.length,
      bestCandidateId,
      bestUtility,
      totalDurationMs: Date.now() - startTime,
      cacheHits: this.cacheHits,
    };
  }

  /**
   * 批量排序候选（按效用降序）
   */
  async batchRankCandidates(
    candidates: BatchCandidate[],
    weights: ObjectiveFunctionWeights,
    constraintChecker: (
      plan: unknown,
      state: DecisionState,
    ) => Promise<{ feasible: boolean; violations: string[] }>,
    utilityComputer: (
      plan: unknown,
      state: DecisionState,
      weights: ObjectiveFunctionWeights,
    ) => Promise<{ utility: number; dimensions: Record<string, number> }>,
    topK?: number,
  ): Promise<
    Array<{
      candidateId: string;
      rank: number;
      utility: number;
      feasible: boolean;
    }>
  > {
    const evalResult = await this.batchEvaluate(
      candidates,
      weights,
      constraintChecker,
      utilityComputer,
    );

    const ranked = candidates
      .map((c) => {
        const cr = evalResult.constraintResults.find((r) => r.candidateId === c.id);
        const ur = evalResult.utilityResults.find((r) => r.candidateId === c.id);
        return {
          candidateId: c.id,
          utility: ur?.utility ?? -Infinity,
          feasible: cr?.feasible ?? false,
        };
      })
      .sort((a, b) => {
        if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
        return b.utility - a.utility;
      })
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    return topK ? ranked.slice(0, topK) : ranked;
  }

  /**
   * 批量 Pareto 筛选（多目标优化）
   */
  batchParetoFilter(
    utilityResults: UtilityResult[],
    objectives: string[],
  ): UtilityResult[] {
    const dominated = new Set<string>();

    for (let i = 0; i < utilityResults.length; i++) {
      for (let j = 0; j < utilityResults.length; j++) {
        if (i === j) continue;

        const a = utilityResults[i];
        const b = utilityResults[j];

        let aDominates = true;
        let aStrictlyBetter = false;

        for (const obj of objectives) {
          const aVal = a.dimensions[obj] ?? 0;
          const bVal = b.dimensions[obj] ?? 0;

          if (aVal < bVal) {
            aDominates = false;
            break;
          }
          if (aVal > bVal) {
            aStrictlyBetter = true;
          }
        }

        if (aDominates && aStrictlyBetter) {
          dominated.add(b.candidateId);
        }
      }
    }

    return utilityResults.filter((r) => !dominated.has(r.candidateId));
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    constraintCacheSize: number;
    utilityCacheSize: number;
    totalHits: number;
  } {
    return {
      constraintCacheSize: this.constraintCache.size,
      utilityCacheSize: this.utilityCache.size,
      totalHits: this.cacheHits,
    };
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.constraintCache.clear();
    this.utilityCache.clear();
    this.cacheHits = 0;
  }

  // ========== 私有方法 ==========

  private computeCacheKey(
    candidate: BatchCandidate,
    type: 'constraint' | 'utility',
    weights?: ObjectiveFunctionWeights,
  ): string {
    const baseKey = `${type}:${candidate.id}:${this.hashObject(candidate.plan)}`;

    if (type === 'utility' && weights) {
      return `${baseKey}:${this.hashObject(weights)}`;
    }

    return baseKey;
  }

  private hashObject(obj: unknown): string {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
