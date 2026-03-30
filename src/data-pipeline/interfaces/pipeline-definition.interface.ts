// src/data-pipeline/interfaces/pipeline-definition.interface.ts

import { ProcessedData } from './data-pipeline.interface';

/**
 * 管道步骤类型
 */
export type PipelineStepType = 
  | 'COLLECT'      // 采集
  | 'VALIDATE'     // 验证
  | 'CLEAN'        // 清洗
  | 'STANDARDIZE'  // 标准化
  | 'FUSE'         // 融合
  | 'ENGINEER'     // 特征工程
  | 'APPLY';       // 应用

/**
 * 管道步骤状态
 */
export type PipelineStepStatus = 
  | 'PENDING'      // 待执行
  | 'RUNNING'      // 执行中
  | 'COMPLETED'    // 已完成
  | 'FAILED'       // 失败
  | 'SKIPPED';     // 跳过

/**
 * 管道步骤
 */
export interface PipelineStep {
  id: string;
  name: string;
  type: PipelineStepType;
  status: PipelineStepStatus;
  config?: Record<string, any>;
  dependencies?: string[];  // 依赖的步骤ID
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;  // 毫秒
    backoffMultiplier?: number;
  };
  timeout?: number;  // 超时时间（毫秒）
  errorHandler?: 'ABORT' | 'SKIP' | 'RETRY' | 'FALLBACK';
  fallbackStepId?: string;
}

/**
 * 管道定义
 */
export interface PipelineDefinition {
  id: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  metadata?: {
    createdAt: string;
    updatedAt: string;
    version: string;
    author?: string;
  };
}

/**
 * 管道执行状态
 */
export interface PipelineExecutionState {
  executionId: string;
  pipelineId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentStepId?: string;
  stepStates: Map<string, PipelineStepStatus>;
  startTime: string;
  endTime?: string;
  errors: Array<{
    stepId: string;
    error: string;
    timestamp: string;
    retryCount?: number;
  }>;
  metrics: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    totalDuration: number;
    stepDurations: Record<string, number>;
  };
}

/**
 * 管道执行结果
 */
export interface PipelineExecutionResult {
  executionId: string;
  pipelineId: string;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  output?: ProcessedData;
  executionState: PipelineExecutionState;
  qualityMetrics?: {
    overallScore: number;
    completeness: number;
    accuracy: number;
    timeliness: number;
  };
  recommendations?: string[];
}

/**
 * 管道监控配置
 */
export interface PipelineMonitoringConfig {
  enableMetrics?: boolean;
  enableAlerts?: boolean;
  alertThresholds?: {
    failureRate?: number;      // 失败率阈值
    avgDuration?: number;      // 平均执行时间阈值（毫秒）
    errorCount?: number;       // 错误数量阈值
  };
  metricsCollectionInterval?: number;  // 指标收集间隔（毫秒）
}
