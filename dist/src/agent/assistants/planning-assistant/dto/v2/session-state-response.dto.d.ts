import { DestinationRecommendationDto } from './shared/destination-recommendation.dto';
import { PlanCandidateDto } from './shared/plan-candidate.dto';
export declare class SessionStateResponseDto {
    sessionId: string;
    userId?: string;
    phase: string;
    preferences: Record<string, any>;
    recommendations?: DestinationRecommendationDto[];
    selectedDestination?: string;
    planCandidates?: PlanCandidateDto[];
    selectedPlanId?: string;
    confirmedTripId?: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
}
