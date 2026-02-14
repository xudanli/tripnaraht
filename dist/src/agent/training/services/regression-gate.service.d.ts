import { RegressionGateResult, RegressionGateConfig } from '../interfaces/evaluation.interface';
import { ReplayComparisonResult } from '../interfaces/evaluation.interface';
import { ModelRegistryService } from './model-registry.service';
export declare class RegressionGateService {
    private readonly modelRegistry;
    private readonly logger;
    private readonly defaultConfig;
    constructor(modelRegistry: ModelRegistryService);
    checkRegression(newPolicyVersion: string, baselineVersion: string, comparisonResult: ReplayComparisonResult, config?: RegressionGateConfig): Promise<RegressionGateResult>;
    private checkSuccessRate;
    private checkAvgReward;
    private checkLatency;
    private generateRecommendation;
}
