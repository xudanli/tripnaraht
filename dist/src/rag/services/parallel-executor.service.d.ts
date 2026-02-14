export interface ParallelTask<T> {
    id: string;
    operation: () => Promise<T>;
    timeout?: number;
}
export interface ParallelResult<T> {
    id: string;
    success: boolean;
    result?: T;
    error?: Error;
    duration: number;
}
export interface ParallelExecutionOptions {
    maxConcurrency?: number;
    taskTimeout?: number;
    failFast?: boolean;
    delayMs?: number;
}
export declare class ParallelExecutorService {
    private readonly logger;
    executeAll<T>(tasks: ParallelTask<T>[], options?: ParallelExecutionOptions): Promise<ParallelResult<T>[]>;
    executeAllSimple<T>(tasks: ParallelTask<T>[], timeout?: number): Promise<ParallelResult<T>[]>;
    private executeTask;
    private createTimeoutPromise;
    executeBatch<T>(tasks: ParallelTask<T>[], batchSize: number, options?: ParallelExecutionOptions): Promise<ParallelResult<T>[]>;
    private sleep;
    getStats<T>(results: ParallelResult<T>[]): {
        total: number;
        success: number;
        failed: number;
        avgDuration: number;
        maxDuration: number;
        minDuration: number;
    };
}
