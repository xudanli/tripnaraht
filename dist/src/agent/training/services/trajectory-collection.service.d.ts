import { PrismaService } from '../../../prisma/prisma.service';
import { ApprovalStatus } from '@prisma/client';
import { TrajectoryCollectionData, ExecutionResult } from '../interfaces/trajectory.interface';
import { TrajectoryValidatorService } from './trajectory-validator.service';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
import { RollTrajectoryAdapterService } from './roll-trajectory-adapter.service';
import { UserFeedbackService } from '../../../skills/world/services/user-feedback.service';
import { UserCapabilityLearningService } from '../../../skills/world/services/user-capability-learning.service';
export declare class TrajectoryCollectionService {
    private readonly prisma;
    private readonly validator;
    private readonly rewardExtractor;
    private readonly rollTrajectoryAdapter?;
    private readonly userFeedbackService?;
    private readonly userCapabilityLearningService?;
    private readonly logger;
    constructor(prisma: PrismaService, validator: TrajectoryValidatorService, rewardExtractor: RewardSignalExtractorService, rollTrajectoryAdapter?: RollTrajectoryAdapterService, userFeedbackService?: UserFeedbackService, userCapabilityLearningService?: UserCapabilityLearningService);
    collectTrajectory(data: TrajectoryCollectionData): Promise<{
        trajectoryId: string;
        status: string;
    }>;
    updateTrajectoryWithApproval(trajectoryId: string, userApproval: ApprovalStatus): Promise<void>;
    updateTrajectoryWithExecution(trajectoryId: string, executionResult: ExecutionResult): Promise<void>;
    findTrajectoryByRequestId(requestId: string): Promise<{
        trajectoryId: string | null;
    }>;
    findTrajectoryByTripId(tripId: string): Promise<{
        trajectoryId: string | null;
    }>;
    collectUserFeedback(tripId: string, userId: string, feedback: {
        type: 'TRIP_COMPLETED' | 'POI_SKIPPED' | 'DAY_FAILED' | 'POI_ADDED';
        data: {
            actualDays?: number;
            actualAscent?: number;
            actualDifficulty?: number;
            overallSatisfaction?: number;
            skippedPoiIds?: string[];
            skipReason?: string;
            failedDayNumbers?: number[];
            failureReason?: string;
            addedPoiIds?: string[];
        };
    }): Promise<void>;
}
