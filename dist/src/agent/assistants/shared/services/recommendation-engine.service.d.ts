import { PrismaService } from '../../../../prisma/prisma.service';
import { UserPreferences, DestinationRecommendation } from '../../planning-assistant/interfaces/planning-assistant.interface';
type RouteDirectionsService = any;
export interface RecommendationInput {
    preferences: UserPreferences;
    limit?: number;
    excludeDestinations?: string[];
    countryCode?: string;
}
export interface ScoredDestination {
    destination: DestinationRecommendation;
    scores: {
        budget: number;
        season: number;
        preference: number;
        travelers: number;
        popularity: number;
        total: number;
    };
    matchReasons: string[];
    matchReasonsCN: string[];
}
export declare class RecommendationEngineService {
    private readonly prisma?;
    private readonly routeDirectionsService?;
    private readonly logger;
    private readonly seasonalPreferences;
    private readonly destinationTags;
    constructor(prisma?: PrismaService, routeDirectionsService?: RouteDirectionsService);
    getRecommendations(input: RecommendationInput): Promise<ScoredDestination[]>;
    private getCandidates;
    private createDestinationFromRouteDirection;
    private createDestinationFromTags;
    private scoreDestination;
    private calculateBudgetScore;
    private calculateSeasonScore;
    private calculatePreferenceScore;
    private calculateTravelersScore;
    private calculatePopularityScore;
    private generateMatchReasons;
    private translateTags;
    private formatBestSeasons;
}
export {};
