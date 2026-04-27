/**
 * 优化引擎适配器
 *
 * 从 DSO 抽取优化提示给 LLM
 * 蒙特卡洛集成 —— 当世界状态存在不确定性时，采用蒙特卡洛模拟计算概率期望效用
 *
 * 数据来源：environmentState（天气风险）、tripState、research_data 扩展
 *
 * 参考: docs/DECISION_KERNEL_GAP_ANALYSIS.md, docs/CHIEF_SCIENTIST_TECHNICAL_PROPOSAL.md
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
import type { RetrievalCategoryEvidence } from '../../trips/decision/optimization/retrieval-category-constraint-boost';
import { DecisionOSConfigService } from '../../trips/decision/optimization/config';
import { ChunkRetrievalService } from '../../rag/services/chunk-retrieval.service';
import { RetrievalEvidenceMapper } from '../../rag/mappers/retrieval-evidence.mapper';
import { isKernelCgusRagEvidenceEnabledFromEnv } from './kernel-cgus-rag.constants';
import { StateConsistencyGuardService } from '../../trips/dem/services/state-consistency-guard.service';
import { PlanFeaturesService } from '../../trips/decision/optimization/plan-features/plan-features.service';
import { decisionStateToTripWorldState } from './dso-to-trips-converter';
import { convertRoutePlanDraftToTripPlan } from '../../trips/decision/tot/plan-converter';

@Injectable()
export class OptimizationEngineAdapterService {
  private readonly logger = new Logger(OptimizationEngineAdapterService.name);

  constructor(
    @Optional() private readonly expectedUtility?: ExpectedUtilityService,
    @Optional() private readonly probabilisticWorldModel?: ProbabilisticWorldModelService,
    @Optional() private readonly unifiedFormula?: UnifiedDecisionFormulaService,
    @Optional() private readonly metaPolicy?: MetaPolicyService,
    @Optional() private readonly decisionOsConfig?: DecisionOSConfigService,
    @Optional() private readonly cgusSearch?: CGUSSearchService,
    /** 显式 token：避免与其它 `@Optional()` 依赖并列时 Nest 按位错注入 */
    @Optional() @Inject(ChunkRetrievalService) private readonly chunkRetrieval?: ChunkRetrievalService,
    @Optional() private readonly stateConsistencyGuard?: StateConsistencyGuardService,
    @Optional() private readonly planFeatures?: PlanFeaturesService,
  ) {}

  /**
   * 从 DSO 抽取优化提示（趋势信息，非公式）
   * E(U) 显式化：计算 lightweight expectedUtility
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

    hints.method = 'HEURISTIC';

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

    // CGUS 门控：使用 "log" 级别记录日志，以便在最小化测试运行中显示。
    this.logger.log(
      `[OptimizationAdapter] CGUS gate: ${JSON.stringify({
        cgusInjected: cgusDiagnostics.cgusInjected,
        hasPlanDraft: cgusDiagnostics.hasPlanDraft,
        hasWorldContext: cgusDiagnostics.hasWorldContext,
      })}`,
    );

    if (this.cgusSearch && planDraft?.days?.length && worldContext) {
      try {
        const cgusHints = await this.getHintsViaCGUS(state, planDraft, worldContext, baseHints);
        if (cgusHints) {
          this.logger.log(`[OptimizationAdapter] OPTIMIZE path: ${JSON.stringify({ mode: 'CGUS' })}`);
          return cgusHints;
        }
        this.logger.warn(
          `[OptimizationAdapter] OPTIMIZE fallback: ${JSON.stringify({
            mode: 'MonteCarloOrHeuristic',
            reason: 'cgus_returned_undefined',
          })}`,
        );
      } catch (e: unknown) {
        this.logger.warn(`[OptimizationAdapter] CGUS 路径失败，降级: ${(e as Error)?.message}`);
        this.logger.warn(
          `[OptimizationAdapter] OPTIMIZE fallback: ${JSON.stringify({
            mode: 'MonteCarloOrHeuristic',
            reason: 'cgus_exception',
          })}`,
        );
      }
    } else {
      // 诊断：为何未走 CGUS（常见是 planDraft/worldContext 缺失或 cgusSearch 未注入）
      this.logger.debug(
        `[OptimizationAdapter] CGUS skipped: ${JSON.stringify(cgusDiagnostics)}`,
      );
      this.logger.warn(
        `[OptimizationAdapter] OPTIMIZE fallback: ${JSON.stringify({
          mode: 'MonteCarloOrHeuristic',
          reason: 'cgus_gate_false',
          gate: {
            cgusInjected: cgusDiagnostics.cgusInjected,
            hasPlanDraft: cgusDiagnostics.hasPlanDraft,
            hasWorldContext: cgusDiagnostics.hasWorldContext,
          },
        })}`,
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
      this.logger.warn(
        `[OptimizationAdapter] OPTIMIZE fallback: ${JSON.stringify({
          mode: 'Heuristic',
          reason: 'monte_carlo_gate_false',
          gate: {
            hasPlanDraft: !!planDraft?.days?.length,
            expectedUtilityInjected: !!this.expectedUtility,
            probabilisticWorldModelInjected: !!this.probabilisticWorldModel,
            hasUncertainty,
          },
        })}`,
      );
      this.logger.log(`[OptimizationAdapter] OPTIMIZE path: ${JSON.stringify({ mode: 'Heuristic' })}`);
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
      let plan = itineraryToRoutePlanDraft(planDraft, tripId, routeDirectionId);
      if (this.stateConsistencyGuard) {
        ({ plan } = await this.stateConsistencyGuard.enrichRoutePlanDraftIfNeeded(plan));
      }

      const result = this.expectedUtility.computeExpectedUtility(
        plan,
        probabilisticContext,
        DEFAULT_OBJECTIVE_WEIGHTS,
        { ...DEFAULT_MONTE_CARLO_CONFIG, sampleSize, deterministicWorld: worldContext },
      );

      const uncertaintyProfile: UncertaintyProfile = {
        hasUncertainty: true,
        sources: [
          ...(env.weatherRisk !== undefined ? (['weather'] as const) : []),
          ...(state.tripState?.fatigue !== undefined ? (['human'] as const) : []),
        ],
        suggestedSampleSize: sampleSize,
      };

      let hints: OptimizationHints = {
        ...baseHints,
        method: 'MONTE_CARLO',
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

      if (this.planFeatures) {
        const f = this.planFeatures.extract(plan);
        const inflation = 1 + Math.min(1.35, f.effort01 * 1.5);
        const ci0 = hints.confidenceInterval;
        if (ci0 && inflation > 1.001 && Number.isFinite(ci0.lower) && Number.isFinite(ci0.upper)) {
          const mid = (ci0.upper + ci0.lower) / 2;
          const half = ((ci0.upper - ci0.lower) / 2) * inflation;
          hints = {
            ...hints,
            confidenceInterval: {
              ...ci0,
              lower: mid - half,
              upper: mid + half,
            },
            terrainEpistemicUncertainty: {
              effort01: f.effort01,
              confidenceIntervalInflation: inflation,
            },
            ...(f.effort01 >= 0.5 && inflation >= 1.12
              ? { earlyWarningCodes: ['TERRAIN_EPISTEMIC_HIGH_VARIANCE'] }
              : {}),
          };
        }
      }

      this.logger.debug(
        `[OptimizationAdapter] Monte Carlo: E[U]=${result.expectedUtility.toFixed(3)} ` +
          `CI=[${hints.confidenceInterval!.lower.toFixed(2)},${hints.confidenceInterval!.upper.toFixed(2)}] ` +
          `P(feasible)=${result.feasibilityProbability.toFixed(2)}`,
      );
      this.logger.log(`[OptimizationAdapter] OPTIMIZE path: ${JSON.stringify({ mode: 'MonteCarlo' })}`);
      return hints;
    } catch (error: unknown) {
      this.logger.warn(
        `[OptimizationAdapter] Monte Carlo 失败，降级为确定性 Hints: ${(error as Error)?.message}`,
      );
      this.logger.warn(
        `[OptimizationAdapter] OPTIMIZE fallback: ${JSON.stringify({
          mode: 'Heuristic',
          reason: 'monte_carlo_exception',
        })}`,
      );
      this.logger.log(`[OptimizationAdapter] OPTIMIZE path: ${JSON.stringify({ mode: 'Heuristic' })}`);
      return baseHints;
    }
  }

  /**
   * 从 DSO 拼短查询 → RAG → dominant evidence，供 CGUS λ / 时效衰减使用。
   *
   * **默认关闭**：仅当环境变量 `KERNEL_CGUS_RAG_EVIDENCE` 为 `true` / `1` / `yes` 时才会打库检索，
   * 避免每次 OPTIMIZE 路径都触发 RAG。未注入 ChunkRetrieval 或无法拼查询时返回 undefined。
   */
  private async resolveRetrievalEvidenceForCgus(
    state: DecisionState,
  ): Promise<RetrievalCategoryEvidence[] | undefined> {
    const ragCfg = this.decisionOsConfig?.get('ragEvidence');
    const enabled = ragCfg?.enabled ?? isKernelCgusRagEvidenceEnabledFromEnv();
    if (!enabled) {
      return undefined;
    }
    if (!this.chunkRetrieval) {
      return undefined;
    }
    const minQueryLength = Math.max(0, ragCfg?.minQueryLength ?? 1);
    const q = OptimizationEngineAdapterService.buildKernelRagQuery(state, { minQueryLength });
    if (!q) {
      return undefined;
    }
    try {
      const chunks = await this.chunkRetrieval.retrieve({ query: q, limit: 8 });
      const confidenceThreshold = ragCfg?.confidenceThreshold ?? 0.25;
      const evidence = RetrievalEvidenceMapper.toEvidence(chunks, { scoreThreshold: confidenceThreshold });
      if (evidence.length > 0) {
        this.logger.debug(
          `[OptimizationAdapter] CGUS RAG evidence: query="${q.slice(0, 80)}" → ${JSON.stringify(evidence)}`,
        );
      }
      return evidence.length > 0 ? evidence : undefined;
    } catch (e: unknown) {
      this.logger.debug(`[OptimizationAdapter] CGUS RAG evidence skipped: ${(e as Error)?.message}`);
      return undefined;
    }
  }

  /** 是否启用「内核 CGUS 前 RAG 证据」链路（默认关，见 {@link isKernelCgusRagEvidenceEnabledFromEnv}）。 */
  static isKernelCgusRagEvidenceEnabled(): boolean {
    return isKernelCgusRagEvidenceEnabledFromEnv();
  }

  /** 用于内核 CGUS 前 RAG 的轻量查询串（目的地/国家/路况语义） */
  static buildKernelRagQuery(
    state: DecisionState,
    options?: { minQueryLength?: number },
  ): string | undefined {
    const parts: string[] = [];
    const dest = state.userIntent?.destination;
    if (typeof dest === 'string' && dest.trim()) {
      parts.push(dest.trim());
    }
    if (state.tripState?.location?.trim()) {
      parts.push(state.tripState.location.trim());
    }
    if (state.environmentState?.countryCode) {
      parts.push(state.environmentState.countryCode);
    }
    const base = parts.filter(Boolean).join(' ').trim();
    const minLen = Math.max(0, options?.minQueryLength ?? 1);
    // 仅拒绝「完全无可用片段」或长度不足；允许通过 config 控制最短 query
    if (base.length < minLen) {
      return undefined;
    }
    return `${base} road conditions driving rules safety`;
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
    let plan = itineraryToRoutePlanDraft(planDraft, tripId, routeDirectionId);
    if (this.stateConsistencyGuard) {
      ({ plan } = await this.stateConsistencyGuard.enrichRoutePlanDraftIfNeeded(plan));
    }

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

    const retrievalCategoryEvidence = await this.resolveRetrievalEvidenceForCgus(state);

    const patchedCandidates =
      process.env.CGUS_INJECT_CONTRAST_CANDIDATES === '1'
        ? candidates.map((c) => {
            if (c.id === 'plan-high-density') {
              return {
                ...c,
                feasible: false,
                constraintViolations: [
                  { type: 'TIME_WINDOW_BREACH', severity: 'HARD' as const, degree: 1.0 },
                  { type: 'FATIGUE_HIGH', severity: 'SOFT' as const, degree: 0.4 },
                ],
              };
            }

            if (c.id === 'plan-budget-safe') {
              return {
                ...c,
                feasible: true,
                constraintViolations: [
                  { type: 'PHILOSOPHY_WEAK', severity: 'SOFT' as const, degree: 0.3 },
                  { type: 'EXPERIENCE_DENSITY_LOW', severity: 'SOFT' as const, degree: 0.6 },
                ],
              };
            }

            if (c.id === 'plan-relaxed-pace') {
              return {
                ...c,
                feasible: true,
                constraintViolations: [{ type: 'TIME_EFFICIENCY_LOW', severity: 'SOFT' as const, degree: 0.3 }],
              };
            }

            if (c.id === 'plan-philosophy-aligned') {
              return { ...c, feasible: true, constraintViolations: [] };
            }

            return { ...c, feasible: true, constraintViolations: [] };
          })
        : candidates;

    const candidateSummary = candidates.map((c) => ({
      id: c.id,
      feasible: c.feasible,
      hardViolations: (c.constraintViolations ?? []).filter((v) => v.severity === 'HARD').length,
      softViolations: (c.constraintViolations ?? []).filter((v) => v.severity === 'SOFT').length,
      totalViolationDegree: (c.constraintViolations ?? []).reduce((s, v) => s + (v.degree ?? 0), 0),
    }));
    const summaryToLog = (process.env.CGUS_INJECT_CONTRAST_CANDIDATES === '1'
      ? patchedCandidates
      : candidates
    ).map((c) => ({
      id: c.id,
      feasible: c.feasible,
      hardViolations: (c.constraintViolations ?? []).filter((v) => v.severity === 'HARD').length,
      softViolations: (c.constraintViolations ?? []).filter((v) => v.severity === 'SOFT').length,
      totalViolationDegree: (c.constraintViolations ?? []).reduce((s, v) => s + (v.degree ?? 0), 0),
      violationTypes: (c.constraintViolations ?? []).map((v) => v.type),
    }));
    this.logger.log(
      `[OptimizationAdapter] CGUS candidates${process.env.CGUS_INJECT_CONTRAST_CANDIDATES === '1' ? ' (patched)' : ''}: ` +
        `${JSON.stringify(summaryToLog)}`,
    );

    const result: CGUSSearchResult = await this.cgusSearch.search(
      patchedCandidates,
      worldContext,
      {
        useMonteCarlo: !!this.expectedUtility && !!this.probabilisticWorldModel,
        sampleSize: 200,
        useUtilityPrior: true,
        useUtilityWeightedSampling: true,
        mcRankAuthority: {
          enabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? '').toLowerCase() === 'true',
          // 默认门控必须与当前采样预算下典型的每候选分配量相匹配。
          //20 与 CGUS 分配策略内部使用的 minSamplesPerCandidate（阶段 2.5）保持一致。
          minSamplesPerCandidate: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES ?? 20),
          // 默认 margin gate：抑制低 margin 翻盘抖动（Phase 2.6 观测显示翻盘高度集中在 margin < 0.05）。
          minTopMargin: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN ?? 0.05),
          // 保守默认值：如果用户未设置，我们仅基于样本数进行门控。
          compareTopN: Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5),
        },
        ...(retrievalCategoryEvidence?.length
          ? { retrievalCategoryEvidence }
          : {}),
        emergencyConstraints: {
          forbidden_modes: (state.systemState as any)?.emergency_constraints?.forbidden_modes,
        },
      },
    );

    const top = result.rankedCandidates[0];
    const eu = top?.expectedUtility ?? top?.utility;
    const fp = top?.feasibilityProbability;

    this.logger.debug(
      `[OptimizationAdapter] CGUS: recommended=${!!result.recommended}, E[U]=${eu?.toFixed(3) ?? 'N/A'}, P(feasible)=${fp?.toFixed(2) ?? 'N/A'}`,
    );
    this.logger.log(
      `[OptimizationAdapter] CGUS rankedCandidates(top5): ` +
        `${JSON.stringify(
          result.rankedCandidates.slice(0, 5).map((r) => ({
            finalRank: result.rankedCandidates.findIndex((x) => x.candidate.id === r.candidate.id) + 1,
            id: r.candidate.id,
            feasible: r.candidate.feasible,
            hardViolations: (r.candidate.constraintViolations ?? []).filter((v) => v.severity === 'HARD').length,
            softViolations: (r.candidate.constraintViolations ?? []).filter((v) => v.severity === 'SOFT').length,
            totalViolationDegree: (r.candidate.constraintViolations ?? []).reduce((s, v) => s + (v.degree ?? 0), 0),
            utility: r.utility,
            rawMonteCarloExpectedUtility: (r as any).rawMonteCarloExpectedUtility,
            expectedUtility: r.expectedUtility,
            feasibilityProbability: r.feasibilityProbability,
            confidenceInterval: r.confidenceInterval,
            appliedSoftPenaltyDelta: (r as any).appliedSoftPenaltyDelta,
            finalScore: r.finalScore,
          })),
        )}`,
    );

    // 惩罚校准表：一组紧凑、可机械比对的行记录，用于调参。
    // 特意记录完整的排序列表（通常 N 较小），以支持 P2 诊断。
    const penaltyCalibrationTable = result.rankedCandidates.map((r, idx) => {
      const hardCount = (r.candidate.constraintViolations ?? []).filter((v) => v.severity === 'HARD').length;
      const softDegree = (r.candidate.constraintViolations ?? [])
        .filter((v) => v.severity === 'SOFT')
        .reduce((s, v) => s + (v.degree ?? 0), 0);
      return {
        finalRank: idx + 1,
        id: r.candidate.id,
        feasible: r.candidate.feasible,
        hardCount,
        softDegree,
        rawMonteCarloExpectedUtility: (r as any).rawMonteCarloExpectedUtility,
        appliedSoftPenaltyDelta: (r as any).appliedSoftPenaltyDelta,
        finalExpectedUtility: r.expectedUtility ?? r.utility,
        feasibilityProbability: r.feasibilityProbability,
      };
    });
    this.logger.log(`[OptimizationAdapter] CGUS penalty calibration table: ${JSON.stringify(penaltyCalibrationTable)}`);

    const ci = top?.confidenceInterval;
    const te = result.terrainEpistemics;
    const earlyWarningCodes =
      te?.earlyWarningTerrain ? ['TERRAIN_EPISTEMIC_HIGH_VARIANCE' as const] : undefined;
    const terrainEpistemicUncertainty =
      te && te.topConfidenceIntervalInflation > 1
        ? {
            effort01: te.topCandidateEffort01,
            confidenceIntervalInflation: te.topConfidenceIntervalInflation,
          }
        : undefined;

    const tripWorldState = decisionStateToTripWorldState(state);
    const tripPlanToItinerary = (tp: { days?: any[] } | undefined): Itinerary | undefined => {
      if (!tp?.days || !Array.isArray(tp.days)) return undefined;
      return {
        request_id: tripId,
        days: tp.days.map((d: any) => ({
          date: String(d?.date ?? ''),
          items: Array.isArray(d?.timeSlots)
            ? d.timeSlots.map((s: any) => ({
                id: String(s?.id ?? ''),
                type: 'POI',
                start_window: String(s?.time ?? ''),
                end_window: String(s?.endTime ?? ''),
                location_ref: {
                  place_id: s?.poiId ? String(s.poiId) : undefined,
                  name: String(s?.title ?? ''),
                  coordinates: s?.coordinates,
                },
                evidence_refs: [],
                verified: false,
                verification_status: 'ASSUMPTION',
              }))
            : [],
        })),
        action_plan: [],
      } as any;
    };

    return {
      ...baseHints,
      method: 'CGUS',
      strategyDirection: `CGUS(${candidates.length}): recommended=${result.recommended?.id ?? top?.candidate.id ?? 'N/A'} monteCarlo=${result.usedMonteCarlo}`,
      recommendedAlternativeId: result.recommended?.id ?? top?.candidate.id,
      ...(result.emergencyMaskAudit ? { emergencyMaskAudit: result.emergencyMaskAudit as any } : {}),
      ...(terrainEpistemicUncertainty ? { terrainEpistemicUncertainty } : {}),
      ...(earlyWarningCodes ? { earlyWarningCodes } : {}),
      alternatives: result.rankedCandidates.slice(0, 3).map((r) => {
        const hardCount = (r.candidate.constraintViolations ?? []).filter((v) => v.severity === 'HARD').length;
        const softDegree = (r.candidate.constraintViolations ?? [])
          .filter((v) => v.severity === 'SOFT')
          .reduce((s, v) => s + (v.degree ?? 0), 0);
        const tp = r.candidate?.plan
          ? convertRoutePlanDraftToTripPlan(r.candidate.plan as any, tripWorldState as any)
          : undefined;
        const itinerary = tripPlanToItinerary(tp as any);
        return {
          id: r.candidate.id,
          score: r.expectedUtility ?? r.utility,
          finalScore: r.finalScore,
          scoreBreakdown: (r as any).scoreBreakdown,
          expectedUtility: r.expectedUtility,
          feasibilityProbability: r.feasibilityProbability,
          confidenceInterval: r.confidenceInterval
            ? { lower: r.confidenceInterval.lower, upper: r.confidenceInterval.upper, level: 0.95 }
            : undefined,
          summary: (r.candidate as any)?.summary,
          violations: (r.candidate.constraintViolations ?? []).map((v: any) => ({
            type: v.type,
            severity: v.severity,
            degree: v.degree,
            detail: v.detail,
          })),
          riskProfile: { hard_violations: hardCount, soft_degree: softDegree },
          itinerary,
        };
      }),
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
   * 轻量级 E(U) 计算
   * 优先使用统一决策公式 U(a) = Σ wi·Fi − Σ λj·ConstraintViolationj − RiskPenalty + PreferenceScore
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
