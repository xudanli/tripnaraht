import { PrismaService } from '../../../prisma/prisma.service';
import { ReplayComparisonResult } from '../interfaces/evaluation.interface';
import { RLTrajectory } from '../interfaces/trajectory.interface';
import { PolicyServiceManagerService } from './policy-service-manager.service';
export declare class ReplayComparatorService {
    private readonly prisma;
    private readonly policyService?;
    private readonly logger;
    constructor(prisma: PrismaService, policyService?: PolicyServiceManagerService);
    replayBaseline(baselineVersion: string, trajectories: RLTrajectory[]): Promise<Map<string, any>>;
    replayNewPolicy(newPolicyVersion: string, trajectories: RLTrajectory[]): Promise<Map<string, any>>;
    compareResults(baselineVersion: string, newPolicyVersion: string, trajectories: RLTrajectory[]): Promise<ReplayComparisonResult>;
    private calculateStatisticalSignificance;
}
