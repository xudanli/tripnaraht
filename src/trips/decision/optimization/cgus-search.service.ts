/**
 * Constraint-Guided Utility Search (CGUS) Service
 *
 * 专利升级点②：约束引导效用搜索算法（Phase 2 五步完整版）
 * 步骤 1：可行域投影 → 2：效用先验估计（可选）→ 3：不确定性采样 → 4：世界模型推演（可选）→ 5：最优选择
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.6.1
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  UnifiedDecisionFormulaService,
  UnifiedDecisionFormulaInput,
  DEFAULT_UNIFIED_WEIGHTS,
} from './unified-decision-formula.service';
import { ExpectedUtilityService, DEFAULT_MONTE_CARLO_CONFIG } from './probabilistic/expected-utility.service';
import { ProbabilisticWorldModelService } from './probabilistic/probabilistic-world-model.service';
import { DEFAULT_UNCERTAINTY_CONFIG } from './probabilistic/probabilistic-world-model.interface';
import { DEFAULT_OBJECTIVE_WEIGHTS } from './objective-function.interface';
import { ObjectiveFunctionService } from './objective-function.service';
import { InformationGainService } from './exploration/information-gain.service';
import { ComplexityAnalysisService } from './theory/complexity-analysis.service';
import type { ComplexityReport } from './theory/complexity-analysis.interface';
import { UCBVisitTrackerService } from './theory/ucb-visit-tracker.service';
import type { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';

/** 候选方案（动作 a） */
export interface CGUSCandidate {
  id: string;
  plan: RoutePlanDraft;
  /** 约束违反列表（来自约束引擎） */
  constraintViolations: Array< { type: string; severity: 'HARD' | 'SOFT'; degree: number }>;
  /** 是否可行（无 Hard 违反） */
  feasible: boolean;
}

/** Monte Carlo 采样详情（专利 3.6.1 Step 3） */
export interface MonteCarloSamplingDetails {
  /** 总采样数 */
  totalSamples: number;
  /** 各候选分配到的采样数（候选 id → 数量） */
  samplesPerCandidate?: Record<string, number>;
  /** 是否使用效用加权预算分配（专利：采样概率 ∝ exp(β·Û)·σ） */
  usedUtilityWeightedAllocation?: boolean;
  /** 数据来源说明：当前由 fromDeterministicModel 从 worldContext 推断分布，无外部预报 PDF */
  dataSourceNote?: string;
}

/** CGUS 输出 */
export interface CGUSSearchResult {
  /** 按 U(a) 降序排列的候选 */
  rankedCandidates: Array<{
    candidate: CGUSCandidate;
    utility: number;
    /** Step 2：效用先验估计 Û(a) */
    utilityPrior?: number;
    expectedUtility?: number;
    confidenceInterval?: { lower: number; upper: number };
    feasibilityProbability?: number;
    /** Step 4：世界模型推演结果 */
    rolloutPrediction?: { feasibilityProbability: number; estimatedUtility: number };
    /** Monte Carlo 采样详情（当 usedMonteCarlo 时） */
    samplingDetails?: { totalSamples: number; effectiveSampleSize?: number };
  }>;
  /** 推荐方案（最高效用且可行） */
  recommended?: CGUSCandidate;
  /** 是否执行了 Monte Carlo 不确定性采样 */
  usedMonteCarlo: boolean;
  /** 是否执行了世界模型推演 */
  usedRollout?: boolean;
  /** 是否使用了 Exploration（U'(a)=U(a)+β·IG(a)） */
  usedExploration?: boolean;
  /** 专利 4.14.2：决策复杂度报告 O(N·ρ·H) */
  complexityReport?: ComplexityReport;
  /** Monte Carlo 采样数据详情（当 usedMonteCarlo 时，便于诊断「采样数据有没有」） */
  monteCarloSamplingDetails?: MonteCarloSamplingDetails;
}

@Injectable()
export class CGUSSearchService {
  private readonly logger = new Logger(CGUSSearchService.name);

  constructor(
    private readonly unifiedFormula: UnifiedDecisionFormulaService,
    @Optional() private readonly objectiveFunction?: ObjectiveFunctionService,
    @Optional() private readonly expectedUtility?: ExpectedUtilityService,
    @Optional() private readonly probabilisticWorldModel?: ProbabilisticWorldModelService,
    @Optional() private readonly informationGain?: InformationGainService,
    @Optional() private readonly complexityAnalysis?: ComplexityAnalysisService,
    @Optional() private readonly ucbVisitTracker?: UCBVisitTrackerService,
  ) {}

