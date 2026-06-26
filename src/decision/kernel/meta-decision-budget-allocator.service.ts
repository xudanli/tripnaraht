import { Injectable } from '@nestjs/common';
import type { DecisionState, UncertaintyProfile, BeliefStateSample } from './decision-state.types';
import type { UncertaintyBudgetDraft } from './meta-decision-budget.types';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function safeLn(x: number): number {
  return Math.log(Math.max(x, 1e-12));
}

/**
 * Kernel 级元决策（最小实现）
 *
 * 目标：把“环境不确定性”显式化为可审计的预算参数（entropy/ESS/sampleSize）。
 * 专利口径的最小证据链：
 * - RESEARCH 写入 uncertaintyProfile + beliefSamples
 * - 后续模块可读取 suggestedSampleSize 作为 Monte Carlo/rollout 的预算入口
 */
@Injectable()
export class MetaDecisionBudgetAllocatorService {
  /**
   * 从 DSO 抽取不确定性来源与 proxy 信号（不直接写入 DSO）。
   * 真正的 entropy01 / ESS / rolloutTopK / planningDepth 在 finalize 阶段由粒子权重确定。
   */
  deriveUncertaintyBudget(dso: DecisionState): UncertaintyBudgetDraft {
    const sources: NonNullable<UncertaintyProfile['sources']> = [];
    const env = dso.environmentState ?? {};

    const weatherRisk = typeof env.weatherRisk === 'number' ? env.weatherRisk : undefined;
    if (weatherRisk !== undefined && weatherRisk > 0.2) sources.push('weather');

    // road: 目前用 roadConditions 是否存在作为 proxy（后续可替换为粒子滤波/观测噪声指标）
    if (env.roadConditions && Object.keys(env.roadConditions).length > 0) sources.push('road');

    // human: 用 party 中的 fitness/riskTolerance 缺口或能力不确定性作为 proxy（最小实现：若未给出则不加）
    const rt = dso.userIntent?.party?.riskTolerance;
    const fl = dso.userIntent?.party?.fitnessLevel;
    if ((typeof rt === 'string' && rt.trim().length === 0) || (typeof fl === 'string' && fl.trim().length === 0)) {
      sources.push('human');
    }

    // budget: 若有预算但未给出弹性/偏好，视为预算不确定（最小实现）
    if (typeof dso.userIntent?.budget === 'number' && dso.userIntent.budget > 0 && dso.userIntent.flexibility === undefined) {
      sources.push('budget');
    }

    const hasUncertainty = sources.length > 0;

    // proxyEntropy01：工程近似（后续可被粒子滤波/观测模型替换）
    let proxyEntropy01 = 0;
    if (weatherRisk !== undefined) proxyEntropy01 = Math.max(proxyEntropy01, clamp01(weatherRisk));
    if (env.failureRiskLevel === 'HIGH') proxyEntropy01 = Math.max(proxyEntropy01, 0.85);
    else if (env.failureRiskLevel === 'MEDIUM') proxyEntropy01 = Math.max(proxyEntropy01, 0.6);
    else if (env.failureRiskLevel === 'LOW') proxyEntropy01 = Math.max(proxyEntropy01, 0.3);

    return {
      hasUncertainty,
      sources: hasUncertainty ? Array.from(new Set(sources)) : undefined,
      proxyEntropy01: hasUncertainty ? clamp01(proxyEntropy01) : 0,
    };
  }

