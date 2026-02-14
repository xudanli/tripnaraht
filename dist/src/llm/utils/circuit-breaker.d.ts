export declare enum CircuitBreakerState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    HALF_OPEN = "HALF_OPEN"
}
export interface CircuitBreakerOptions {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    halfOpenMaxCalls?: number;
}
export declare class CircuitBreaker {
    private readonly name;
    private readonly options;
    private state;
    private failureCount;
    private lastFailureTime;
    private halfOpenSuccessCount;
    constructor(name: string, options?: CircuitBreakerOptions);
    isOpen(): boolean;
    recordSuccess(): void;
    recordFailure(): void;
    getState(): CircuitBreakerState;
    getFailureCount(): number;
    reset(): void;
}
