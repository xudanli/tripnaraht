export interface RetryConfig {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    retryableErrors?: string[];
    nonRetryableErrors?: string[];
    logging?: boolean;
}
export interface RetryResult<T> {
    result?: T;
    success: boolean;
    attemptCount: number;
    totalDuration: number;
    lastError?: Error;
}
export declare class RetryHelperService {
    private readonly logger;
    private readonly DEFAULT_CONFIG;
    executeWithRetry<T>(operation: () => Promise<T>, config?: RetryConfig): Promise<RetryResult<T>>;
    private shouldRetry;
    private calculateDelay;
    private sleep;
    createRetrier(config: RetryConfig): <T>(operation: () => Promise<T>) => Promise<RetryResult<T>>;
    retryApiCall<T>(operation: () => Promise<T>, operationName: string): Promise<RetryResult<T>>;
    retryDbQuery<T>(operation: () => Promise<T>, queryName: string): Promise<RetryResult<T>>;
}
