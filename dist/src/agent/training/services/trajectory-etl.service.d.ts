import { PrismaService } from '../../../prisma/prisma.service';
import { RLTrajectory, TrajectoryETLOptions, ETLExportFormat, ETLExportResult } from '../interfaces/trajectory.interface';
import { DataQualityCheckerService } from './data-quality-checker.service';
import { PIIAnonymizerService, PIIAnonymizationConfig } from './pii-anonymizer.service';
import { DatasetVersionManagerService } from './dataset-version-manager.service';
export declare class TrajectoryETLService {
    private readonly prisma;
    private readonly qualityChecker?;
    private readonly piiAnonymizer?;
    private readonly versionManager?;
    private readonly logger;
    constructor(prisma: PrismaService, qualityChecker?: DataQualityCheckerService, piiAnonymizer?: PIIAnonymizerService, versionManager?: DatasetVersionManagerService);
    extractTrajectories(options?: TrajectoryETLOptions): Promise<RLTrajectory[]>;
    transformToRLFormat(trajectory: any): Promise<RLTrajectory>;
    exportTrajectories(trajectories: RLTrajectory[], format?: ETLExportFormat, outputDir?: string): Promise<ETLExportResult>;
    loadToDataset(options?: TrajectoryETLOptions, format?: ETLExportFormat, outputDir?: string, anonymizePII?: boolean, piiConfig?: PIIAnonymizationConfig, createVersion?: boolean): Promise<ETLExportResult & {
        version?: string;
    }>;
    private extractUserRequest;
    private extractReasoning;
    private extractActor;
    private mapDecisionPointToActionType;
}
