import { ConfigService } from '@nestjs/config';
import { RollRetryService } from './roll-retry.service';
import { RollCircuitBreakerService } from './roll-circuit-breaker.service';
import { RollConnectionPoolService } from './roll-connection-pool.service';
import { RollCacheService } from './roll-cache.service';
import { RollTracingService } from './roll-tracing.service';
export declare class RollClientService {
    private readonly configService;
    private readonly retryService?;
    private readonly circuitBreaker?;
    private readonly connectionPool?;
    private readonly cache?;
    private readonly tracing?;
    private readonly logger;
    private enabled;
    private readonly rayAddress;
    private readonly rayNamespace;
    private rayClient;
    constructor(configService: ConfigService, retryService?: RollRetryService, circuitBreaker?: RollCircuitBreakerService, connectionPool?: RollConnectionPoolService, cache?: RollCacheService, tracing?: RollTracingService);
    private initializeRayClient;
    callActorWorker(request: {
        requestId: string;
        userRequest: string;
        state?: Record<string, any>;
        action: string;
        params: Record<string, any>;
        timestamp?: string;
    }): Promise<{
        success: boolean;
        trajectoryId?: string;
        trajectoryRef?: any;
        trajectory?: any;
        error?: string;
    }>;
    callRewardWorker(trajectoryRef: any, rewardConfig?: Record<string, any>): Promise<{
        success: boolean;
        reward?: number;
        rawReward?: number;
        rewardBreakdown?: any[];
        error?: string;
    }>;
    callPolicyWorker(state: {
        userRequest: string;
        origin?: string;
        destination?: string;
        constraints?: Record<string, any>;
        preferences?: Record<string, any>;
    }): Promise<{
        success: boolean;
        action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'CLARIFY';
        confidence?: number;
        reasoning?: string;
        adjustedParams?: Record<string, any>;
        error?: string;
    }>;
    startTraining(config: {
        jobId: string;
        modelType: string;
        baseModel: string;
        trainingData: any[];
        hyperparameters?: Record<string, any>;
    }): Promise<{
        success: boolean;
        rayJobId?: string;
        mlflowRunId?: string;
        status?: string;
        error?: string;
    }>;
    getTrainingStatus(rayJobId: string): Promise<{
        success: boolean;
        status?: string;
        progress?: number;
        metrics?: Record<string, any>;
        error?: string;
    }>;
    cancelTraining(rayJobId: string): Promise<{
        success: boolean;
        status?: string;
        error?: string;
    }>;
    private callBridgeService;
    private callRayActor;
    private simulateActorWorker;
    private simulateRewardWorker;
    private simulatePolicyWorker;
    private simulateTraining;
    healthCheck(): Promise<{
        status: string;
        rayConnected: boolean;
        workersAvailable: string[];
    }>;
}
