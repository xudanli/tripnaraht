import { PrismaService } from '../../../prisma/prisma.service';
import { TripFeedback, HumanCapabilityAdjustment, FeedbackAnalysisResult } from '../interfaces/trip-feedback.interface';
import { HumanCapabilityModel } from '../models/human-capability.model';
import { DecisionLogEntry } from '../shared/decision-result.types';
export declare class TripFeedbackService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    analyzeFeedback(feedback: TripFeedback, decisionLogs: DecisionLogEntry[]): Promise<FeedbackAnalysisResult>;
    applyAdjustments(profileId: string, adjustments: HumanCapabilityAdjustment[]): Promise<HumanCapabilityModel>;
    calculateRealityAlignmentScore(decisionLogs: DecisionLogEntry[], feedback: TripFeedback): number;
    private detectHighFatigueDays;
    private generateSummary;
}
