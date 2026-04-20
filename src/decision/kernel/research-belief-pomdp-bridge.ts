/**
 * RESEARCH 阶段：在 MetaAllocator 粒子之后，可选叠加 POMDP 信念更新（观测似然重加权）
 *
 * - 使用 dsoToMinimalWorldModelContext → ProbabilisticWorldModel.fromDeterministicModel
 * - 观测：DefaultObservationModel 已支持 windSpeed（m/s）
 *   - 优先使用 researchData / environmentState 中的显式风速字段（独立测量通道）
 *   - 否则回退：由 weatherRisk 标量映射为等效风速（并在 provenance 中标明，避免过度声称）
 * - 失败或未注入服务时返回 null（走纯 MetaAllocator 路径）
 */

import type { DecisionState, BeliefStateSample } from './decision-state.types';
import { dsoToMinimalWorldModelContext } from './dso-to-world-model-converter';
import type { ProbabilisticWorldModelService } from '../../trips/decision/optimization/probabilistic/probabilistic-world-model.service';
import type { BeliefState, BeliefUpdateService } from '../../trips/decision/optimization/probabilistic/belief-update.service';
import { DefaultObservationModelService } from '../../trips/decision/optimization/probabilistic/default-observation-model.service';
import { loadRefinementThresholdsConfig, thresholdsBucketKey } from './refinement-thresholds.config';
import type {
  DecisionAction,
  WorldStateObservation,
  WorldStateSample,
} from '../../trips/decision/optimization/probabilistic/probabilistic-world-model.interface';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function readWeatherRisk01(
  researchData: Record<string, unknown>,
  dso: DecisionState,
): number {
  const rd = researchData?.weatherRisk ?? researchData?.weather_risk;
  if (typeof rd === 'number' && Number.isFinite(rd)) return clamp01(rd);
  const env = dso.environmentState as Record<string, unknown> | undefined;
  const er = env?.weatherRisk;
  if (typeof er === 'number' && Number.isFinite(er)) return clamp01(er);
  return 0.35;
}

function finiteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** 专利/科学审计：观测风速来自哪条数据通道（避免与先验同源时过度声称） */
export type WindObservationProvenance =
  | 'research_data.windSpeedMs'
  | 'research_data.wind_speed_ms'
  | 'research_data.wind_speed_mps'
  | 'research_data.meanWindSpeedMs'
  | 'research_data.wind_speed_kmh'
  | 'research_data.weather.windSpeedMs'
  | 'research_data.risk_assessment.windSpeedMs'
  | 'research_data.failure_risk_prediction.predictions[0].windSpeed'
  | 'environment_state.windSpeedMs'
  | 'derived_from_weather_risk_scalar';

export type ObservationQuality = 'HIGH' | 'MEDIUM' | 'LOW';

export type ObservationIndependenceTier = 'STRONG_EXTERNAL' | 'STRONG_INTERNAL' | 'WEAK';

export function windProvenanceToQuality(
  p: WindObservationProvenance,
  options?: { windSpeedMetaSource?: string },
): ObservationQuality {
  if (p === 'derived_from_weather_risk_scalar') return 'LOW';
  // 明确区分：外部 forecast（第三方/传感器） vs 内部推断
  if (options?.windSpeedMetaSource === 'weather_forecast') return 'HIGH';
  if (options?.windSpeedMetaSource === 'weather_predictions') return 'MEDIUM';
  if (options?.windSpeedMetaSource === 'failure_risk_prediction') return 'MEDIUM';

  if (p === 'research_data.wind_speed_kmh') return 'HIGH';
  return 'MEDIUM';
}

export type SimpleObservationProvenance =
  | WindObservationProvenance
  | 'research_data.weather_forecast.forecasts[0].visibility_km'
  | 'research_data.weather_predictions[0].visibility'
  | 'research_data.weather_forecast.forecasts[0].precipitation.amount_mm'
  | 'research_data.weather_predictions[0].precipitation'
  | 'research_data.road_conditions'
  | 'dso.tripState.fatigue';