  /**
   * 由 proxy + 粒子权重分布 finalize 写入 DSO 的 UncertaintyProfile。
   */
  finalizeUncertaintyProfile(
    draft: UncertaintyBudgetDraft,
    beliefSamples: BeliefStateSample[],
  ): UncertaintyProfile {
    if (!draft.hasUncertainty || beliefSamples.length === 0) {
      return {
        hasUncertainty: false,
        sources: undefined,
        entropy01: 0,
        effectiveParticleCount: undefined,
        suggestedSampleSize: 0,
        rolloutTopK: undefined,
        planningDepth: undefined,
      };
    }

    const effN = this.computeEffectiveParticleCount(beliefSamples);
    const entropyW = this.computeEntropy01(beliefSamples);
    const entropySignal = Math.max(draft.proxyEntropy01, entropyW);

    let suggestedSampleSize =
      entropySignal >= 0.85 ? 240 : entropySignal >= 0.6 ? 160 : entropySignal >= 0.3 ? 80 : 40;

    // 粒子退化（ESS 过低）→ 提高采样预算（最小工程规则）
    const minEss = Math.max(10, Math.min(200, Math.floor(0.15 * beliefSamples.length)));
    if (effN < minEss) {
      suggestedSampleSize = Math.min(2000, Math.floor(suggestedSampleSize * 1.25));
    }

    const rolloutTopK = Math.round(2 + 6 * entropySignal); // [2,8]
    const planningDepth = entropySignal >= 0.75 ? 4 : entropySignal >= 0.5 ? 3 : entropySignal >= 0.25 ? 2 : 1;
    const explorationBeta =
      entropySignal >= 0.85 ? 0.4 : entropySignal >= 0.6 ? 0.25 : entropySignal >= 0.3 ? 0.15 : 0;

    return {
      hasUncertainty: true,
      sources: draft.sources,
      entropy01: clamp01(entropySignal),
      effectiveParticleCount: effN,
      suggestedSampleSize,
      rolloutTopK,
      planningDepth,
      explorationBeta,
    };
  }

  /**
   * 生成最小的 beliefSamples（离散粒子近似占位）。
   * - environmentSummary 从 DSO 的 EnvironmentState 抽取关键数值指标
   */
  buildBeliefSamples(dso: DecisionState, n: number, proxyEntropy01?: number): BeliefStateSample[] {
    const env = dso.environmentState ?? {};
    const summary: Record<string, number> = {};
    if (typeof env.weatherRisk === 'number') summary.weatherRisk = clamp01(env.weatherRisk);
    if (typeof env.crowdLevel === 'number') summary.crowdLevel = clamp01(env.crowdLevel);
    const rc = env.roadConditions as Record<string, unknown> | undefined;
    const aggPass = rc?._aggregatePassability;
    if (typeof aggPass === 'number' && Number.isFinite(aggPass)) {
      summary.passability = clamp01(aggPass);
    }
    // failureRiskLevel 不是数值，这里只做粗映射
    if (env.failureRiskLevel === 'HIGH') summary.failureRisk = 0.85;
    else if (env.failureRiskLevel === 'MEDIUM') summary.failureRisk = 0.6;
    else if (env.failureRiskLevel === 'LOW') summary.failureRisk = 0.3;

    const count = Math.max(0, Math.min(2000, Math.floor(n)));
    if (count === 0) return [];

    // 生成“非均匀但可审计”的权重分布（最小实现）
    // 目标：让 entropy/ESS 不是恒等于 ln(N)/N 的均匀分布，便于形成专利证据链。
    // 这里用一个由 weatherRisk 驱动的尖锐程度参数，构造一维的 softmax 权重。
    const weatherRisk = typeof env.weatherRisk === 'number' ? clamp01(env.weatherRisk) : undefined;
    const proxy = typeof proxyEntropy01 === 'number' ? clamp01(proxyEntropy01) : 0.5;
    const center = weatherRisk ?? proxy;
    const sharpness = 1 + 6 * center; // [1,7]：不确定性越高，分布越“尖”（更低熵）
    const rawWeights: number[] = [];
    let z = 0;
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? center : i / (count - 1);
      const w = Math.exp(-sharpness * Math.abs(x - center));
      rawWeights.push(w);
      z += w;
    }
    const norm = z > 0 ? z : count;
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => ({
      sampleId: `b_${now}_${i}`,
      environmentSummary: summary,
      weight: rawWeights[i] / norm,
    }));
  }

  computeEffectiveParticleCount(samples: BeliefStateSample[]): number {
    if (!samples || samples.length === 0) return 0;
    const sumSq = samples.reduce((acc, s) => acc + Math.pow(s.weight ?? 0, 2), 0);
    return sumSq > 0 ? 1 / sumSq : 0;
  }

  /**
   * 归一化熵 entropy01 = H(w) / ln(N)，范围约为 [0,1]。
   * - w 为粒子权重（应已归一化）
   */
  computeEntropy01(samples: BeliefStateSample[]): number {
    if (!samples || samples.length <= 1) return 0;
    const n = samples.length;
    let h = 0;
    for (const s of samples) {
      const w = s.weight ?? 0;
      if (w <= 0) continue;
      h += -w * safeLn(w);
    }
    return clamp01(h / safeLn(n));
  }
}

