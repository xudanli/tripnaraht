/**
 * Optimization Engine Adapter
 *
 * Phase 2.2: 从 DSO 抽取 OptimizationHints 给 LLM
 * Scheme A: Monte Carlo 集成 - 世界状态不确定性时采用 Monte Carlo 模拟计算概率期望效用
 *
 * 数据来源：environmentState（weatherRisk）、tripState、research_data 扩展
 *
 * 参考: docs/DECISION_KERNEL_GAP_ANALYSIS.md, docs/CHIEF_SCIENTIST_TECHNICAL_PROPOSAL.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionState, OptimizationHints, UncertaintyProfile } from './decision-state.types';
import { dsoToMinimalWorldModelContext } from './dso-to-world-model-converter';
import { itineraryToRoutePlanDraft } from './dso-to-trips-converter';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import { ExpectedUtilityService, DEFAULT_MONTE_CARLO_CONFIG } from '../../trips/decision/optimization/probabilistic/expected-utility.service';
import { ProbabilisticWorldModelService } from '../../trips/decision/optimization/probabilistic/probabilistic-world-model.service';
import { DEFAULT_UNCERTAINTY_CONFIG } from '../../trips/decision/optimization/probabilistic/probabilistic-world-model.interface';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../../trips/decision/optimization/objective-function.interface';
import { UnifiedDecisionFormulaService } from '../../trips/decision/optimization/unified-decision-formula.service';
import { MetaPolicyService } from '../../trips/decision/optimization/meta/meta-policy.service';
import {
  CGUSSearchService,
  type CGUSCandidate,
  type CGUSSearchResult,
} from '../../trips/decision/optimization/cgus-search.service';

@Injectable()
export class OptimizationEngineAdapterService {
  private readonly logger = new Logger(OptimizationEngineAdapterService.name);

  constructor(
    @Optional() private readonly expectedUtility?: ExpectedUtilityService,
    @Optional() private readonly probabilisticWorldModel?: ProbabilisticWorldModelService,
    @Optional() private readonly unifiedFormula?: UnifiedDecisionFormulaService,
    @Optional() private readonly metaPolicy?: MetaPolicyService,
    @Optional() private readonly cgusSearch?: CGUSSearchService,
  ) {}

  /**
   * 从 DSO 抽取优化提示（趋势信息，非公式）
   * P2 E(U) 显式化：计算 lightweight expectedUtility 以增强专利覆盖
   * 公式：E(U) ≈ w1·Safety - w2·FatigueRisk（简化版，0-1 标量）
   * 修复：填充 dimensionBreakdown（疲劳/天气/预算/避流），解决「始终为0」问题
   */
  getHints(state: DecisionState): OptimizationHints | undefined {
    const hints: OptimizationHints = {};

    if (state.environmentState?.weatherRisk !== undefined) {
      const r = state.environmentState.weatherRisk;
      hints.safetyTrend = r > 0.7 ? 'HIGH' : r > 0.3 ? 'MEDIUM' : 'LOW';
    }
    if (state.environmentState?.failureRiskLevel) {
      hints.safetyTrend = hints.safetyTrend ?? state.environmentState.failureRiskLevel;
    }

    if (state.tripState?.fatigue !== undefined) {
      const f = state.tripState.fatigue;
      hints.fatigueTrend = f > 0.7 ? 'HIGH' : f > 0.3 ? 'MEDIUM' : 'LOW';
    }

    if (state.riskLevel) {
      hints.safetyTrend = hints.safetyTrend ?? (state.riskLevel === 'CRITICAL' ? 'HIGH' : state.riskLevel);
    }

    // 填充各维度实际得分（解决「疲劳/天气/预算/避流始终为0」）
    hints.dimensionBreakdown = this.buildDimensionBreakdown(state);

    // P2: 计算 lightweight expectedUtility（专利 E(U) 显式化）
    const eu = this.computeExpectedUtility(hints);
    if (eu !== undefined) {
      hints.expectedUtility = eu.value;
      hints.expectedUtilityWeights = eu.weights;
    }

    if (Object.keys(hints).length === 0) return undefined;

    this.logger.debug(`[OptimizationAdapter] Hints: ${JSON.stringify(hints)}`);
    return hints;
  }

  /**
   * 异步获取优化提示（Scheme A: Monte Carlo 路径；Scheme B: CGUS 五步流程）
   * 专利实施例步骤 8：当 planDraft 存在时，优先尝试 CGUS 约束引导效用搜索
   * 降级：无 CGUS 或无不确定性时走 Monte Carlo 或确定性 Hints
   */
  async getHintsAsync(state: DecisionState): Promise<OptimizationHints | undefined> {
    let baseHints = this.getHints(state);
    if (!baseHints) baseHints = {};

    const planDraft = state.tripState?.planDraft as Itinerary | undefined;
    const worldContext = dsoToMinimalWorldModelContext(state);

    const cgusDiagnostics = {
      cgusInjected: !!this.cgusSearch,
      hasPlanDraft: !!planDraft?.days?.length,
      hasWorldContext: !!worldContext,
      canMonteCarlo: !!this.expectedUtility && !!this.probabilisticWorldModel,
    };

    if (this.cgusSearch && planDraft?.days?.length && worldContext) {
      try {
        const cgusHints = await this.getHintsViaCGUS(state, planDraft, worldContext, baseHints);
        if (cgusHints) return cgusHints;
      } catch (e: unknown) {
        this.logger.warn(`[OptimizationAdapter] CGUS 路径失败，降级: ${(e as Error)?.message}`);
      }
    } else {
      // 诊断：为何未走 CGUS（常见是 planDraft/worldContext 缺失或 cgusSearch 未注入）
      this.logger.debug(
        `[OptimizationAdapter] CGUS skipped: ${JSON.stringify(cgusDiagnostics)}`,
      );
    }

    const env = state.environmentState ?? {};
    const hasUncertainty =
      env.weatherRisk !== undefined ||
      env.failureRiskLevel !== undefined ||
      (env.weatherRisk === undefined && env.failureRiskLevel === undefined && planDraft?.days?.length);

    if (
      !planDraft?.days?.length ||
      !this.expectedUtility ||
      !this.probabilisticWorldModel ||
      !hasUncertainty
    ) {
      return Object.keys(baseHints).length > 0 ? baseHints : undefined;
    }

    try {
      const worldContext = dsoToMinimalWorldModelContext(state);
      if (!worldContext) return baseHints;

      // 专利 3.12.3：元决策 MetaPolicy 选择采样预算 N
      const sampleSize =
        this.metaPolicy?.selectPolicy(state).sampleSize ?? DEFAULT_MONTE_CARLO_CONFIG.sampleSize ?? 200;

      const probabilisticContext = this.probabilisticWorldModel.fromDeterministicModel(
        worldContext,
        DEFAULT_UNCERTAINTY_CONFIG,
      );

      const routeDirectionId = env.routeDirectionId ?? 'unknown';
      const tripId = state.systemState?.requestId ?? state.requestId ?? 'unknown';
      const plan = itineraryToRoutePlanDraft(planDraft, tripId, routeDirectionId);

      const result = this.expectedUtility.computeExpectedUtility(
        plan,
        probabilisticContext,
        DEFAULT_OBJECTIVE_WEIGHTS,
        { ...DEFAULT_MONTE_CARLO_CONFIG, sampleSize },
      );

      const uncertaintyProfile: UncertaintyProfile = {
        hasUncertainty: true,
        sources: [
          ...(env.weatherRisk !== undefined ? (['weather'] as const) : []),
          ...(state.tripState?.fatigue !== undefined ? (['human'] as const) : []),
        ],
        suggestedSampleSize: sampleSize,
      };

      const hints: OptimizationHints = {
        ...baseHints,
        expectedUtility: result.expectedUtility,
        expectedUtilityWeights: {
          safety: DEFAULT_OBJECTIVE_WEIGHTS.safety,
          fatigueRisk: DEFAULT_OBJECTIVE_WEIGHTS.fatigueRisk,
          weatherRisk: DEFAULT_OBJECTIVE_WEIGHTS.weatherRisk,
        },
        confidenceInterval: result.confidenceInterval,
        feasibilityProbability: result.feasibilityProbability,
        uncertaintyProfile,
      };

      this.logger.debug(
        `[OptimizationAdapter] Monte Carlo: E[U]=${result.expectedUtility.toFixed(3)} ` +
          `CI=[${result.confidenceInterval.lower.toFixed(2)},${result.confidenceInterval.upper.toFixed(2)}] ` +
          `P(feasible)=${result.feasibilityProbability.toFixed(2)}`,
      );
      return hints;
    } catch (error: unknown) {
      this.logger.warn(
        `[OptimizationAdapter] Monte Carlo 失败，降级为确定性 Hints: ${(error as Error)?.message}`,
      );
      return baseHints;
    }
  }

  /**
   * 专利实施例步骤 8：CGUS 五步流程集成
   * 可行域投影 → 效用先验 → 不确定性采样 → 世界模型推演 → 最优选择
   */
  private async getHintsViaCGUS(
    state: DecisionState,
    planDraft: Itinerary,
    worldContext: NonNullable<ReturnType<typeof dsoToMinimalWorldModelContext>>,
    baseHints: OptimizationHints,
  ): Promise<OptimizationHints | undefined> {
    if (!this.cgusSearch) return undefined;

    const env = state.environmentState ?? {};
    const routeDirectionId = env.routeDirectionId ?? 'unknown';
    const tripId = state.systemState?.requestId ?? state.requestId ?? 'unknown';
    const plan = itineraryToRoutePlanDraft(planDraft, tripId, routeDirectionId);

    const violations = (state.constraints?.violations ?? []).map((v) => ({
      type: v.type,
      severity: v.severity,
      degree: v.degree ?? (v.severity === 'HARD' ? 1 : 0.5),
    }));

    const buildCandidates = (): CGUSCandidate[] => {
      const hard = violations.filter((v) => v.severity === 'HARD');
      const baseFeasible = (state.constraints?.feasible ?? hard.length === 0) && hard.length === 0;

      const base: CGUSCandidate = {
        id: 'plan-base',
        plan,
        constraintViolations: violations,
        feasible: baseFeasible,
      };

      // 轻量 Top-K 变体：用 segments 密度 + 约束类型来制造可区分候选
      const relaxed: CGUSCandidate = {
        id: 'plan-relaxed-pace',
        plan: {
          ...plan,
          segments: plan.segments.filter((s, idx) => idx % 2 === 0),
        },
        constraintViolations: violations.filter((v) => !v.type.includes('TIME')),
        feasible: baseFeasible,
      };

      const dense: CGUSCandidate = {
        id: 'plan-high-density',
        plan: {
          ...plan,
          segments: [...plan.segments, ...plan.segments.slice(0, Math.min(2, plan.segments.length))].map(
            (s, i) => ({ ...s, segmentId: `${s.segmentId}-dup-${i}` }),
          ),
        },
        constraintViolations: [
          ...violations,
          { type: 'TIME_SLACK_SOFT', severity: 'SOFT' as const, degree: 0.6 },
        ],
        feasible: baseFeasible,
      };

      const philosophyAligned: CGUSCandidate = {
        id: 'plan-philosophy-aligned',
        plan,
        constraintViolations: violations.filter((v) => !v.type.includes('PHILOSOPHY')),
        feasible: baseFeasible,
      };

      const budgetSafe: CGUSCandidate = {
        id: 'plan-budget-safe',
        plan: {
          ...plan,
          segments: plan.segments.slice(0, Math.max(1, Math.floor(plan.segments.length * 0.8))),
        },
        constraintViolations: [
          ...violations.filter((v) => !v.type.includes('TIME')),
          { type: 'BUDGET_SOFT', severity: 'SOFT' as const, degree: 0.7 },
        ],
        feasible: baseFeasible,
      };

      // 去重：避免 segments 为空或重复过多导致不稳定排序
      const candidates = [base, relaxed, dense, philosophyAligned, budgetSafe].filter(
        (c) => c.plan.segments.length > 0,
      );

      return candidates;
    };

    const candidates = buildCandidates();

    const result: CGUSSearchResult = await this.cgusSearch.search(
      candidates,
      worldContext,
      {
        useMonteCarlo: !!this.expectedUtility && !!this.probabilisticWorldModel,
        sampleSize: 200,
        useUtilityPrior: true,
        useUtilityWeightedSampling: true,
      },
    );

    const top = result.rankedCandidates[0];
    const eu = top?.expectedUtility ?? top?.utility;
    const fp = top?.feasibilityProbability;

    this.logger.debug(
      `[OptimizationAdapter] CGUS: recommended=${!!result.recommended}, E[U]=${eu?.toFixed(3) ?? 'N/A'}, P(feasible)=${fp?.toFixed(2) ?? 'N/A'}`,
    );

    const ci = top?.confidenceInterval;
    return {
      ...baseHints,
      strategyDirection: `CGUS(${candidates.length}): recommended=${result.recommended?.id ?? top?.candidate.id ?? 'N/A'} monteCarlo=${result.usedMonteCarlo}`,
      ...(eu !== undefined && { expectedUtility: eu }),
      ...(fp !== undefined && { feasibilityProbability: fp }),
      ...(ci && {
        confidenceInterval: { lower: ci.lower, upper: ci.upper, level: (ci as { level?: number }).level ?? 0.95 },
      }),
    };
  }

  /**
   * 构建各维度得分（疲劳/天气/预算/避流）
   * 数据来源：tripState.fatigue、environmentState.weatherRisk、tripState.budgetOverrun、environmentState.crowdLevel
   * 无数据时用 failureRiskLevel 等推断，避免始终为 0
   */
  private buildDimensionBreakdown(state: DecisionState): OptimizationHints['dimensionBreakdown'] {
    const env = state.environmentState ?? {};
    const trip = state.tripState ?? {};

    // 疲劳：tripState.fatigue (0-1)，由 TDFPM 在 OPTIMIZE 步骤写入；无数据时用 failureRiskLevel 推断
    let fatigue = trip.fatigue;
    if (fatigue === undefined && env.failureRiskLevel) {
      fatigue = env.failureRiskLevel === 'HIGH' ? 0.5 : env.failureRiskLevel === 'MEDIUM' ? 0.3 : 0.1;
    }
    fatigue = fatigue !== undefined ? Math.min(1, Math.max(0, fatigue)) : 0;

    // 天气：environmentState.weatherRisk，或从 failureRiskLevel 推断
    let weather = env.weatherRisk;
    if (weather === undefined && env.failureRiskLevel) {
      weather = env.failureRiskLevel === 'HIGH' ? 0.6 : env.failureRiskLevel === 'MEDIUM' ? 0.35 : 0.15;
    }
    weather = weather !== undefined ? Math.min(1, Math.max(0, weather)) : 0;

    // 预算：tripState.budgetOverrun (0-1)；Phase 1 暂无则 0
    const budgetOverrun = trip.budgetOverrun;
    const budget = budgetOverrun !== undefined ? Math.min(1, Math.max(0, budgetOverrun)) : 0;

    // 避流：environmentState.crowdLevel (0-1)
    const crowdAvoidance = env.crowdLevel !== undefined ? Math.min(1, Math.max(0, env.crowdLevel)) : 0;

    return { fatigue, weather, budget, crowdAvoidance };
  }

  /**
   * 轻量级 E(U) 计算（专利公式简化版）
   * 专利升级点①：优先使用统一决策公式 U(a) = Σ wi·Fi − Σ λj·ConstraintViolationj − RiskPenalty + PreferenceScore
   * 降级：E(U) = w1·Safety + w2·Experience - w3·FatigueRisk - w4·WeatherRisk
   * 当无数据时返回 undefined
   */
  private computeExpectedUtility(hints: Partial<OptimizationHints>): { value: number; weights: Record<string, number> } | undefined {
    if (hints.safetyTrend === undefined && hints.fatigueTrend === undefined) return undefined;

    if (this.unifiedFormula && hints.dimensionBreakdown) {
      const value = this.unifiedFormula.computeFromDimensionBreakdown(
        hints.dimensionBreakdown,
        hints.safetyTrend,
        hints.fatigueTrend,
        0,
      );
      return { value, weights: { safety: 0.6, fatigueRisk: 0.4 } };
    }

    const safetyScore = hints.safetyTrend === 'HIGH' ? 0.3 : hints.safetyTrend === 'MEDIUM' ? 0.6 : hints.safetyTrend === 'LOW' ? 1.0 : 0.7;
    const fatiguePenalty = hints.fatigueTrend === 'HIGH' ? 0.4 : hints.fatigueTrend === 'MEDIUM' ? 0.2 : hints.fatigueTrend === 'LOW' ? 0 : 0.1;
    const value = Math.max(0, Math.min(1, 0.6 * safetyScore + 0.4 * (1 - fatiguePenalty)));
    return {
      value,
      weights: { safety: 0.6, fatigueRisk: 0.4 },
    };
  }
}
