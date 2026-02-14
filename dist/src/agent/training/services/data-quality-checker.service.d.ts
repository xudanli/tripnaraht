import { PrismaService } from '../../../prisma/prisma.service';
import { RLTrajectory } from '../interfaces/trajectory.interface';
export interface DataQualityResult {
    isValid: boolean;
    score: number;
    issues: DataQualityIssue[];
    stats: {
        total_trajectories: number;
        valid_trajectories: number;
        invalid_trajectories: number;
        completeness_rate: number;
        duplicate_rate: number;
        anomaly_rate: number;
        integrity_rate: number;
    };
}
export interface DataQualityIssue {
    type: 'MISSING_FIELD' | 'DUPLICATE' | 'ANOMALY' | 'INCOMPLETE_CHAIN' | 'INVALID_FORMAT';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    trajectory_id?: string;
    step_index?: number;
    field?: string;
    message: string;
    suggestion?: string;
}
export declare class DataQualityCheckerService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    validateTrajectory(trajectory: RLTrajectory): Promise<{
        isValid: boolean;
        score: number;
        issues: DataQualityIssue[];
    }>;
    validateDataset(trajectories: RLTrajectory[]): Promise<DataQualityResult>;
    private checkRequiredFields;
    private checkFormat;
    private checkAnomalies;
    private checkChainIntegrity;
    private checkDuplicates;
    private calculateQualityScore;
    private calculateCompletenessRate;
    private calculateIntegrityRate;
}
