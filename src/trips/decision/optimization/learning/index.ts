// src/trips/decision/optimization/learning/index.ts
/**
 * Phase 3 学习模块导出
 * 
 * 核心能力：
 * - 多智能体协商（Guardian Debate）
 * - 可学习权重（Weight Learner）
 */

// Guardian 人格接口
export * from './guardian-persona.interface';

// Guardian 辩论服务
export { GuardianDebateService } from './guardian-debate.service';

// 权重学习服务
export { WeightLearnerService, DEFAULT_LEARNING_CONFIG } from './weight-learner.service';
export type {
  FeedbackType,
  FeedbackRecord,
  LearningConfig,
  WeightLearningResult,
  UserWeightProfile,
} from './weight-learner.service';

// 权重持久化服务
export { WeightPersistenceService } from './weight-persistence.service';
export type { PersistenceConfig } from './weight-persistence.service';
