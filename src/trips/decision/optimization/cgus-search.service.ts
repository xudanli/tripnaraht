/**
 * Constraint-Guided Utility Search (CGUS) Service
 *
 * 专利升级点②：约束引导效用搜索算法（Phase 2 五步完整版）
 * 步骤 1：可行域投影 → 2：效用先验估计（可选）→ 3：不确定性采样 → 4：世界模型推演（可选）→ 5：最优选择
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.6.1
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
import { PlanFeaturesService } from './plan-features/plan-features.service';
import { ExposureMapService } from './plan-features/exposure-map.service';
import type { CandidateScorerPerCandidateOutput, ICandidateScorer } from './scoring/candidate-scorer.interface';
import { CANDIDATE_SCORER } from './scoring/candidate-scorer.tokens';
import { latentSnapshotFromWorldContext } from './scoring/latent-from-world-context';
import {
  buildConstraintPenaltyCoefficientsFromRetrievalEvidence,
  buildConstraintPenaltyCoefficientsFromRetrievalHints,
  type RetrievalCategoryEvidence,
} from './retrieval-category-constraint-boost';

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
  /** pilot 试采样本数（每候选） */
  pilotSamplesPerCandidate?: number;
  /** 各候选分配到的采样数（候选 id → 数量） */
  samplesPerCandidate?: Record<string, number>;
  /** pilot 方差估计（候选 id → variance） */
  pilotVariancePerCandidate?: Record<string, number>;
  /** pilot 有效样本数估计（候选 id → ESS） */
  pilotEssPerCandidate?: Record<string, number>;
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
    /** Rollout-aware final score used for ranking when rollout enabled */
    finalScore?: number;
    scoreBreakdown?: {
      baseU: number;
      baseP: number;
      rolloutU?: number;
      rolloutP?: number;
      blendedU: number;
      blendedP: number;
    };
    /** Monte Carlo 采样详情（当 usedMonteCarlo 时） */
    samplingDetails?: { totalSamples: number; effectiveSampleSize?: number };
    /** Optional learned / auxiliary scores; never carries Gate verdicts. */
    scorerSidecar?: CandidateScorerPerCandidateOutput;
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
  /**
   * 地形认知不确定性：effort01 同时驱动采样预算与 MC 置信区间膨胀（自知高风险）。
   */
  terrainEpistemics?: {
    topCandidateEffort01: number;
    topConfidenceIntervalInflation: number;
    earlyWarningTerrain: boolean;
  };
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
    @Optional() private readonly planFeatures?: PlanFeaturesService,
    @Optional() private readonly exposureMap?: ExposureMapService,
    @Optional() @Inject(CANDIDATE_SCORER) private readonly candidateScorer?: ICandidateScorer,
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
      /** 可选的随机种子，用于蒙特卡洛的可重现性（重放测试/持续集成）。 */
      seed?: number;
      useUtilityPrior?: boolean;
      /** 专利 3.6.1：采样概率 ∝ exp(β·Û(a))·σ(a)，启用时按效用先验分配采样预算 */
      useUtilityWeightedSampling?: boolean;
      /** 效用加权采样的 β（默认 2，Û 高则多采样） */
      utilityWeightedBeta?: number;
      /** 用于方差分配时每个候选的试点样本数（当 useUtilityWeightedSampling=true 时） */
      pilotSamplesPerCandidate?: number;
      useWorldModelRollout?: boolean;
      rolloutTopK?: number;
      /** 世界模型 rollout 的多步 horizon（工程近似：重复 predictOutcome 并融合） */
      rolloutHorizonSteps?: number;
      /** 专利 3.12.2：Exploration 系数 β，U'(a)=U(a)+β·InformationGain(a)，0 表示关闭 */
      explorationBeta?: number;
      /** 专利 3.6.2 定理 5：UCB 探索，Regret(T)=O(log T)，与 explorationBeta 二选一 */
      explorationStrategy?: 'INFORMATION_GAIN' | 'UCB' | 'NONE';
      /** UCB 常数 c，score = Û(a) + c·√(ln(T+1)/(N_a+1)) */
      explorationC?: number;
      /** 可插拔的候选评分器；影子模式仅附加附属信息（不改变排序）. */
      candidateScorer?: { mode: 'off' | 'shadow' | 'active' };
      /**
       * RAG / Belief 侧主导 chunk 类（如 RULES、ROAD_STATUS）；存在高压类时抬高软约束默认 λ（__defaultSoft）。
       */
      retrievalCategoryHints?: string[];
      /**
       * 带 `ageHours` 的证据行；若传入则优先于此路径，并对 ROAD_STATUS / TRAFFIC_ALERT / GATE 做时效衰减。
       */
      retrievalCategoryEvidence?: RetrievalCategoryEvidence[];
      /**
      * 步骤3 蒙特卡洛排序权柄：
      * - deterministic：预排序 / 先验排序
      * - MC：符合条件时的最终排序
      * 默认值：禁用（仅观测模式）
       */
      mcRankAuthority?: {
        enabled?: boolean;
        /** 允许蒙特卡洛进行重排序所需的最小每候选样本数。 */
        minSamplesPerCandidate?: number;
        /** 可接受的最大 top1 置信区间宽度；未定义则跳过此门控。 */
        maxTopCiWidth?: number;
        /** 要求 top1 与 top2 的边际差值大于等于阈值；未定义则跳过此门控。 */
        minTopMargin?: number;
        /** 比较日志中包含的候选方案数量。 */
        compareTopN?: number;
      };
      /**
       * Emergency constraint injection (Sentinel hard mask).
       * When forbidden modes are present, CGUS will prune any matching segments from candidate plans
       * before feasibility projection and scoring, ensuring forbidden modes physically disappear from
       * the search space (not merely filtered post-hoc).
       */
      emergencyConstraints?: {
        forbidden_modes?: string[];
      };
    },
  ): Promise<CGUSSearchResult> {
    const forbiddenModes = (options?.emergencyConstraints?.forbidden_modes ?? []).map((x) => String(x).toUpperCase());
    const forbidDrive = forbiddenModes.includes('DRIVE') || forbiddenModes.includes('MOTORCYCLE');
    const forbidTransit = forbiddenModes.includes('TRANSIT');
    if (forbiddenModes.length > 0) {
      this.logger.log(`[CGUS] emergency hard mask: forbidden_modes=${JSON.stringify(forbiddenModes)}`);
    }

    const pruneCandidate = (c: CGUSCandidate): CGUSCandidate => {
      if (!c?.plan?.segments?.length) return c;
      if (!forbidDrive && !forbidTransit) return c;
      const before = c.plan.segments.length;
      const segs = c.plan.segments.filter((s: any) => {
        const t = String(s?.metadata?.type ?? s?.metadata?.itemType ?? '').toUpperCase();
        if (forbidDrive && t === 'DRIVE') return false;
        if (forbidTransit && t === 'TRANSIT') return false;
        return true;
      });
      if (segs.length === before) return c;
      this.logger.debug(
        `[CGUS Pruning] candidate=${c.id} segments ${before}→${segs.length} by forbidden_modes=${JSON.stringify(
          forbiddenModes,
        )}`,
      );
      return {
        ...c,
        plan: { ...(c.plan as any), segments: segs } as any,
        // If pruning removes everything, the candidate is not feasible for search.
        feasible: segs.length > 0 ? c.feasible : false,
      };
    };

    const maskedCandidates =
      forbiddenModes.length > 0
        ? candidates
            .map(pruneCandidate)
            .filter((c) => (c.plan?.segments?.length ?? 0) > 0)
        : candidates;

    const retrievalConstraintCoeffs =
      options?.retrievalCategoryEvidence?.length
        ? buildConstraintPenaltyCoefficientsFromRetrievalEvidence(options.retrievalCategoryEvidence)
        : buildConstraintPenaltyCoefficientsFromRetrievalHints(options?.retrievalCategoryHints);
    if (Object.keys(retrievalConstraintCoeffs).length > 0) {
      this.logger.debug(
        `[CGUS] retrieval λ boost: hints=${JSON.stringify(options?.retrievalCategoryHints)} ` +
          `evidence=${JSON.stringify(options?.retrievalCategoryEvidence)} → __defaultSoft=${retrievalConstraintCoeffs.__defaultSoft}`,
      );
    }

    // Step 1：可行域投影 A_f = {a | g_i(s,a) ≤ 0}
    const feasibleCandidates = maskedCandidates.filter((c) => c.feasible);
    if (feasibleCandidates.length === 0) {
      this.logger.warn('[CGUS] 无可行候选，返回按效用排序的全部候选（含不可行）');
    }
    const toRank = feasibleCandidates.length > 0 ? feasibleCandidates : maskedCandidates;

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
        constraintPenaltyCoefficients:
          Object.keys(retrievalConstraintCoeffs).length > 0 ? retrievalConstraintCoeffs : undefined,
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
      scorerSidecar: undefined as CandidateScorerPerCandidateOutput | undefined,
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
        // Align Monte Carlo scoring weights with deterministic objective function when available.
        // This reduces drift between deterministic utility ranking and E[U] estimates.
        const mcWeights = this.objectiveFunction?.weights ?? DEFAULT_OBJECTIVE_WEIGHTS;
        const totalSampleBudget = options?.sampleSize ?? 200;
        const utilityWeightedBeta = options?.utilityWeightedBeta ?? 2;
        const minSamplesPerCandidate = 20;
        const pilotSamplesPerCandidate =
          options?.pilotSamplesPerCandidate ??
          Math.min(30, Math.max(10, Math.floor(minSamplesPerCandidate / 2)));

        // 专利 3.6.1：按 exp(β·Û)·σ 分配采样预算；σ 用 (1 + 软约束违反数) 近似不确定性
        let sampleAllocations: number[];
        let pilotVariancePerCandidate: Record<string, number> | undefined;
        let pilotEssPerCandidate: Record<string, number> | undefined;
        if (options?.useUtilityWeightedSampling === true && withPrior.some((r) => r.utilityPrior !== undefined)) {
          const sigmaProxy = (r: (typeof withPrior)[0]) => {
            const softCount = r.candidate.constraintViolations?.filter((v) => v.severity === 'SOFT').length ?? 0;
            let sigma = 1 + softCount * 0.2;
            if (this.planFeatures && r.candidate.plan) {
              const f = this.planFeatures.extract(r.candidate.plan);
              sigma *= 1 + 0.6 * f.slackTightness01 + 0.4 * f.effort01;
            }
            return sigma;
          };
          const uMin = Math.min(...withPrior.map((r) => r.utilityPrior ?? 0));
          const uRange = Math.max(1e-6, Math.max(...withPrior.map((r) => r.utilityPrior ?? 0)) - uMin);

          // Pilot: estimate variance / ESS per candidate, then allocate remaining budget.
          pilotVariancePerCandidate = {};
          pilotEssPerCandidate = {};
          const pilotResults = withPrior.map((r) => {
            const pilot = this.expectedUtility!.computeExpectedUtility(
              r.candidate.plan,
              probabilisticContext,
              mcWeights,
              {
                ...DEFAULT_MONTE_CARLO_CONFIG,
                sampleSize: pilotSamplesPerCandidate,
                seed: options?.seed,
                deterministicWorld: worldContext,
              },
            );
            pilotVariancePerCandidate![r.candidate.id] = pilot.statistics.variance ?? 0;
            pilotEssPerCandidate![r.candidate.id] =
              pilot.samplingDetails?.effectiveSampleSize ?? pilotSamplesPerCandidate;
            return pilot;
          });

          const baseBudget = Math.min(totalSampleBudget, withPrior.length * minSamplesPerCandidate);
          const remaining = Math.max(0, totalSampleBudget - baseBudget);

          const weights = withPrior.map((r, idx) => {
            const uNorm = ((r.utilityPrior ?? 0) - uMin) / uRange;
            const varEst = Math.max(1e-6, pilotResults[idx]?.statistics?.variance ?? 0.01);
            const varianceWeight = Math.sqrt(varEst);
            return Math.exp(utilityWeightedBeta * uNorm) * sigmaProxy(r) * varianceWeight;
          });
          const sumW = weights.reduce((s, w) => s + w, 0) || 1;
          sampleAllocations = weights.map((w) => {
            const extra = remaining > 0 ? Math.round((w / sumW) * remaining) : 0;
            return Math.max(minSamplesPerCandidate, Math.round(baseBudget / withPrior.length) + extra);
          });

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
            mcWeights,
            {
              ...DEFAULT_MONTE_CARLO_CONFIG,
              sampleSize: perSize,
              seed: options?.seed,
              deterministicWorld: worldContext,
            },
          );
          // IMPORTANT: Monte Carlo E[U] is computed from the objective function under sampled worlds.
          // To keep CGUS constraint-guidance meaningful, we must reflect soft constraint penalties in E[U]
          // (hard constraints are handled by feasible-candidate projection in Step 1).
          const dimensionScores = this.deriveDimensionScores(candidate, worldContext);
          const scoreNoConstraints = this.unifiedFormula.computeUnifiedScore({
            dimensionScores,
            weights: DEFAULT_UNIFIED_WEIGHTS,
            constraintViolations: [],
            riskPenalty: this.deriveRiskPenalty(candidate, worldContext),
            preferenceScore: 0,
          });
          const scoreWithConstraints = this.unifiedFormula.computeUnifiedScore({
            dimensionScores,
            weights: DEFAULT_UNIFIED_WEIGHTS,
            constraintViolations: candidate.constraintViolations ?? [],
            constraintPenaltyCoefficients:
              Object.keys(retrievalConstraintCoeffs).length > 0 ? retrievalConstraintCoeffs : undefined,
            riskPenalty: this.deriveRiskPenalty(candidate, worldContext),
            preferenceScore: 0,
          });
          const softPenaltyDelta =
            Number.isFinite(scoreNoConstraints) && Number.isFinite(scoreWithConstraints)
              ? Math.max(0, scoreNoConstraints - scoreWithConstraints)
              : 0;
          (finalResults[i] as any).rawMonteCarloExpectedUtility = result.expectedUtility;
          (finalResults[i] as any).appliedSoftPenaltyDelta = softPenaltyDelta;
          finalResults[i].expectedUtility = Math.max(0, Math.min(1, result.expectedUtility - softPenaltyDelta));
          let terrainInflation = 1;
          if (this.planFeatures) {
            const effort01 = this.planFeatures.extract(candidate.plan).effort01;
            terrainInflation = 1 + Math.min(1.35, effort01 * 1.5);
          }
          let ciOut = result.confidenceInterval;
          if (
            ciOut &&
            terrainInflation > 1.001 &&
            Number.isFinite(ciOut.lower) &&
            Number.isFinite(ciOut.upper)
          ) {
            const mid = (ciOut.upper + ciOut.lower) / 2;
            const half = ((ciOut.upper - ciOut.lower) / 2) * terrainInflation;
            ciOut = { lower: mid - half, upper: mid + half, level: ciOut.level };
          }
          (finalResults[i] as any).terrainCiInflation = terrainInflation;
          finalResults[i].confidenceInterval = ciOut;
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
          pilotSamplesPerCandidate: usedUtilityWeightedAllocation ? pilotSamplesPerCandidate : undefined,
          samplesPerCandidate,
          pilotVariancePerCandidate,
          pilotEssPerCandidate,
          usedUtilityWeightedAllocation,
          dataSourceNote:
            '当前由 ProbabilisticWorldModel.fromDeterministicModel 从 worldContext 推断概率分布（天气、道路等），无外部预报 PDF 注入。若需真实不确定性，可扩展 physical.climateSeasonality 注入 API 分布参数。',
        };
      } catch (err) {
        this.logger.warn(`[CGUS] Monte Carlo 失败，使用确定性效用: ${(err as Error)?.message}`);
      }
    }

    /**
   * 步骤 3.5 — 胜者保护的 MC 重排序（默认策略语义固化）
   *
   * 设计目标：
   * - 保持蒙特卡洛“活跃”（指标 + top-N 排序信号），同时避免 top1 翻转产生过多噪声。
   *
   * 默认语义：
   * - **样本门控**：决定 MC 是否有资格参与（附加指标 / 影响排序）。
   * - **边际软门控**（minTopMargin）：决定是否允许 MC 改写确定性胜出者（top1 翻转）。
   *   - 如果 topMargin < minTopMargin：保留确定性 top1，但允许 MC 最终评估对 top2..topN 进行重排序。
   * - **置信度门控**：默认仅观测；后续可通过 maxTopCiWidth 开启。
   *
   * 术语说明：
   * - “MC 有资格”并不意味着“MC 可以翻转胜出者”——而是指 MC 可以参与。
   * - 胜出者翻转由边际软门控单独控制。
   */
    const deterministicTopId = finalResults[0]?.candidate?.id;
    const mcAuthority = options?.mcRankAuthority;
    const mcRerankEnabled = mcAuthority?.enabled === true;
    const minSamplesPerCandidate = mcAuthority?.minSamplesPerCandidate ?? 20;
    const maxTopCiWidth = mcAuthority?.maxTopCiWidth;
    const minTopMargin = mcAuthority?.minTopMargin;
    const compareTopN = Math.max(1, Math.min(10, mcAuthority?.compareTopN ?? 5));

    const mcSorted = [...finalResults].sort((a, b) => {
      const ua = a.expectedUtility ?? a.utility;
      const ub = b.expectedUtility ?? b.utility;
      return ub - ua;
    });
    const mcTopId = mcSorted[0]?.candidate?.id;

    const sampleOk =
      usedMonteCarlo &&
      finalResults.every((r) => (r.samplingDetails?.totalSamples ?? 0) >= minSamplesPerCandidate);
    const topCi = mcSorted[0]?.confidenceInterval;
    const confidenceOk =
      !usedMonteCarlo
        ? false
        : maxTopCiWidth === undefined
          ? true
          : !!topCi && Number.isFinite(topCi.lower) && Number.isFinite(topCi.upper) && topCi.upper - topCi.lower <= maxTopCiWidth;
    const top1Provisional = mcSorted[0];
    const top2Provisional = mcSorted[1];
    const provisionalTopMargin =
      top1Provisional && top2Provisional
        ? (top1Provisional.expectedUtility ?? top1Provisional.utility) -
          (top2Provisional.expectedUtility ?? top2Provisional.utility)
        : undefined;
    const marginOk =
      !usedMonteCarlo
        ? false
        : minTopMargin === undefined
          ? true
          : (provisionalTopMargin ?? 0) >= minTopMargin;

    // NOTE: margin gate is a *winner flip* stabilizer, not an eligibility gate.
    // MC can still attach metrics / reorder non-winner candidates even when margin is small.
    const mcEligibleForRerank = usedMonteCarlo && sampleOk && confidenceOk;
    const sameWinner = !!deterministicTopId && !!mcTopId && deterministicTopId === mcTopId;

    // Stable rank authority observability (phase 1: observe-only by default).
    this.logger.log(
      `[CGUS] rank authority check: ${JSON.stringify({
        deterministicTopId,
        mcTopId,
        sameWinner,
        sampleOk,
        confidenceOk,
        marginOk,
        provisionalTopMargin,
        mcEligibleForRerank,
        mcRerankEnabled,
        minSamplesPerCandidate,
        maxTopCiWidth,
        minTopMargin,
      })}`,
    );

    const detRankById = new Map(finalResults.map((r, idx) => [r.candidate.id, idx + 1]));
    const mcRankById = new Map(mcSorted.map((r, idx) => [r.candidate.id, idx + 1]));
    const topCompare = mcSorted.slice(0, Math.min(compareTopN, mcSorted.length)).map((r) => ({
      id: r.candidate.id,
      deterministicRank: detRankById.get(r.candidate.id),
      deterministicScore: r.utility,
      rawMonteCarloExpectedUtility: (r as any).rawMonteCarloExpectedUtility,
      appliedSoftPenaltyDelta: (r as any).appliedSoftPenaltyDelta,
      finalExpectedUtility: r.expectedUtility ?? r.utility,
      mcRank: mcRankById.get(r.candidate.id),
    }));
    this.logger.log(`[CGUS] rank authority compareTopN: ${JSON.stringify(topCompare)}`);

    // Step 4：世界模型推演（可选，对 top-k 候选执行轨迹模拟）
    const rolloutTopK = options?.rolloutTopK ?? 3;
    const rolloutHorizonSteps = Math.max(1, Math.min(8, Math.floor(options?.rolloutHorizonSteps ?? 1)));
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
        // Use MC provisional ordering (when available) to pick rollout candidates,
        // but do NOT finalize rank authority until after rollout/exploration completes.
        const rolloutPool = usedMonteCarlo ? mcSorted : finalResults;
        const toRollout = rolloutPool.slice(0, Math.min(rolloutTopK, rolloutPool.length));
        for (let i = 0; i < toRollout.length; i++) {
          // Multi-step horizon fusion (lightweight): repeat prediction and blend over horizon.
          let fp = 1;
          let eu = 0;
          for (let h = 0; h < rolloutHorizonSteps; h++) {
            const pred = this.probabilisticWorldModel.predictOutcome(probContext, {
              type: 'PLAN_EVALUATION',
              payload: { candidateId: toRollout[i].candidate.id, rolloutStep: h, rolloutHorizonSteps },
            });
            const wNew = 1 / (h + 1);
            fp = h === 0 ? pred.feasibilityProbability : (1 - wNew) * fp + wNew * pred.feasibilityProbability;
            eu = h === 0 ? pred.estimatedUtility : (1 - wNew) * eu + wNew * pred.estimatedUtility;
          }
          finalResults[i].rolloutPrediction = {
            feasibilityProbability: fp,
            estimatedUtility: eu,
          };
        }
        usedRollout = true;

        // Rollout-aware re-ranking: integrate predicted feasibility/utility into ordering.
        // Semantics: prefer higher utility under plausible world evolutions while respecting feasibility.
        const scoreWithRollout = (r: (typeof finalResults)[0]) => {
          const baseU = r.expectedUtility ?? r.utility;
          const baseP = r.feasibilityProbability ?? 1;
          const rollU = r.rolloutPrediction?.estimatedUtility;
          const rollP = r.rolloutPrediction?.feasibilityProbability;
          const blendedU = rollU !== undefined ? 0.75 * baseU + 0.25 * rollU : baseU;
          const blendedP = rollP !== undefined ? Math.min(baseP, rollP) : baseP;
          const finalScore = blendedU * blendedP;
          (r as any).finalScore = finalScore;
          (r as any).scoreBreakdown = {
            baseU,
            baseP,
            rolloutU: rollU,
            rolloutP: rollP,
            blendedU,
            blendedP,
          };
          return finalScore;
        };
        finalResults.sort((a, b) => scoreWithRollout(b) - scoreWithRollout(a));
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

    // 可选的候选评分器附属信息（影子模式会附加该信息，但不进行重新排序）。
    const scorerOpts = options?.candidateScorer;
    let scorerMode = scorerOpts?.mode;
    if (scorerMode === 'active') {
      this.logger.warn('[CGUS] candidateScorer mode=active is disabled; coercing to shadow');
      scorerMode = 'shadow';
    }
    if (scorerMode && scorerMode !== 'off' && this.candidateScorer && finalResults.length > 0) {
      try {
        const latent = latentSnapshotFromWorldContext(worldContext);
        const batch = await this.candidateScorer.score({
          candidates: finalResults.map((r) => ({
            id: r.candidate.id,
            feasible: r.candidate.feasible,
            plan: r.candidate.plan,
          })),
          worldContext,
          latent,
          mode: scorerMode,
        });
        const byId = new Map(batch.perCandidate.map((p) => [p.candidateId, p]));
        for (const r of finalResults) {
          const s = byId.get(r.candidate.id);
          if (s) r.scorerSidecar = s;
        }
      } catch (e: any) {
        this.logger.warn(`[CGUS] CandidateScorer failed: ${e?.message}`);
      }
    }

    const recommended = finalResults.find((r) => r.candidate.feasible)?.candidate;

    // 在所有价值增强步骤（rollout/exploration）完成后的最终 MC 排序权柄。
    // 若门控条件通过，则 MC 接管最终排序；否则保持当前顺序。
    const winnerSource: 'deterministic' | 'mc' | 'fallback' =
      mcRerankEnabled && mcEligibleForRerank ? (marginOk ? 'mc' : 'deterministic') : usedMonteCarlo ? 'deterministic' : 'fallback';
    if (mcRerankEnabled && mcEligibleForRerank) {
      // 使用最新的候选指标（预期效用/最终得分）重新计算 MC 排序。
      const mcFinalSorted = [...finalResults].sort((a, b) => {
        const ua = (a as any).finalScore ?? a.expectedUtility ?? a.utility;
        const ub = (b as any).finalScore ?? b.expectedUtility ?? b.utility;
        return ub - ua;
      });
      if (marginOk) {
        finalResults.splice(0, finalResults.length, ...mcFinalSorted);
      } else if (deterministicTopId) {
        // 软门控：保留确定性胜出者为第一名，但允许 MC 对其余候选进行重新排序。
        const detWinner = finalResults.find((r) => r.candidate.id === deterministicTopId);
        const rest = mcFinalSorted.filter((r) => r.candidate.id !== deterministicTopId);
        finalResults.splice(0, finalResults.length, ...(detWinner ? [detWinner, ...rest] : rest));
      } else {
        finalResults.splice(0, finalResults.length, ...mcFinalSorted);
      }
    }
    const winnerChanged =
      winnerSource === 'mc' && !!deterministicTopId && !!finalResults[0]?.candidate?.id && deterministicTopId !== finalResults[0].candidate.id;

    if (explorationStrategy === 'UCB' && this.ucbVisitTracker && recommended) {
      this.ucbVisitTracker.recordSelection(recommended.id);
    }

    const complexityReport =
      this.complexityAnalysis?.estimateComplexity(
        candidates.length,
        feasibleCandidates.length,
        options?.rolloutTopK ?? 3,
      );

    // Ranking diagnostics: make constraint-vs-sampling contributions mechanically inspectable.
    // This log is intentionally compact and stable for regression/debugging.
    const rankingSummary = finalResults.map((r, idx) => ({
      id: r.candidate.id,
      rawMonteCarloExpectedUtility: (r as any).rawMonteCarloExpectedUtility,
      expectedUtility: r.expectedUtility,
      feasibilityProbability: r.feasibilityProbability,
      confidenceInterval: r.confidenceInterval,
      appliedSoftPenaltyDelta: (r as any).appliedSoftPenaltyDelta,
      finalRank: idx + 1,
    }));
    this.logger.log(
      `[CGUS] ranking summary: ${JSON.stringify({
        winnerSource,
        winnerChanged,
        ranking: rankingSummary,
      })}`,
    );

    this.logger.debug(
      `[CGUS] 完成: candidates=${candidates.length} feasible=${feasibleCandidates.length} ` +
        `recommended=${!!recommended} monteCarlo=${usedMonteCarlo} rollout=${usedRollout} exploration=${usedExploration}`,
    );

    const primary = finalResults.find((r) => r.candidate.feasible) ?? finalResults[0];
    let terrainEpistemics: CGUSSearchResult['terrainEpistemics'];
    if (primary && this.planFeatures) {
      const f = this.planFeatures.extract(primary.candidate.plan);
      const inf = (primary as any).terrainCiInflation ?? 1;
      terrainEpistemics = {
        topCandidateEffort01: f.effort01,
        topConfidenceIntervalInflation: inf,
        earlyWarningTerrain: f.effort01 >= 0.5 && inf >= 1.12,
      };
    }

    return {
      rankedCandidates: finalResults,
      recommended,
      usedMonteCarlo,
      usedRollout,
      usedExploration,
      complexityReport,
      monteCarloSamplingDetails,
      terrainEpistemics,
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
      // dayIndex 在系统内为 1-based（1..N），因此总天数应为 maxDayIndex（而非 +1）
      const totalDays = Math.max(1, maxDayIndex);
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

    // 4. 危险区域风险（基于 hazardZones 的 level）
    if (physical?.hazardZones) {
      const highHazards = physical.hazardZones.filter(h => h.level === 'HIGH');
      const mediumHazards = physical.hazardZones.filter(h => h.level === 'MEDIUM');
      risk += highHazards.length * 0.15;
      risk += mediumHazards.length * 0.05;
    }

    // 5. 气候季节性风险因素
    const riskFactors = physical?.climateSeasonality?.riskFactors ?? [];
    risk += riskFactors.length * 0.05;

    return Math.max(0, Math.min(1, risk));
  }
}
