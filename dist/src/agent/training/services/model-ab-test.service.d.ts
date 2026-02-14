import { ModelRegistryService } from './model-registry.service';
import { EvalSuiteService } from './eval-suite.service';
import { ABTestManagerService } from './ab-test-manager.service';
export declare class ModelABTestService {
    private readonly modelRegistry;
    private readonly evalSuite;
    private readonly abTestManager;
    private readonly logger;
    constructor(modelRegistry: ModelRegistryService, evalSuite: EvalSuiteService, abTestManager: ABTestManagerService);
    createModelVersionExperiment(options: {
        name: string;
        description: string;
        controlVersion: string;
        treatmentVersion: string;
        trafficSplit?: {
            control: number;
            treatment: number;
        };
        successMetrics: string[];
        minSampleSize?: number;
        durationDays?: number;
    }): Promise<{
        experimentId: string;
        status: 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
        controlVersion: string;
        treatmentVersion: string;
    }>;
    analyzeModelVersionComparison(experimentId: string, controlVersion: string, treatmentVersion: string): Promise<{
        experimentId: string;
        controlMetrics: Record<string, number>;
        treatmentMetrics: Record<string, number>;
        improvement: Record<string, {
            absolute: number;
            percentage: number;
        }>;
        statisticalSignificance: Record<string, {
            pValue: number;
            significant: boolean;
        }>;
        recommendation: 'PROMOTE' | 'REJECT' | 'CONTINUE';
        reasoning: string;
    }>;
    private calculatePValue;
    private normalCDF;
    private erf;
    private generateRecommendation;
    promoteModelVersion(experimentId: string, treatmentVersion: string): Promise<void>;
}
