// src/trips/decision/index.ts

/**
 * Decision Layer - 决策层统一导出
 * 
 * 高维框架：State + Constraints + Objective + Actions
 */

// 世界模型
export * from './world-model';

// 计划模型
export * from './plan-model';

// 决策日志
export * from './decision-log';

// 策略
export * from './strategies/abu';
export * from './strategies/drdre';
export * from './strategies/neptune';

// 约束校验
export { ConstraintChecker } from './constraints';
export type {
  CheckerViolation,
  ViolationSeverity,
  ConstraintCheckResult,
} from './constraints';

// 数据质量
export * from './data-quality';

// 配置
export * from './config';

// Plan Diff
export * from './plan-diff';

// 候选集
export * from './candidates';

// 交通可靠性
export * from './travel';

// 事件触发
export * from './events';

// 评估与回放
export * from './evaluation';

// 版本控制
export * from './versioning';

// 可解释性
export * from './explainability';

// 学习机制
export * from './learning';

// 高级约束
export { AdvancedConstraintsService } from './constraints/advanced-constraints.service';
export type {
  MutexGroup,
  Dependency,
  AdvancedConstraints,
} from './constraints/advanced-constraints.service';

// 性能优化
export * from './performance';

// 监控
export * from './monitoring';

// 决策引擎
export * from './trip-decision-engine.service';

// 适配器
export * from './adapters/sense-tools.adapter';

// 模块
export * from './decision.module';

