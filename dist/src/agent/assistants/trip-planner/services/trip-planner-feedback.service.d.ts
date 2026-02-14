import { PrismaService } from '../../../../prisma/prisma.service';
export interface TripPlannerFeedback {
    questionId: string;
    sessionId?: string;
    tripId?: string;
    userId?: string;
    question?: string;
    answer?: string;
    helpful: boolean;
    rating?: number;
    comment?: string;
    actionTaken?: string;
    source?: 'RAG' | 'RAG+LLM' | 'LLM';
    ragConfidence?: number;
    processingTimeMs?: number;
}
export interface FeedbackAnalysis {
    periodStart: Date;
    periodEnd: Date;
    totalFeedback: number;
    helpfulCount: number;
    notHelpfulCount: number;
    averageRating: number;
    averageRagConfidence: number;
    sourceDistribution: {
        RAG: number;
        'RAG+LLM': number;
        LLM: number;
    };
    commonIssues: Array<{
        issue: string;
        count: number;
    }>;
}
export declare class TripPlannerFeedbackService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    saveFeedback(feedback: TripPlannerFeedback): Promise<void>;
    analyzeFeedback(startDate: Date, endDate: Date): Promise<FeedbackAnalysis>;
    triggerImprovement(feedback: TripPlannerFeedback): Promise<void>;
    getFeedbackStats(days?: number): Promise<FeedbackAnalysis>;
}