export function simpleProvenanceToQuality(p: SimpleObservationProvenance): ObservationQuality {
  if (p === 'derived_from_weather_risk_scalar') return 'LOW';
  if (p.startsWith('research_data.weather_forecast')) return 'HIGH';
  if (p.startsWith('research_data.weather_predictions')) return 'MEDIUM';
  if (p === 'research_data.road_conditions') return 'MEDIUM';
  if (p === 'dso.tripState.fatigue') return 'MEDIUM';
  return 'MEDIUM';
}

export function simpleProvenanceToIndependenceTier(
  p: SimpleObservationProvenance,
  options?: { windSpeedMetaSource?: string; evidenceSources?: string[] },
): ObservationIndependenceTier {
  if (p === 'derived_from_weather_risk_scalar') return 'WEAK';
  // 证据来源优先：若明确来自 WeatherAgent.getForecast 之类外部数据源 → STRONG_EXTERNAL
  if (options?.evidenceSources?.some((s) => typeof s === 'string' && s.toLowerCase().includes('weatheragent'))) {
    return 'STRONG_EXTERNAL';
  }
  // 优先使用 windSpeedMeta.source 来严格区分推断 vs 外部 forecast（满足科学家口径）
  if (options?.windSpeedMetaSource === 'weather_forecast') return 'STRONG_EXTERNAL';
  if (options?.windSpeedMetaSource === 'weather_predictions') return 'STRONG_INTERNAL';
  if (options?.windSpeedMetaSource === 'failure_risk_prediction') return 'STRONG_INTERNAL';

  // 回退：按 provenance 前缀区分
  if (p.startsWith('research_data.weather_forecast')) return 'STRONG_EXTERNAL';
  if (p.startsWith('research_data.weather_predictions')) return 'STRONG_INTERNAL';
  if (p === 'research_data.wind_speed_kmh') return 'STRONG_EXTERNAL';
  if (p === 'research_data.failure_risk_prediction.predictions[0].windSpeed') return 'STRONG_INTERNAL';
  return 'STRONG_INTERNAL';
}

/**
 * 从 RESEARCH 输出与环境状态中抽取用于似然的观测风速（m/s）。
 * 优先级：显式 m/s → km/h 换算 → weatherRisk 工程映射。
 */
export function extractObservedWindSpeedMsForBelief(
  researchData: Record<string, unknown>,
  dso: DecisionState,
): { observedWindSpeedMs: number; provenance: WindObservationProvenance } {
  const pick = (v: unknown, p: WindObservationProvenance): { observedWindSpeedMs: number; provenance: WindObservationProvenance } | null => {
    const n = finiteNumber(v);
    if (n === undefined) return null;
    return { observedWindSpeedMs: n, provenance: p };
  };

  const rd = researchData;
  const env = (dso.environmentState ?? {}) as Record<string, unknown>;

  const direct =
    pick(rd.windSpeedMs, 'research_data.windSpeedMs') ??
    pick(rd.wind_speed_ms, 'research_data.wind_speed_ms') ??
    pick(rd.wind_speed_mps, 'research_data.wind_speed_mps') ??
    pick(rd.meanWindSpeedMs, 'research_data.meanWindSpeedMs');
  if (direct) return direct;

  const kmh = finiteNumber(rd.wind_speed_kmh ?? rd.windSpeedKmh);
  if (kmh !== undefined && kmh >= 0) {
    return { observedWindSpeedMs: kmh / 3.6, provenance: 'research_data.wind_speed_kmh' };
  }

  if (rd.weather && typeof rd.weather === 'object' && !Array.isArray(rd.weather)) {
    const w = rd.weather as Record<string, unknown>;
    const nested =
      pick(w.windSpeedMs, 'research_data.weather.windSpeedMs') ??
      pick(w.wind_speed_ms, 'research_data.weather.windSpeedMs') ??
      pick(w.speed_mps, 'research_data.weather.windSpeedMs');
    if (nested) return nested;
  }

  if (rd.risk_assessment && typeof rd.risk_assessment === 'object' && !Array.isArray(rd.risk_assessment)) {
    const ra = rd.risk_assessment as Record<string, unknown>;
    const fromRa =
      pick(ra.windSpeedMs, 'research_data.risk_assessment.windSpeedMs') ??
      pick(ra.wind_speed_ms, 'research_data.risk_assessment.windSpeedMs') ??
      pick(ra.mean_wind_mps, 'research_data.risk_assessment.windSpeedMs');
    if (fromRa) return fromRa;
  }

  const frp = rd.failure_risk_prediction;
  if (frp && typeof frp === 'object' && !Array.isArray(frp)) {
    const preds = (frp as { predictions?: unknown }).predictions;
    if (Array.isArray(preds) && preds.length > 0 && preds[0] && typeof preds[0] === 'object') {
      const p0 = preds[0] as Record<string, unknown>;
      const ws = finiteNumber(p0.windSpeed);
      if (ws !== undefined) {
        return { observedWindSpeedMs: ws, provenance: 'research_data.failure_risk_prediction.predictions[0].windSpeed' };
      }
    }
  }

  const fromEnv =
    pick(env.windSpeedMs, 'environment_state.windSpeedMs') ??
    pick(env.wind_speed_ms, 'environment_state.windSpeedMs') ??
    pick(env.observedWindSpeedMs, 'environment_state.windSpeedMs');
  if (fromEnv) return fromEnv;

  const wr = readWeatherRisk01(researchData, dso);
  return {
    observedWindSpeedMs: 5 + 25 * wr,
    provenance: 'derived_from_weather_risk_scalar',
  };
}

