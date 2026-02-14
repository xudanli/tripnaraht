import { PrismaService } from '../../../prisma/prisma.service';
import { OPEResult, OPEReport } from '../interfaces/evaluation.interface';
import { RLTrajectory } from '../interfaces/trajectory.interface';
export declare class OfflinePolicyEvaluatorService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    evaluateWithIS(trajectories: RLTrajectory[], baselineRewards: Map<string, number>): Promise<OPEResult>;
    evaluateWithDR(trajectories: RLTrajectory[], baselineRewards: Map<string, number>, directMethodEstimates?: Map<string, number>): Promise<OPEResult>;
    evaluateWithWDR(trajectories: RLTrajectory[], baselineRewards: Map<string, number>, directMethodEstimates?: Map<string, number>): Promise<OPEResult>;
    generateReport(modelVersion: string, baselineVersion: string | undefined, trajectories: RLTrajectory[], baselineRewards: Map<string, number>, directMethodEstimates?: Map<string, number>): Promise<OPEReport>;
    private calculateImportanceWeight;
    private calculateWeightedImportanceWeight;
    private calculateConfidenceInterval;
    private calculateVariance;
    private shouldDeployModel;
    private calculateConfidence;
    private generateReasoning;
}
