import { PolicyServiceManagerService } from './policy-service-manager.service';
import { ModelRegistryService } from './model-registry.service';
export declare class FallbackStrategyService {
    private readonly policyService;
    private readonly modelRegistry;
    private readonly logger;
    constructor(policyService: PolicyServiceManagerService, modelRegistry: ModelRegistryService);
    executeWithFallback<T>(operation: () => Promise<T>, fallbackOperation?: () => Promise<T>): Promise<T>;
    getBaselineModelVersion(): Promise<string | null>;
    getFallbackModelVersion(currentVersion: string): Promise<string | null>;
}