/** 将 Kernel 的 beliefSample 映射为 POMDP 粒子上的 WorldStateSample（确定性、可复现） */
export function beliefSampleToWorldStateSample(sample: BeliefStateSample, index: number): WorldStateSample {
  const es = sample.environmentSummary ?? {};
  const wr =
    typeof es.weatherRisk === 'number' && Number.isFinite(es.weatherRisk) ? clamp01(es.weatherRisk) : 0.35;
  const jitter = ((index % 11) - 5) * 0.01;
  const w = clamp01(wr + jitter);
  return {
    sampleId: sample.sampleId || `ws_${index}`,
    weather: {
      windSpeedMs: 5 + 25 * w,
      precipitationMm: 20 * w,
      visibilityM: Math.max(200, 9500 - 9000 * w),
      temperatureC: 12 + 8 * (1 - w),
      condition: w > 0.65 ? 'RAIN' : 'CLEAR',
    },
    roadStatuses: [],
    humanCapability: {
      maxDailyAscentM: 600 + 400 * (1 - w),
      fatigueThreshold: 0.5 + 0.25 * w,
      recoveryRate: 0.12 + 0.12 * (1 - w),
    },
    hazardLevels: [],
    feasibilityScore:
      typeof sample.feasibilityScore === 'number' && Number.isFinite(sample.feasibilityScore)
        ? clamp01(sample.feasibilityScore)
        : 0.55,
  };
}

export function beliefSamplesToPomdpBelief(samples: BeliefStateSample[]): BeliefState[] {
  const n = samples.length || 1;
  return samples.map((s, i) => ({
    particleId: s.sampleId || `p_${i}`,
    sample: beliefSampleToWorldStateSample(s, i),
    weight: typeof s.weight === 'number' && Number.isFinite(s.weight) ? s.weight : 1 / n,
  }));
}

export function pomdpBeliefToBeliefStateSamples(belief: BeliefState[]): BeliefStateSample[] {
  return belief.map((b, i) => {
    const s = b.sample;
    const vis01 = clamp01(1 - s.weather.visibilityM / 10000);
    const condBump = s.weather.condition === 'RAIN' || s.weather.condition === 'SNOW' ? 0.75 : 0.15;
    const weatherRisk = clamp01(0.55 * vis01 + 0.45 * condBump);
    return {
      sampleId: b.particleId || `b_${i}`,
      environmentSummary: {
        weatherRisk,
        // 轻量但更可解释：保留关键观测维度（m/s、mm、m、°C）
        windSpeedMs: Number(s.weather.windSpeedMs) || 0,
        precipitationMm: Number(s.weather.precipitationMm) || 0,
        visibilityM: Number(s.weather.visibilityM) || 0,
        temperatureC: Number(s.weather.temperatureC) || 0,
      },
      weight: b.weight,
      feasibilityScore: typeof s.feasibilityScore === 'number' ? s.feasibilityScore : undefined,
    };
  });
}

