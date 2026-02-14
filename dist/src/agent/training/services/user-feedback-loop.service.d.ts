import { PrismaService } from '../../../prisma/prisma.service';
import { UserActionTracking, UserFeedback, FeedbackAnalysis, UserActionType } from '../interfaces/product.interface';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
export declare class UserFeedbackLoopService {
    private readonly prisma;
    private readonly rewardExtractor;
    private readonly logger;
    private readonly actions;
    private readonly feedbacks;
    constructor(prisma: PrismaService, rewardExtractor: RewardSignalExtractorService);
    trackUserAction(userId: string | undefined, actionType: UserActionType, context: {
        request_id: string;
        plan_id?: string;
        decision_id?: string;
        metadata?: Record<string, any>;
    }): Promise<UserActionTracking>;
    collectFeedback(userId: string | undefined, requestId: string, planId: string | undefined, feedback: {
        satisfaction?: number;
        comments?: string;
        issues?: string[];
    }): Promise<UserFeedback>;
    analyzeFeedback(startDate: string, endDate: string): Promise<FeedbackAnalysis>;
    applyFeedbackToReward(requestId: string): Promise<{
        reward_signals: any[];
        total_reward: number;
    }>;
    private calculateTrend;
}
