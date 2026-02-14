import { PrismaService } from '../../../prisma/prisma.service';
import { ABTestExperiment, ABTestAssignment, ABTestResult, GradualRolloutPhase } from '../interfaces/product.interface';
export declare class ABTestManagerService {
    private readonly prisma;
    private readonly logger;
    private readonly experiments;
    private readonly assignments;
    private readonly defaultRolloutPhases;
    constructor(prisma: PrismaService);
    createExperiment(name: string, description: string, variants: Array<{
        name: string;
        model_version: string;
        traffic_percentage: number;
    }>, successMetrics: string[]): Promise<ABTestExperiment>;
    startExperiment(experimentId: string): Promise<void>;
    assignToGroup(experimentId: string, requestId: string, userId?: string): Promise<ABTestAssignment>;
    analyzeResults(experimentId: string, variantMetrics: Array<{
        variant_id: string;
        sample_size: number;
        success_count: number;
        total_reward: number;
        total_latency_ms: number;
        error_count: number;
    }>): Promise<ABTestResult>;
    private consistentHash;
    private calculateStatisticalSignificance;
    getExperiment(experimentId: string): ABTestExperiment | undefined;
    listExperiments(status?: ABTestExperiment['status']): ABTestExperiment[];
    getRolloutPhases(): GradualRolloutPhase[];
}
