export declare class CircuitBreakerService {
    private readonly logger;
    private readonly breakers;
    execute<T>(name: string, operation: () => Promise<T>, config?: CircuitBreakerConfig): Promise<T>;
    private getOrCreateBreaker;
    private onSuccess;
    private onFailure;
    getState(name: string): 'CLOSED' | 'OPEN' | 'HALF_OPEN' | undefined;
    reset(name: string): void;
}
export interface CircuitBreakerConfig {
    timeout?: number;
    failureThreshold?: number;
    halfOpenMaxAttempts?: number;
}
