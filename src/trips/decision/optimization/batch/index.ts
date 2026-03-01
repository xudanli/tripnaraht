/**
 * 批量处理模块导出
 *
 * P2 优化：性能提升
 * - 并行采样
 * - 增量序列化
 * - 批量评估
 */

// P2.2 并行采样
export { ParallelSamplerService } from './parallel-sampler.service';
export type {
  ParallelConfig,
  SamplingTask,
  SamplingResult,
  ParallelSamplingStats,
} from './parallel-sampler.service';

// P2.3 增量序列化
export { IncrementalSerializerService } from './incremental-serializer.service';
export type {
  DiffOperation,
  StateDiff,
  SerializationConfig,
  SerializedSnapshot,
} from './incremental-serializer.service';

// P2.4 批量评估
export { BatchEvaluatorService } from './batch-evaluator.service';
export type {
  BatchCandidate,
  ConstraintCheckResult,
  UtilityResult,
  BatchEvaluationResult,
  BatchConfig,
} from './batch-evaluator.service';

// 批量操作服务
export {
  BatchExecutor,
  BatchDecisionService,
  BatchFeedbackService,
  BatchQueueService,
} from './batch-operations.service';
export type {
  BatchRequest,
  BatchResult,
  BatchSummary,
  BatchOptions,
  BatchDecisionRequest,
  BatchDecisionResult,
  BatchFeedbackRequest,
  BatchFeedbackResult,
} from './batch-operations.service';
