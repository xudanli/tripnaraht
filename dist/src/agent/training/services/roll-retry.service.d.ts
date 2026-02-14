export declare class RollRetryService {
    private readonly logger;
    private readonly retryConfig;
    executeWithRetry<T>(operation: () => Promise<T>, operationName: string, customConfig?: Partial<typeof this.retryConfig>): Promise<T>;
    private isRetryableError;
    private sleep;
}
