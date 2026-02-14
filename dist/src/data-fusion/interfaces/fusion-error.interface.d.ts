export type FusionErrorType = 'DATA_SOURCE_ERROR' | 'CONFLICT_RESOLUTION_ERROR' | 'FUSION_STRATEGY_ERROR' | 'VALIDATION_ERROR' | 'TIMEOUT_ERROR' | 'RESOURCE_EXHAUSTED' | 'UNKNOWN_ERROR';
export declare class FusionError extends Error {
    readonly type: FusionErrorType;
    readonly sourceId?: string;
    readonly retryable: boolean;
    readonly cause?: Error;
    constructor(message: string, type: FusionErrorType, sourceId?: string, retryable?: boolean, cause?: Error);
}
export type ErrorRecoveryStrategy = 'RETRY' | 'FALLBACK' | 'SKIP' | 'ABORT';
export interface ErrorRecoveryConfig {
    maxRetries?: number;
    retryDelay?: number;
    fallbackStrategy?: string;
    skipOnError?: boolean;
}
