export declare class RetryPolicyService {
    private readonly logger;
    executeWithRetry<T>(operation: () => Promise<T>, config?: RetryConfig): Promise<T>;
    private sleep;
}
export interface RetryConfig {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
}