  /**
   * 执行 CGUS 五步搜索
   * Step 1：可行域投影 → Step 2：效用先验（可选）→ Step 3：不确定性采样 → Step 4：世界模型推演（可选）→ Step 5：最优选择
   */
  async search(
    candidates: CGUSCandidate[],
    worldContext: WorldModelContext,
    options?: {
      useMonteCarlo?: boolean;
      sampleSize?: number;
      useUtilityPrior?: boolean;
      /** 专利 3.6.1：采样概率 ∝ exp(β·Û(a))·σ(a)，启用时按效用先验分配采样预算 */
      useUtilityWeightedSampling?: boolean;
      /** 效用加权采样的 β（默认 2，Û 高则多采样） */
      utilityWeightedBeta?: number;
      useWorldModelRollout?: boolean;
      rolloutTopK?: number;
      /** 专利 3.12.2：Exploration 系数 β，U'(a)=U(a)+β·InformationGain(a)，0 表示关闭 */
      explorationBeta?: number;
      /** 专利 3.6.2 定理 5：UCB 探索，Regret(T)=O(log T)，与 explorationBeta 二选一 */
      explorationStrategy?: 'INFORMATION_GAIN' | 'UCB' | 'NONE';
      /** UCB 常数 c，score = Û(a) + c·√(ln(T+1)/(N_a+1)) */
      explorationC?: number;
    },
  ): Promise<CGUSSearchResult> {
    // Step 1：可行域投影 A_f = {a | g_i(s,a) ≤ 0}
    const feasibleCandidates = candidates.filter((c) => c.feasible);
    if (feasibleCandidates.length === 0) {
      this.logger.warn('[CGUS] 无可行候选，返回按效用排序的全部候选（含不可行）');
    }
    const toRank = feasibleCandidates.length > 0 ? feasibleCandidates : candidates;

    // Step 2：效用先验估计 Û(a)（可选，用于加速排序或加权采样）
    const withPrior = toRank.map((candidate) => {
      const dimensionScores = this.deriveDimensionScores(candidate, worldContext);
      const utilityPrior =
        options?.useUtilityPrior === true
          ? Object.values(dimensionScores).reduce((s, v) => s + (v ?? 0), 0) / Math.max(1, Object.keys(dimensionScores).length)
          : undefined;
      const input: UnifiedDecisionFormulaInput = {
        dimensionScores,
        weights: DEFAULT_UNIFIED_WEIGHTS,
        constraintViolations: candidate.constraintViolations,
        riskPenalty: this.deriveRiskPenalty(candidate, worldContext),
        preferenceScore: 0,
      };
      const utility = this.unifiedFormula.computeUnifiedScore(input);
      return { candidate, utility, utilityPrior };
    });

    // 按 U(a) 降序排序
    withPrior.sort((a, b) => b.utility - a.utility);

    let usedMonteCarlo = false;
    let usedRollout = false;
    let monteCarloSamplingDetails: MonteCarloSamplingDetails | undefined;
    let usedUtilityWeightedAllocation = false;
    const finalResults = withPrior.map((r) => ({
      candidate: r.candidate,
      utility: r.utility,
      utilityPrior: r.utilityPrior,
      expectedUtility: undefined as number | undefined,
      confidenceInterval: undefined as { lower: number; upper: number } | undefined,
      feasibilityProbability: undefined as number | undefined,
      rolloutPrediction: undefined as { feasibilityProbability: number; estimatedUtility: number } | undefined,
      samplingDetails: undefined as { totalSamples: number; effectiveSampleSize?: number } | undefined,
    }));

    // Step 3：不确定性采样 — 当有条件时执行 Monte Carlo
    // 专利 3.6.1：采样概率可正比于 exp(β·Û(a))·σ(a)
    const shouldMonteCarlo =
      options?.useMonteCarlo !== false &&
      this.expectedUtility &&
      this.probabilisticWorldModel &&
      withPrior.length > 0;

    if (shouldMonteCarlo) {
      try {
        const probabilisticContext = this.probabilisticWorldModel!.fromDeterministicModel(
          worldContext,
          DEFAULT_UNCERTAINTY_CONFIG,
        );
        const totalSampleBudget = options?.sampleSize ?? 200;
        const utilityWeightedBeta = options?.utilityWeightedBeta ?? 2;
        const minSamplesPerCandidate = 20;

        // 专利 3.6.1：按 exp(β·Û)·σ 分配采样预算；σ 用 (1 + 软约束违反数) 近似不确定性
        let sampleAllocations: number[];
        if (options?.useUtilityWeightedSampling === true && withPrior.some((r) => r.utilityPrior !== undefined)) {
          const sigmaProxy = (r: (typeof withPrior)[0]) =>
            1 + (r.candidate.constraintViolations?.filter((v) => v.severity === 'SOFT').length ?? 0) * 0.2;
          const uMin = Math.min(...withPrior.map((r) => r.utilityPrior ?? 0));
          const uRange = Math.max(1e-6, Math.max(...withPrior.map((r) => r.utilityPrior ?? 0)) - uMin);
          const weights = withPrior.map((r) => {
            const uNorm = ((r.utilityPrior ?? 0) - uMin) / uRange;
            return Math.exp(utilityWeightedBeta * uNorm) * sigmaProxy(r);
          });
          const sumW = weights.reduce((s, w) => s + w, 0);
          sampleAllocations = weights.map((w) =>
            Math.max(minSamplesPerCandidate, Math.round((w / sumW) * totalSampleBudget)),
          );
          const allocated = sampleAllocations.reduce((s, n) => s + n, 0);
          if (allocated > totalSampleBudget) {
            sampleAllocations = sampleAllocations.map((n) =>
              Math.max(minSamplesPerCandidate, Math.round((n / allocated) * totalSampleBudget)),
            );
          }
          usedUtilityWeightedAllocation = true;
        } else {
          sampleAllocations = withPrior.map(() => Math.max(minSamplesPerCandidate, Math.floor(totalSampleBudget / withPrior.length)));
        }

        const samplesPerCandidate: Record<string, number> = {};
        let totalSamplesUsed = 0;

        for (let i = 0; i < finalResults.length; i++) {
          const { candidate } = finalResults[i];
          const perSize = sampleAllocations[i] ?? Math.floor(totalSampleBudget / finalResults.length);
          const result = this.expectedUtility!.computeExpectedUtility(
            candidate.plan,
            probabilisticContext,
            DEFAULT_OBJECTIVE_WEIGHTS,
            { ...DEFAULT_MONTE_CARLO_CONFIG, sampleSize: perSize },
          );
          finalResults[i].expectedUtility = result.expectedUtility;
          finalResults[i].confidenceInterval = result.confidenceInterval;
          finalResults[i].feasibilityProbability = result.feasibilityProbability;
          finalResults[i].samplingDetails = {
            totalSamples: result.samplingDetails?.totalSamples ?? perSize,
            effectiveSampleSize: result.samplingDetails?.effectiveSampleSize,
          };
          samplesPerCandidate[candidate.id] = result.samplingDetails?.totalSamples ?? perSize;
          totalSamplesUsed += result.samplingDetails?.totalSamples ?? perSize;
        }
        usedMonteCarlo = true;
        monteCarloSamplingDetails = {
          totalSamples: totalSamplesUsed,
          samplesPerCandidate,
          usedUtilityWeightedAllocation,
          dataSourceNote:
            '当前由 ProbabilisticWorldModel.fromDeterministicModel 从 worldContext 推断概率分布（天气、道路等），无外部预报 PDF 注入。若需真实不确定性，可扩展 physical.climateSeasonality 注入 API 分布参数。',
        };
      } catch (err) {
        this.logger.warn(`[CGUS] Monte Carlo 失败，使用确定性效用: ${(err as Error)?.message}`);
      }
    }

    // Step 4：世界模型推演（可选，对 top-k 候选执行轨迹模拟）
    const rolloutTopK = options?.rolloutTopK ?? 3;
    if (
      options?.useWorldModelRollout === true &&
      this.probabilisticWorldModel &&
      finalResults.length > 0
    ) {
      try {
        const probContext = this.probabilisticWorldModel.fromDeterministicModel(
          worldContext,
          DEFAULT_UNCERTAINTY_CONFIG,
        );
        const toRollout = finalResults.slice(0, Math.min(rolloutTopK, finalResults.length));
        for (let i = 0; i < toRollout.length; i++) {
          const pred = this.probabilisticWorldModel.predictOutcome(probContext, {
            type: 'PLAN_EVALUATION',
            payload: { candidateId: toRollout[i].candidate.id },
          });
          finalResults[i].rolloutPrediction = {
            feasibilityProbability: pred.feasibilityProbability,
            estimatedUtility: pred.estimatedUtility,
          };
        }
        usedRollout = true;
      } catch (err) {
        this.logger.warn(`[CGUS] World Model Rollout 失败: ${(err as Error)?.message}`);
      }
    }

    // Step 5：最优动作选择 a* = argmax U(a)，可选 Exploration：a* = argmax U'(a)
    const explorationBeta = options?.explorationBeta ?? 0;
    const explorationStrategy = options?.explorationStrategy ?? (explorationBeta > 0 ? 'INFORMATION_GAIN' : 'NONE');
    const explorationC = options?.explorationC ?? 2;
    let usedExploration = false;

    if (explorationStrategy === 'UCB' && this.ucbVisitTracker) {
      for (const r of finalResults) {
        const baseU = r.expectedUtility ?? r.utility;
        const ucbBonus = this.ucbVisitTracker.getUCBBonus(r.candidate.id, explorationC);
        (r as { explorationAdjustedUtility?: number }).explorationAdjustedUtility = baseU + ucbBonus;
      }
      finalResults.sort((a, b) => {
        const ua = (a as { explorationAdjustedUtility?: number }).explorationAdjustedUtility ?? a.expectedUtility ?? a.utility;
        const ub = (b as { explorationAdjustedUtility?: number }).explorationAdjustedUtility ?? b.expectedUtility ?? b.utility;
        return ub - ua;
      });
      usedExploration = true;
    } else if (explorationStrategy === 'INFORMATION_GAIN' && explorationBeta > 0 && this.informationGain) {
      for (const r of finalResults) {
        const baseU = r.expectedUtility ?? r.utility;
        const ig = this.informationGain.computeInformationGain({
          candidateId: r.candidate.id,
          worldContext,
          confidenceInterval: r.confidenceInterval,
        });
        (r as { explorationAdjustedUtility?: number }).explorationAdjustedUtility = baseU + explorationBeta * ig;
      }
      finalResults.sort((a, b) => {
        const ua = (a as { explorationAdjustedUtility?: number }).explorationAdjustedUtility ?? a.expectedUtility ?? a.utility;
        const ub = (b as { explorationAdjustedUtility?: number }).explorationAdjustedUtility ?? b.expectedUtility ?? b.utility;
        return ub - ua;
      });
      usedExploration = true;
    }

    const recommended = finalResults.find((r) => r.candidate.feasible)?.candidate;

    if (explorationStrategy === 'UCB' && this.ucbVisitTracker && recommended) {
      this.ucbVisitTracker.recordSelection(recommended.id);
    }

    const complexityReport =
      this.complexityAnalysis?.estimateComplexity(
        candidates.length,
        feasibleCandidates.length,
        options?.rolloutTopK ?? 3,
      );

    this.logger.debug(
      `[CGUS] 完成: candidates=${candidates.length} feasible=${feasibleCandidates.length} ` +
        `recommended=${!!recommended} monteCarlo=${usedMonteCarlo} rollout=${usedRollout} exploration=${usedExploration}`,
    );

    return {
      rankedCandidates: finalResults,
      recommended,
      usedMonteCarlo,
      usedRollout,
      usedExploration,
      complexityReport,
      monteCarloSamplingDetails,
    };
  }

