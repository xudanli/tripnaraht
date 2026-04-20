import type { HarnessTraceCorrelationMeta, HarnessTraceStep } from '../tracing/harness-trace.types';

/**
 * 可导出训练轨迹（对齐 docs/Harness Runtime.md §12.1）
 */
export interface HarnessExportableTrajectory {
  traceId: string;
  requestId: string;
  tripId?: string;
  modelVersion?: string;
  meta?: HarnessTraceCorrelationMeta;
  finalStatus: string;
  steps: HarnessTraceStep[];
  validationSummary: {
    passed: boolean;
    hardFailures: number;
    logicGaps: number;
  };
}
