import { DataQuality, EvidenceRef } from '../../interfaces/sub-agent.interface';
export declare enum DomainAgentErrorType {
    DATA_SOURCE_UNAVAILABLE = "DATA_SOURCE_UNAVAILABLE",
    DATA_SOURCE_TIMEOUT = "DATA_SOURCE_TIMEOUT",
    DATA_FORMAT_ERROR = "DATA_FORMAT_ERROR",
    DATA_VALIDATION_ERROR = "DATA_VALIDATION_ERROR",
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
    PERMISSION_DENIED = "PERMISSION_DENIED",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
export declare class DomainAgentError extends Error {
    readonly type: DomainAgentErrorType;
    readonly agent: string;
    readonly operation: string;
    readonly originalError?: Error;
    readonly context?: Record<string, any>;
    constructor(type: DomainAgentErrorType, agent: string, operation: string, message: string, originalError?: Error, context?: Record<string, any>);
}
export interface FallbackStrategy {
    useCache: boolean;
    maxCacheAge?: number;
    useDefaults: boolean;
    defaults?: any;
    retry: boolean;
    retryCount?: number;
    retryDelay?: number;
}
export interface ErrorHandlingResult<T> {
    recovered: boolean;
    data?: T;
    data_quality: DataQuality;
    evidence: EvidenceRef;
    shouldWarnUser: boolean;
    userWarning?: string;
}
export declare class DomainAgentErrorHandler {
    private readonly logger;
    private readonly defaultStrategies;
    classifyError(error: Error): DomainAgentErrorType;
    handleError<T>(agent: string, operation: string, error: Error, fallbackData?: T, customStrategy?: Partial<FallbackStrategy>): Promise<ErrorHandlingResult<T>>;
    executeWithRetry<T>(agent: string, operation: string, fn: () => Promise<T>, fallbackData?: T, customStrategy?: Partial<FallbackStrategy>): Promise<{
        data: T;
        evidence: EvidenceRef;
        data_quality: DataQuality;
    }>;
    private getErrorMessage;
    private getQualityImpact;
    private getUserFriendlyMessage;
    private delay;
}
