/**
 * 实验模块导出
 *
 * P3.2 优化：A/B 测试框架
 */

export { ABTestingService } from './ab-testing.service';
export type {
  IABTestingService,
  ExperimentConfig,
  ExperimentStatus,
  AllocationStrategy,
  ExperimentVariant,
  MetricDefinition,
  UserAllocation,
  MetricObservation,
  VariantStatistics,
  StatisticalTestResult,
  ExperimentAnalysis,
} from './ab-testing.interface';