export function buildWindSpeedObservationForBelief(
  researchData: Record<string, unknown>,
  dso: DecisionState,
): {
  observation: WorldStateObservation;
  provenance: WindObservationProvenance;
  observedWindSpeedMs: number;
  quality: ObservationQuality;
  independenceTier: ObservationIndependenceTier;
} {
  const { observedWindSpeedMs, provenance } = extractObservedWindSpeedMsForBelief(researchData, dso);
  const windSpeedMetaSource =
    (researchData as any)?.windSpeedMs_meta && typeof (researchData as any).windSpeedMs_meta === 'object'
      ? String((researchData as any).windSpeedMs_meta.source ?? '')
      : undefined;
  const windEvidenceSources =
    (researchData as any)?.windSpeedMs_meta?.evidence?.sources && Array.isArray((researchData as any).windSpeedMs_meta.evidence.sources)
      ? ((researchData as any).windSpeedMs_meta.evidence.sources as string[])
      : undefined;
  const quality = windProvenanceToQuality(provenance, { windSpeedMetaSource });
  const independenceTier = simpleProvenanceToIndependenceTier(provenance, {
    windSpeedMetaSource,
    evidenceSources: windEvidenceSources,
  });
  return {
    observation: {
      timestamp: new Date().toISOString(),
      type: 'WEATHER',
      observation: { variable: 'windSpeed', value: observedWindSpeedMs },
      quality,
    },
    provenance,
    observedWindSpeedMs,
    quality,
    independenceTier,
  };
}

export function extractObservedVisibilityMForBelief(
  researchData: Record<string, unknown>,
): { visibilityM: number; provenance: SimpleObservationProvenance } | null {
  const wf = researchData.weather_forecast as any;
  const f0 = Array.isArray(wf?.forecasts) ? wf.forecasts[0] : undefined;
  const visKm = finiteNumber(f0?.visibility_km);
  if (visKm !== undefined) {
    return { visibilityM: visKm * 1000, provenance: 'research_data.weather_forecast.forecasts[0].visibility_km' };
  }
  const wp = researchData.weather_predictions as any;
  const p0 = Array.isArray(wp) ? wp[0] : undefined;
  const vis = finiteNumber(p0?.visibility);
  if (vis !== undefined) {
    // weather_predictions.visibility 在现有 util 里以“米”为语义（与 FailureRiskPredictionService 一致）
    return { visibilityM: vis, provenance: 'research_data.weather_predictions[0].visibility' };
  }
  return null;
}

export function extractObservedPrecipitationMmForBelief(
  researchData: Record<string, unknown>,
): { precipitationMm: number; provenance: SimpleObservationProvenance } | null {
  const wf = researchData.weather_forecast as any;
  const f0 = Array.isArray(wf?.forecasts) ? wf.forecasts[0] : undefined;
  const mm = finiteNumber(f0?.precipitation?.amount_mm);
  if (mm !== undefined) {
    return { precipitationMm: mm, provenance: 'research_data.weather_forecast.forecasts[0].precipitation.amount_mm' };
  }
  const wp = researchData.weather_predictions as any;
  const p0 = Array.isArray(wp) ? wp[0] : undefined;
  const pmm = finiteNumber(p0?.precipitation);
  if (pmm !== undefined) {
    return { precipitationMm: pmm, provenance: 'research_data.weather_predictions[0].precipitation' };
  }
  return null;
}

export function extractObservedRoadClosure01ForBelief(
  researchData: Record<string, unknown>,
): { roadClosure01: number; provenance: SimpleObservationProvenance } | null {
  const rc = (researchData.road_conditions ?? researchData.roadConditions) as unknown;
  if (rc && typeof rc === 'object') {
    if (Array.isArray(rc)) {
      const total = rc.length;
      const closed = rc.filter((r: any) => String(r?.status ?? '').toUpperCase() === 'CLOSED').length;
      return total > 0 ? { roadClosure01: closed / total, provenance: 'research_data.road_conditions' } : null;
    }
    const obj = rc as Record<string, unknown>;
    const entries = Object.values(obj);
    const total = entries.length;
    const closed = entries.filter((v) => String((v as any)?.status ?? v ?? '').toUpperCase() === 'CLOSED').length;
    return total > 0 ? { roadClosure01: closed / total, provenance: 'research_data.road_conditions' } : null;
  }
  return null;
}

