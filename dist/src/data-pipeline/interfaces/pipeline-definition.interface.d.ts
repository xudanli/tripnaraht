import { ProcessedData } from './data-pipeline.interface';
export type PipelineStepType = 'COLLECT' | 'VALIDATE' | 'CLEAN' | 'STANDARDIZE' | 'FUSE' | 'ENGINEER' | 'APPLY';
export type PipelineStepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export interface PipelineStep {
    id: string;
    name: string;
    type: PipelineStepType;
    status: PipelineStepStatus;
    config?: Record<string, any>;
    dependencies?: string[];
    retryConfig?: {
        maxRetries: number;
        retryDelay: number;
        backoffMultiplier?: number;
    };
    timeout?: number;
    errorHandler?: 'ABORT' | 'SKIP' | 'RETRY' | 'FALLBACK';
    fallbackStepId?: string;
}
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
export interface PipelineMonitoringConfig {
    enableMetrics?: boolean;
    enableAlerts?: boolean;
    alertThresholds?: {
        failureRate?: number;
        avgDuration?: number;
        errorCount?: number;
    };
    metricsCollectionInterval?: number;
}
