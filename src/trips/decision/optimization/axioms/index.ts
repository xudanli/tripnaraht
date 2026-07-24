// src/trips/decision/optimization/axioms/index.ts
/**
 * TripNARA 公理系统
 * 
 * 七条核心公理：
 * 1. 标准化公理 - 所有指标 [0,1]
 * 2. 分层组合公理 - 二级线性组合
 * 3. 硬约束优先公理 - 违规 = -∞
 * 4. 不确定性一致公理 - 概率包装确定性
 * 5. 稳健性优先公理 - 风险约束优化
 * 6. 自适应一致公理 - 参数可学习，结构固定
 * 7. 多智能体一致性公理 - 共享目标函数
 * 
 * 系统本质：
 * Risk-Constrained Hierarchical Utility Maximizer
 */

// 公理系统核心定义
export * from './axiom-system';

// 公理验证服务
export { AxiomValidatorService } from './axiom-validator.service';

// NOTE: Not the same system as `src/agent/axioms/` (runtime guardians). See agent/axioms/README.md.
export type { AxiomValidationReport } from './axiom-validator.service';

// 分层效用服务
export { 
  HierarchicalUtilityService,
  DEFAULT_TOP_LEVEL_WEIGHTS,
  DEFAULT_SUB_DIMENSION_WEIGHTS,
} from './hierarchical-utility.service';
export type { 
  TopLevelWeights, 
  SubDimensionWeights,
  HierarchicalEvaluationResult,
} from './hierarchical-utility.service';