export function extractObservedFatigue01ForBelief(
  dso: DecisionState,
): { fatigue01: number; provenance: SimpleObservationProvenance } | null {
  const f = (dso.tripState as any)?.fatigue;
  if (typeof f === 'number' && Number.isFinite(f)) {
    return { fatigue01: clamp01(f), provenance: 'dso.tripState.fatigue' };
  }
  return null;
}

export interface ObservationUsedAudit {
  variable: 'windSpeed' | 'visibilityM' | 'precipitationMm' | 'roadClosure01' | 'fatigue01';
  value: number;
  provenance: SimpleObservationProvenance;
  quality: ObservationQuality;
  independenceTier: ObservationIndependenceTier;
}

function computeEss(particles: Array<{ weight: number }>): number {
  const sumSq = particles.reduce((s, p) => s + p.weight * p.weight, 0);
  return sumSq > 0 ? 1 / sumSq : 0;
}

function computeEntropy01FromWeights(weights: number[]): number {
  const n = weights.length;
  if (n <= 1) return 0;
  let h = 0;
  for (const w of weights) {
    const p = Math.max(1e-12, w);
    h += -p * Math.log(p);
  }
  const hMax = Math.log(n);
  return hMax > 0 ? Math.max(0, Math.min(1, h / hMax)) : 0;
}

function l1Delta(a: Array<{ weight: number }>, b: Array<{ weight: number }>): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs((b[i]?.weight ?? 0) - (a[i]?.weight ?? 0));
  return s;
}

function normalizeWeights(weights: number[]): number[] {
  const s = weights.reduce((a, b) => a + b, 0);
  if (s <= 0) return weights.map(() => 1 / Math.max(1, weights.length));
  return weights.map((w) => Math.max(0, w) / s);
}

function jsDivergence(pRaw: number[], qRaw: number[]): number {
  const p = normalizeWeights(pRaw);
  const q = normalizeWeights(qRaw);
  const n = Math.min(p.length, q.length);
  if (n === 0) return 0;
  const m = new Array(n);
  for (let i = 0; i < n; i++) m[i] = 0.5 * (p[i] + q[i]);
  const kl = (a: number[], b: number[]): number => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const ai = Math.max(1e-12, a[i]);
      const bi = Math.max(1e-12, b[i]);
      s += ai * Math.log(ai / bi);
    }
    return s;
  };
  return 0.5 * kl(p, m) + 0.5 * kl(q, m);
}

export interface BeliefUpdateStepAudit extends ObservationUsedAudit {
  entropy01After: number;
  essAfter: number;
  deltaEntropy01FromPrev: number;
  deltaEssFromPrev: number;
  weightL1DeltaFromPrev: number;
}

/** @deprecated 请使用 buildWindSpeedObservationForBelief（含 provenance）；保留供旧测试只关心 observation 形状 */
export function buildWindSpeedObservationFromResearch(
  researchData: Record<string, unknown>,
  dso: DecisionState,
): WorldStateObservation {
  return buildWindSpeedObservationForBelief(researchData, dso).observation;
}

export interface RefineBeliefWithPomdpParams {
  dso: DecisionState;
  researchData: Record<string, unknown>;
  beliefSamples: BeliefStateSample[];
  probabilisticWorldModel?: ProbabilisticWorldModelService;
  beliefUpdate?: BeliefUpdateService;
}

