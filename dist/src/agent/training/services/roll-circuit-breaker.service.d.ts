declare enum CircuitState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    HALF_OPEN = "HALF_OPEN"
}
export declare class RollCircuitBreakerService {
    private readonly logger;
    private readonly config;
    private circuitStates;
    execute<T>(operation: () => Promise<T>, operationName: string): Promise<T>;
    private getCircuitState;
    private recordSuccess;
    private recordFailure;
    private transitionToOpen;
    private transitionToHalfOpen;
    private transitionToClosed;
    getState(operationName: string): {
        state: CircuitState;
        failureCount: number;
        successCount: number;
        lastFailureTime: number;
    };
    reset(operationName: string): void;
}
export {};