  /**
   * 从候选方案和世界上下文推导各维度得分
   * 专利实现：接入 ObjectiveFunctionService 进行真实评估
   */
  private deriveDimensionScores(
    candidate: CGUSCandidate,
    worldContext: WorldModelContext,
  ): Record<string, number> {
    // 如果 ObjectiveFunctionService 可用，使用真实评估
    if (this.objectiveFunction && candidate.plan) {
      try {
        const evaluation = this.objectiveFunction.evaluate(candidate.plan, worldContext);
        return {
          safety: evaluation.breakdown.safetyScore,
          experienceDensity: evaluation.breakdown.experienceScore,
          philosophyAlignment: evaluation.breakdown.philosophyScore,
          timeSlack: evaluation.breakdown.timeSlackScore,
        };
      } catch (err) {
        this.logger.warn(`[CGUS] ObjectiveFunction 评估失败，使用启发式: ${(err as Error)?.message}`);
      }
    }

    // 降级方案：基于世界上下文的启发式评估
    return this.deriveHeuristicDimensionScores(candidate, worldContext);
  }

  /**
   * 启发式维度评分（降级方案）
   */
  private deriveHeuristicDimensionScores(
    candidate: CGUSCandidate,
    worldContext: WorldModelContext,
  ): Record<string, number> {
    const physical = worldContext.physical;

    // 安全性：基于天气、道路状态、危险区域
    let safety = 0.9;
    const typicalWeather = physical?.climateSeasonality?.typicalWeather;
    if (typicalWeather) {
      const windSpeed = typicalWeather.windSpeedMps ?? 0;
      const precipitation = typicalWeather.precipitationMmPerHour ?? 0;
      if (windSpeed > 20) safety -= 0.2;
      else if (windSpeed > 15) safety -= 0.1;
      if (precipitation > 10) safety -= 0.15;
      else if (precipitation > 5) safety -= 0.05;
    }
    if (physical?.roadStates) {
      const closedRoads = physical.roadStates.filter(r => r.status === 'CLOSED').length;
      safety -= closedRoads * 0.15;
    }

    // 体验密度：基于活动数量和气候可达性
    let experienceDensity = 0.75;
    const plan = candidate.plan;
    if (plan?.segments) {
      // 从 segments 的 dayIndex 推算总天数
      const maxDayIndex = Math.max(...plan.segments.map(s => s.dayIndex), 0);
      const totalDays = maxDayIndex + 1;
      const avgActivitiesPerDay = plan.segments.length / Math.max(1, totalDays);
      experienceDensity = Math.min(1, 0.5 + avgActivitiesPerDay * 0.1);
    }
    // 根据可达性评分调整
    const accessibilityScore = physical?.climateSeasonality?.accessibilityScore ?? 1;
    experienceDensity *= accessibilityScore;

    // 哲学匹配：基于约束违反
    let philosophyAlignment = 0.8;
    const philViolations = candidate.constraintViolations.filter(v => v.type.includes('PHILOSOPHY'));
    philosophyAlignment -= philViolations.length * 0.1;

    // 时间余量：基于约束和行程紧凑度
    let timeSlack = 0.7;
    const timeViolations = candidate.constraintViolations.filter(v => v.type.includes('TIME'));
    timeSlack -= timeViolations.length * 0.15;

    return {
      safety: Math.max(0, Math.min(1, safety)),
      experienceDensity: Math.max(0, Math.min(1, experienceDensity)),
      philosophyAlignment: Math.max(0, Math.min(1, philosophyAlignment)),
      timeSlack: Math.max(0, Math.min(1, timeSlack)),
    };
  }