export interface RefineBeliefWithPomdpResult {
  refinedSamples: BeliefStateSample[];
  logNormalizationConstant?: number;
  pomdpEffectiveParticleCount?: number;
  /** 风速观测来源（审计 / 科学家口径） */
  observationProvenance?: WindObservationProvenance;
  /** 写入似然模型的观测风速 m/s */
  observedWindSpeedMs?: number;
  /** 观测质量（影响似然权重；审计用） */
  observationQuality?: ObservationQuality;
  /** 观测独立性分层（严格区分 external vs internal vs weak） */
  observationIndependenceTier?: ObservationIndependenceTier;
  /** Research 层风速聚合元信息（可回放审计） */
  windSpeedMeta?: { source?: string; aggregation?: string; sampleCount?: number };
  /** 权重更新的 L1 变化量（审计/判定“是否有效精炼”） */
  weightL1Delta?: number;
  /** JS divergence（用于更稳健的“是否有效精炼”判据） */
  weightJSDivergence?: number;
  /** 判据阈值（随粒子数缩放） */
  refinementThresholds?: { n: number; l1: number; js: number };
  /** 阈值来源（默认/配置文件） */
  refinementThresholdSource?: 'default' | 'config';
  refinementThresholdsConfigMeta?: { path?: string; generatedAt?: string; bucketKey?: string };
  /** 是否认为本次精炼有效（变化量超过阈值） */
  refinementEffective?: boolean;
  /** 本次精炼使用的观测列表（用于回放审计） */
  observationsUsed?: ObservationUsedAudit[];
  /** 分步审计：每个观测更新后的 entropy/ESS/Δ（用于诊断与回放） */
  beliefUpdateSteps?: BeliefUpdateStepAudit[];
  /** 多观测融合顺序（审计/回放） */
  observationFusionOrder?: Array<'windSpeed' | 'visibilityM' | 'precipitationMm' | 'roadClosure01' | 'fatigue01'>;
  /** 观测模型参数（σ²）快照，避免口径漂移 */
  observationModelParams?: {
    presetId?: string;
    windSpeedVariance: number;
    temperatureVariance: number;
    visibilityVariance: number;
    precipitationVariance: number;
    roadClosureVariance: number;
    fatigueVariance: number;
  };
}

/**
 * 若注入概率世界模型 + BeliefUpdate，则对粒子做一次贝叶斯重加权并映射回 BeliefStateSample。
 */
