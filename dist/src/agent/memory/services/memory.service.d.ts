import { PrismaService } from '../../../prisma/prisma.service';
import { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
import { RouteDirectionDecisionMemory } from '../interfaces/route-direction-decision-memory.interface';
import { RouteDirectionHealth } from '../interfaces/route-direction-health.interface';
import { TripOutcomeFeedback } from '../interfaces/trip-outcome-feedback.interface';
export declare class MemoryService {
    private readonly prisma?;
    private readonly logger;
    private readonly useDatabase;
    constructor(prisma?: PrismaService);
    private userProfiles;
    private decisionMemories;
    private routeHealths;
    private tripFeedbacks;
    getUserTravelProfile(userId: string): Promise<UserTravelProfile | null>;
    saveUserTravelProfile(profile: UserTravelProfile): Promise<void>;
    updateUserTravelProfile(userId: string, updates: Partial<UserTravelProfile>): Promise<UserTravelProfile>;
    saveRouteDirectionDecision(memory: RouteDirectionDecisionMemory): Promise<void>;
    getUserRouteDirectionDecisions(userId: string, countryCode?: string): Promise<RouteDirectionDecisionMemory[]>;
    getRouteDirectionHealth(routeDirectionId: number, countryCode: string): Promise<RouteDirectionHealth | null>;
    updateRouteDirectionHealth(routeDirectionId: number, countryCode: string, success: boolean, failureReason?: string, repair?: string): Promise<RouteDirectionHealth>;
    saveTripOutcomeFeedback(feedback: TripOutcomeFeedback): Promise<void>;
    private learnFromFeedback;
    getUserTripFeedbacks(userId: string): Promise<TripOutcomeFeedback[]>;
}
