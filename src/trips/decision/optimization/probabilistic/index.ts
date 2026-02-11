// src/trips/decision/optimization/probabilistic/index.ts
/**
 * Phase 2 概率模块导出
 * 
 * 核心能力：
 * - 概率分布建模
 * - 概率世界模型
 * - 期望效用计算（Monte Carlo）
 * - 贝叶斯更新
 */

// 分布接口
export * from './distribution.interface';

// 概率世界模型
export * from './probabilistic-world-model.interface';
export { ProbabilisticWorldModelService } from './probabilistic-world-model.service';

// 期望效用服务
export { ExpectedUtilityService, DEFAULT_MONTE_CARLO_CONFIG } from './expected-utility.service';
export type {
  MonteCarloConfig,
  ExpectedUtilityResult,
  ScenarioAnalysisResult,
  SensitivityAnalysisResult,
} from './expected-utility.service';
