// src/trips/decision/optimization/learning/index.ts
/**
 * Phase 3 学习模块导出
 * 
 * 核心能力：
 * - 多智能体协商（Guardian Debate）
 * - 可学习权重（Weight Learner）
 * - 在线学习循环
 * - 策略网络（含 Experience Replay + Target Network）
 * - DSO 快照审计
 * - 贝叶斯优化
 * - RLHF 持久化
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

// 在线学习循环
export { OnlineLearningLoopService } from './online-learning-loop.service';
export type {
  DecisionOutcome,
  LearningEvent,
  OnlineLearningConfig,
} from './online-learning-loop.service';

// 策略网络（P1.1 优化：含 Experience Replay + Target Network）
export { PolicyNetworkService, ExperienceReplayBuffer } from './policy-network.service';
export type {
  ActionType,
  PolicyOutput,
  PolicyTrainingSample,
  Experience,
  ReplayBufferConfig,
  TargetNetworkConfig,
} from './policy-network.service';

// DSO 快照审计
export { DSOSnapshotAuditService } from './dso-snapshot-audit.service';
export type {
  SnapshotMetadata,
  SnapshotQueryFilter,
  SnapshotQueryResult,
  StateDiff,
  LyapunovTrace,
} from './dso-snapshot-audit.service';

// P1.2 优化：贝叶斯优化服务
export { BayesianOptimizerService } from './bayesian-optimizer.service';
export type {
  BayesianPoint,
  GPConfig,
  BayesianOptimizerConfig,
  AcquisitionResult,
  BayesianOptimizationResult,
} from './bayesian-optimizer.service';

// P0.2 优化：RLHF 持久化服务
export { RlhfPersistenceService } from './rlhf-persistence.service';
export type {
  RlhfFeedbackPersistInput,
  LearningConvergenceInput,
  FeedbackQueryOptions,
  FeedbackStats,
} from './rlhf-persistence.service';

// 持久化实体
export * from './entities';