  /**
   * 从候选方案和世界上下文推导风险惩罚
   * 专利实现：动态计算风险而非固定值
   */
  private deriveRiskPenalty(
    candidate: CGUSCandidate,
    worldContext: WorldModelContext,
  ): number {
    let risk = 0;
    const physical = worldContext.physical;
    const human = worldContext.human;

    // 1. 天气风险（从 climateSeasonality.typicalWeather 获取）
    const typicalWeather = physical?.climateSeasonality?.typicalWeather;
    if (typicalWeather) {
      const windSpeed = typicalWeather.windSpeedMps ?? 0;
      const precipitation = typicalWeather.precipitationMmPerHour ?? 0;
      const visibility = typicalWeather.visibilityMeters ?? 10000;

      if (windSpeed > 20) risk += 0.2;
      else if (windSpeed > 15) risk += 0.1;

      if (precipitation > 15) risk += 0.2;
      else if (precipitation > 10) risk += 0.15;
      else if (precipitation > 5) risk += 0.05;

      if (visibility < 500) risk += 0.2;
      else if (visibility < 1000) risk += 0.1;
    }

    // 2. 人体能力风险（基于体能评分和风险承受度）
    if (human) {
      const fitnessScore = human.fitnessScore ?? 70;
      const riskTolerance = human.riskTolerance;
      
      // 体能较低时风险增加
      if (fitnessScore < 50) risk += 0.2;
      else if (fitnessScore < 70) risk += 0.1;
      
      // 低风险承受度时额外惩罚
      if (riskTolerance === 'LOW') risk += 0.1;
    }

    // 3. 道路状态风险
    if (physical?.roadStates) {
      const restrictedRoads = physical.roadStates.filter(r => r.status === 'RESTRICTED').length;
      const closedRoads = physical.roadStates.filter(r => r.status === 'CLOSED').length;
      risk += restrictedRoads * 0.05;
      risk += closedRoads * 0.15;
    }

    // 4. 软约束违反风险
    const softViolations = candidate.constraintViolations.filter(v => v.severity === 'SOFT');
    for (const violation of softViolations) {
      risk += (violation.degree ?? 0.5) * 0.1;
    }

    // 5. 危险区域风险（基于 hazardZones 的 level）
    if (physical?.hazardZones) {
      const highHazards = physical.hazardZones.filter(h => h.level === 'HIGH');
      const mediumHazards = physical.hazardZones.filter(h => h.level === 'MEDIUM');
      risk += highHazards.length * 0.15;
      risk += mediumHazards.length * 0.05;
    }

    // 6. 气候季节性风险因素
    const riskFactors = physical?.climateSeasonality?.riskFactors ?? [];
    risk += riskFactors.length * 0.05;

    return Math.max(0, Math.min(1, risk));
  }
}
