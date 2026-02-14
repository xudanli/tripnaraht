import { PrismaService } from '../../../prisma/prisma.service';
import { ApprovalStatus } from '@prisma/client';
import { TrajectoryCollectionData, ExecutionResult } from '../interfaces/trajectory.interface';
import { TrajectoryValidatorService } from './trajectory-validator.service';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
import { RollTrajectoryAdapterService } from './roll-trajectory-adapter.service';
export declare class TrajectoryCollectionService {
    private readonly prisma;
    private readonly validator;
    private readonly rewardExtractor;
    private readonly rollTrajectoryAdapter?;
    private readonly logger;
    constructor(prisma: PrismaService, validator: TrajectoryValidatorService, rewardExtractor: RewardSignalExtractorService, rollTrajectoryAdapter?: RollTrajectoryAdapterService);
    collectTrajectory(data: TrajectoryCollectionData): Promise<{
        trajectoryId: string;
        status: string;
    }>;
    updateTrajectoryWithApproval(trajectoryId: string, userApproval: ApprovalStatus): Promise<void>;
    updateTrajectoryWithExecution(trajectoryId: string, executionResult: ExecutionResult): Promise<void>;
    findTrajectoryByRequestId(requestId: string): Promise<{
        trajectoryId: string | null;
    }>;
}
