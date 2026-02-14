import { ConfigService } from '@nestjs/config';
import { PolicyInferenceRequest, PolicyInferenceResponse, PolicyServiceHealth, PolicyServiceMetrics } from '../interfaces/training-platform.interface';
import { ModelRegistryService } from './model-registry.service';
import { RollPolicyAdapterService } from './roll-policy-adapter.service';
export declare class PolicyServiceManagerService {
    private readonly configService;
    private readonly modelRegistry;
    private readonly rollPolicyAdapter?;
    private readonly logger;
    private readonly policyServiceUrl;
    private readonly fallbackEnabled;
    constructor(configService: ConfigService, modelRegistry: ModelRegistryService, rollPolicyAdapter?: RollPolicyAdapterService);
    predict(request: PolicyInferenceRequest, useFallback?: boolean): Promise<PolicyInferenceResponse>;
    private predictWithFallback;
    healthCheck(): Promise<PolicyServiceHealth>;
    getMetrics(): Promise<PolicyServiceMetrics>;
    deployModel(modelVersion: string): Promise<void>;
    rollbackModel(targetVersion: string): Promise<void>;
    private getFallbackModelVersion;
}
