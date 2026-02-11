// src/trips/decision/optimization/index.ts
/**
 * TripNARA 优化模块
 * 
 * Phase 1: 目标函数 + 显式优化器
 * Phase 2: 概率模型 + Monte Carlo 期望效用
 * Phase 3: 多智能体协商 + 可学习权重
 * 
 * 中期功能：
 * - 多用户协同（家庭/团队）
 * - 实时世界状态更新
 * - A/B 测试框架
 */

// ========== Phase 1: 目标函数 + 显式优化器 ==========

// 接口
export * from './objective-function.interface';

// 服务
export { ObjectiveFunctionService } from './objective-function.service';
export { AbuOptimizerService } from './abu-optimizer.service';
export { DreOptimizerService } from './dre-optimizer.service';
export { StrategyOrchestratorV2Service } from './strategy-orchestrator-v2.service';

// 类型重导出
export type {
  AbuConstraintEvaluationResult,
  AbuOptimizationRequest,
  AbuOptimizationResponse,
} from './abu-optimizer.service';

export type {
  DreCandidateType,
  DreCandidate,
  DreOptimizationResult,
  DreOptimizationConfig,
} from './dre-optimizer.service';

export type {
  StrategyOrchestrationResultV2,
  OrchestrationConfigV2,
} from './strategy-orchestrator-v2.service';

// ========== Phase 2: 概率模型 ==========

export * from './probabilistic';

// ========== Phase 3: 多智能体协商 + 可学习权重 ==========

export * from './learning';

// ========== 中期：多用户协同 ==========

export * from './collaboration';

// ========== 中期：实时状态更新 ==========

export * from './realtime';

// ========== 中期：A/B 测试 ==========

export * from './experiments';

// ========== 公理系统 ==========

export * from './axioms';

// ========== 模块和控制器 ==========

export { OptimizationModule } from './optimization.module';
export * from './controllers';
