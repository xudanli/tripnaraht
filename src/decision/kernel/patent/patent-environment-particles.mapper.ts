/**
 * beliefSamples + EnvironmentState → 专利 6.5 environmentState.particles 视图
 *
 * 工程侧仍以 beliefSamples 为 SoT；本 mapper 供专利答辩、文档与 E2E 回归使用。
 */

import type { BeliefStateSample, DecisionState, EnvironmentState } from '../decision-state.types';
import type {
  PatentEnvironmentParticle,
  PatentEnvironmentParticlesView,
  PatentEnvironmentSummary,
} from './patent-environment-particles.types';

const WEATHER_LABELS = ['晴', '多云', '暴风雨'] as const;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function weatherLabelFromRisk(risk: number): string {
  if (risk >= 0.7) return WEATHER_LABELS[2];
  if (risk >= 0.35) return WEATHER_LABELS[1];
  return WEATHER_LABELS[0];
}

function resolveDay3WeatherRisk(env: EnvironmentState, sample?: BeliefStateSample): number {
  const fromSample = sample?.environmentSummary?.weatherRisk;
  if (typeof fromSample === 'number') return clamp01(fromSample);
  if (typeof env.weatherRisk === 'number') return clamp01(env.weatherRisk);
  return 0.5;
}

function resolveMilfordClosureProb(env: EnvironmentState): number {
  const rc = env.roadConditions as Record<string, unknown> | undefined;
  const direct = rc?.milford_closure_prob ?? rc?.milfordClosureProb;
  if (typeof direct === 'number') return clamp01(direct);
  if (env.failureRiskLevel === 'HIGH') return 0.4;
  if (env.failureRiskLevel === 'MEDIUM') return 0.25;
  return 0.1;
}

function resolveCostMean(env: EnvironmentState, userBudget?: number): number {
  const rc = env.roadConditions as Record<string, unknown> | undefined;
  const estimate = rc?.cost_estimate_mean ?? rc?.costEstimateMean;
  if (typeof estimate === 'number') return estimate;
  if (typeof userBudget === 'number' && userBudget > 0) return Math.round(userBudget * 0.925);
  return 18500;
}

function roadLabelFromProb(closureProb: number, sampleIdx: number, sampleCount: number): PatentEnvironmentParticle['road_milford'] {
  // 按权重分位生成开放/关闭标签，使高 closureProb 时「关闭」粒子更多
  const threshold = closureProb * (sampleCount <= 1 ? 0.5 : sampleIdx / (sampleCount - 1));
  if (threshold >= closureProb && closureProb > 0.2) return '关闭';
  if (closureProb <= 0.05) return '开放';
  return threshold < closureProb ? '关闭' : '开放';
}

function buildSummary(env: EnvironmentState, samples: BeliefStateSample[], userBudget?: number): PatentEnvironmentSummary {
  const day3Risk = resolveDay3WeatherRisk(env, samples[0]);
  const milfordProb = resolveMilfordClosureProb(env);
  const mean = resolveCostMean(env, userBudget);
  const costs = samples.map((s) => {
    const wr = resolveDay3WeatherRisk(env, s);
    return Math.round(mean * (1 + 0.02 * (wr - day3Risk)));
  });
  const avg = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : mean;
  const variance =
    costs.length > 1
      ? costs.reduce((acc, c) => acc + (c - avg) ** 2, 0) / (costs.length - 1)
      : (userBudget ? userBudget * 0.01 : 2000) ** 2;
  return {
    weather_forecast: { day3_risk: day3Risk },
    road_conditions: { milford_closure_prob: milfordProb },
    cost_estimate: { mean: Math.round(avg), std: Math.round(Math.sqrt(variance)) },
  };
}

/**
 * 从 DSO 投影专利 particles 视图。
 * 若 beliefSamples 为空，则基于 environmentState 生成最小单粒子视图。
 */
export function mapDsoToPatentEnvironmentParticles(dso: DecisionState): PatentEnvironmentParticlesView {
  const env = dso.environmentState ?? {};
  const samples = dso.beliefSamples ?? [];
  const userBudget = dso.userIntent?.budget;
  const summary = buildSummary(env, samples, userBudget);
  const milfordProb = summary.road_conditions?.milford_closure_prob ?? 0.1;
  const costMean = summary.cost_estimate?.mean ?? 18500;

  const sourceSamples =
    samples.length > 0
      ? samples
      : ([
          { sampleId: 'b0_uniform', environmentSummary: { weatherRisk: summary.weather_forecast?.day3_risk ?? 0.5 }, weight: 1 },
        ] as BeliefStateSample[]);

  const particles: PatentEnvironmentParticle[] = sourceSamples.map((s, i) => {
    const day3Risk = resolveDay3WeatherRisk(env, s);
    return {
      weather_day3: weatherLabelFromRisk(day3Risk),
      road_milford: roadLabelFromProb(milfordProb, i, sourceSamples.length),
      cost: Math.round(costMean * (1 + 0.01 * (i % 3))),
      weight: s.weight ?? 1 / sourceSamples.length,
    };
  });

  const weights = particles.map((p) => p.weight);
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const normalized = particles.map((p, i) => ({ ...p, weight: weights[i] / wSum }));

  return {
    particles: normalized,
    weights: normalized.map((p) => p.weight),
    summary,
  };
}

/** 写入 environmentState 的专利视图键（不替换 beliefSamples） */
export const PATENT_PARTICLES_VIEW_KEY = 'patentParticlesView';

export function attachPatentParticlesViewToEnvironment(
  env: EnvironmentState,
  view: PatentEnvironmentParticlesView,
): EnvironmentState {
  return { ...env, [PATENT_PARTICLES_VIEW_KEY]: view };
}
