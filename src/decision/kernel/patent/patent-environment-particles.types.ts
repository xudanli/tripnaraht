/**
 * 专利 6.5 实施例：environmentState.particles 视图类型
 * 工程存储仍为 beliefSamples；本类型仅用于对外投影与 E2E 回归。
 */

/** 单粒子（专利 JSON 形状） */
export interface PatentEnvironmentParticle {
  weather_day3?: string;
  road_milford?: '开放' | '关闭' | 'unknown';
  cost?: number;
  weight: number;
}

/** 专利 steps 3 输出摘要 */
export interface PatentEnvironmentSummary {
  weather_forecast?: { day3_risk?: number };
  road_conditions?: { milford_closure_prob?: number };
  cost_estimate?: { mean?: number; std?: number };
}

/** 完整 particles 视图（对应专利 environmentState 片段） */
export interface PatentEnvironmentParticlesView {
  particles: PatentEnvironmentParticle[];
  weights: number[];
  summary: PatentEnvironmentSummary;
}
