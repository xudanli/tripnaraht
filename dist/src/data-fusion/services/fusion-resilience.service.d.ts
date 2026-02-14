import { ErrorRecoveryConfig } from '../interfaces/fusion-error.interface';
export declare class FusionResilienceService {
    private readonly logger;
    private readonly circuitBreakers;
    private readonly CIRCUIT_BREAKER_THRESHOLD;
    private readonly CIRCUIT_BREAKER_TIMEOUT;
    executeWithErrorHandling<T>(operation: () => Promise<T>, operationName: string, recoveryConfig?: ErrorRecoveryConfig): Promise<T>;
    private classifyError;
    private calculateRetryDelay;
    private canExecute;
    private onSuccess;
    private onFailure;
    getCircuitBreakerState(operationName: string): {
        state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
        failures: number;
        lastFailureTime?: number;
    } | null;
}