export async function refineBeliefWithPomdpIfAvailable(
  params: RefineBeliefWithPomdpParams,
): Promise<RefineBeliefWithPomdpResult | null> {
  if (process.env.DECISION_OS_RESEARCH_POMDP_BELIEF === '0') {
    return null;
  }
  const { dso, researchData, beliefSamples, probabilisticWorldModel, beliefUpdate } = params;
  if (!probabilisticWorldModel || !beliefUpdate || beliefSamples.length === 0) {
    return null;
  }

  const deterministic = dsoToMinimalWorldModelContext(dso);
  if (!deterministic) {
    return null;
  }

  let pomdpContext;
  try {
    pomdpContext = probabilisticWorldModel.fromDeterministicModel(deterministic);
  } catch {
    return null;
  }

  const currentBelief = beliefSamplesToPomdpBelief(beliefSamples);
  const { observation, provenance, observedWindSpeedMs, quality, independenceTier } = buildWindSpeedObservationForBelief(
    researchData,
    dso,
  );
  const env = (dso.environmentState ?? {}) as Record<string, unknown>;
  const observationModelParams = DefaultObservationModelService.readVarianceConfig({
    countryCode: typeof env.countryCode === 'string' ? env.countryCode : undefined,
    month: typeof env.month === 'number' ? env.month : undefined,
  });
  const action: DecisionAction = {
    type: 'KERNEL_RESEARCH_BELIEF_REFINE',
    payload: { reason: 'post_research_observation_likelihood' },
  };

  const candidates: Array<{
    variable: 'windSpeed' | 'visibilityM' | 'precipitationMm' | 'roadClosure01' | 'fatigue01';
    value: number;
    provenance: SimpleObservationProvenance;
    quality: ObservationQuality;
    independenceTier: ObservationIndependenceTier;
    observation: WorldStateObservation;
  }> = [];

  candidates.push({
    variable: 'windSpeed',
    value: observedWindSpeedMs,
    provenance,
    quality,
    independenceTier,
    observation,
  });

  const vis = extractObservedVisibilityMForBelief(researchData);
  if (vis) {
    const q = simpleProvenanceToQuality(vis.provenance);
    const tier = simpleProvenanceToIndependenceTier(vis.provenance);
    candidates.push({
      variable: 'visibilityM',
      value: vis.visibilityM,
      provenance: vis.provenance,
      quality: q,
      independenceTier: tier,
      observation: {
        timestamp: new Date().toISOString(),
        type: 'WEATHER',
        observation: { variable: 'visibilityM', value: vis.visibilityM },
        quality: q,
      },
    });
  }

  const pr = extractObservedPrecipitationMmForBelief(researchData);
  if (pr) {
    const q = simpleProvenanceToQuality(pr.provenance);
    const tier = simpleProvenanceToIndependenceTier(pr.provenance);
    candidates.push({
      variable: 'precipitationMm',
      value: pr.precipitationMm,
      provenance: pr.provenance,
      quality: q,
      independenceTier: tier,
      observation: {
        timestamp: new Date().toISOString(),
        type: 'WEATHER',
        observation: { variable: 'precipitationMm', value: pr.precipitationMm },
        quality: q,
      },
    });
  }

  const road = extractObservedRoadClosure01ForBelief(researchData);
  if (road) {
    const q = simpleProvenanceToQuality(road.provenance);
    const tier = simpleProvenanceToIndependenceTier(road.provenance);
    candidates.push({
      variable: 'roadClosure01',
      value: clamp01(road.roadClosure01),
      provenance: road.provenance,
      quality: q,
      independenceTier: tier,
      observation: {
        timestamp: new Date().toISOString(),
        type: 'ROAD',
        observation: { variable: 'roadClosure01', value: clamp01(road.roadClosure01) },
        quality: q,
      },
    });
  }

  const fatigue = extractObservedFatigue01ForBelief(dso);
  if (fatigue) {
    const q = simpleProvenanceToQuality(fatigue.provenance);
    const tier = simpleProvenanceToIndependenceTier(fatigue.provenance);
    candidates.push({
      variable: 'fatigue01',
      value: clamp01(fatigue.fatigue01),
      provenance: fatigue.provenance,
      quality: q,
      independenceTier: tier,
      observation: {
        timestamp: new Date().toISOString(),
        type: 'HUMAN_PERFORMANCE',
        observation: { variable: 'fatigue01', value: clamp01(fatigue.fatigue01) },
        quality: q,
      },
    });
  }

  const qualityRank = (q: ObservationQuality): number => (q === 'HIGH' ? 3 : q === 'MEDIUM' ? 2 : 1);
  const tieRank = (v: string): number =>
    v === 'windSpeed'
      ? 1
      : v === 'visibilityM'
        ? 2
        : v === 'precipitationMm'
          ? 3
          : v === 'roadClosure01'
            ? 4
            : 5;
  candidates.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality) || tieRank(a.variable) - tieRank(b.variable));

  const observationsUsed: ObservationUsedAudit[] = [];
  const beliefUpdateSteps: BeliefUpdateStepAudit[] = [];
  const observationFusionOrder: Array<'windSpeed' | 'visibilityM' | 'precipitationMm' | 'roadClosure01' | 'fatigue01'> =
    [];

  let beliefAfter: BeliefState[] = currentBelief as any;
  let out: any = undefined;
  for (const c of candidates) {
    observationsUsed.push({
      variable: c.variable,
      value: c.value,
      provenance: c.provenance,
      quality: c.quality,
      independenceTier: c.independenceTier,
    });
    observationFusionOrder.push(c.variable);

    const prev = beliefAfter;
    try {
      const next = await beliefUpdate.updateBelief(pomdpContext, {
        currentBelief: beliefAfter,
        action,
        observation: c.observation,
      });
      out = next;
      if (next.updatedBelief?.length) {
        beliefAfter = next.updatedBelief as BeliefState[];
      }
    } catch {
      // ignore: keep prev beliefAfter and continue
    }

    if (!beliefAfter?.length || beliefAfter === prev) continue;

    const prevWeights = (prev as any[]).map((p) => ({ weight: typeof p.weight === 'number' ? p.weight : 0 }));
    const afterWeights = (beliefAfter as any[]).map((p) => ({ weight: typeof p.weight === 'number' ? p.weight : 0 }));
    const entropy01After = computeEntropy01FromWeights(afterWeights.map((p) => p.weight));
    const essAfter = computeEss(afterWeights);
    beliefUpdateSteps.push({
      variable: c.variable,
      value: c.value,
      provenance: c.provenance,
      quality: c.quality,
      independenceTier: c.independenceTier,
      entropy01After,
      essAfter,
      deltaEntropy01FromPrev: entropy01After - computeEntropy01FromWeights(prevWeights.map((p) => p.weight)),
      deltaEssFromPrev: essAfter - computeEss(prevWeights),
      weightL1DeltaFromPrev: l1Delta(prevWeights, afterWeights),
    });
  }

  if (!beliefAfter?.length || beliefAfter === currentBelief) {
    return null;
  }

  // 有效精炼判据：权重分布变化过小则视为 no-op（避免“新数组但无变化”的伪精炼）
  const l1 = l1Delta(
    (currentBelief as any[]).map((p) => ({ weight: typeof p.weight === 'number' ? p.weight : 0 })),
    (beliefAfter as any[]).map((p) => ({ weight: typeof p.weight === 'number' ? p.weight : 0 })),
  );
  const p0 = (currentBelief as any[]).map((p) => (typeof p.weight === 'number' ? p.weight : 0));
  const p1 = (beliefAfter as any[]).map((p) => (typeof p.weight === 'number' ? p.weight : 0));
  const js = jsDivergence(p0, p1);
  const nParticles = Math.max(1, Math.min(p0.length, p1.length));
  let l1Threshold = Math.max(1e-6, 1e-3 / Math.sqrt(nParticles));
  let jsThreshold = Math.max(1e-9, 1e-6 / Math.sqrt(nParticles));
  let refinementThresholdSource: 'default' | 'config' = 'default';
  let refinementThresholdsConfigMeta: { path?: string; generatedAt?: string; bucketKey?: string } | undefined;

  const cfg = loadRefinementThresholdsConfig();
  if (cfg?.buckets) {
    const env = (dso.environmentState ?? {}) as Record<string, unknown>;
    const bucket = thresholdsBucketKey({
      countryCode: typeof env.countryCode === 'string' ? env.countryCode : undefined,
      month: typeof env.month === 'number' ? env.month : undefined,
      tier: independenceTier,
      src: (researchData as any)?.windSpeedMs_meta?.source ? String((researchData as any).windSpeedMs_meta.source) : undefined,
    });
    const rec = cfg.buckets[bucket]?.recommended;
    if (typeof rec?.l1 === 'number' && Number.isFinite(rec.l1) && rec.l1 > 0) {
      l1Threshold = rec.l1;
      refinementThresholdSource = 'config';
    }
    if (typeof rec?.js === 'number' && Number.isFinite(rec.js) && rec.js > 0) {
      jsThreshold = rec.js;
      refinementThresholdSource = 'config';
    }
    refinementThresholdsConfigMeta = {
      path: process.env.DECISION_OS_REFINEMENT_THRESHOLDS_FILE,
      generatedAt: cfg.generatedAt,
      bucketKey: bucket,
    };
  }
  const refinementEffective = l1 >= l1Threshold || js >= jsThreshold;

  return {
    refinedSamples: refinementEffective ? pomdpBeliefToBeliefStateSamples(beliefAfter) : beliefSamples,
    logNormalizationConstant: out.logNormalizationConstant,
    pomdpEffectiveParticleCount: out.effectiveParticleCount,
    observationProvenance: provenance,
    observedWindSpeedMs,
    observationQuality: quality,
    observationIndependenceTier: independenceTier,
    windSpeedMeta:
      (researchData as any).windSpeedMs_meta && typeof (researchData as any).windSpeedMs_meta === 'object'
        ? ((researchData as any).windSpeedMs_meta as any)
        : undefined,
    weightL1Delta: l1,
    weightJSDivergence: js,
    refinementThresholds: { n: nParticles, l1: l1Threshold, js: jsThreshold },
    refinementThresholdSource,
    refinementThresholdsConfigMeta,
    refinementEffective,
    observationsUsed,
    beliefUpdateSteps,
    observationFusionOrder,
    observationModelParams,
  };
}
