// src/trips/decision/optimization/probabilistic/index.ts
/**
 * Phase 2 概率模块导出
 * 
 * 核心能力：
 * - 概率分布建模
 * - 概率世界模型
 * - 期望效用计算（Monte Carlo + 自适应采样）
 * - 贝叶斯更新
 * - 重要性采样
 */

// 分布接口
export * from './distribution.interface';

// 观测模型（POMDP Ω(o|s)）
export * from './observation-model.interface';
export { DefaultObservationModelService } from './default-observation-model.service';

// 概率世界模型
export * from './probabilistic-world-model.interface';
export { ProbabilisticWorldModelService } from './probabilistic-world-model.service';

// 期望效用服务（含 P1.3 自适应采样）
export {
  ExpectedUtilityService,
  DEFAULT_MONTE_CARLO_CONFIG,
  DEFAULT_ADAPTIVE_CONFIG,
} from './expected-utility.service';
export type {
  MonteCarloConfig,
  ExpectedUtilityResult,
  ScenarioAnalysisResult,
  SensitivityAnalysisResult,
  AdaptiveSamplingConfig,
  AdaptiveSamplingResult,
  ImportanceSamplingConfig,
  ImportanceSamplingResult,
} from './expected-utility.service';
