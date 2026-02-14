import { PrismaService } from '../../prisma/prisma.service';
import { TrailsService } from '../trails.service';
import { PacingConfig } from '../../trips/interfaces/pacing-config.interface';
export interface SmartTrailPlanRequest {
    placeIds: number[];
    pacingConfig: PacingConfig;
    preferences?: {
        maxTotalDistanceKm?: number;
        maxSegmentDistanceKm?: number;
        preferredDifficulty?: 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';
        preferOffRoad?: boolean;
        allowSplit?: boolean;
    };
}
export interface SmartTrailPlanResult {
    trails: Array<{
        trailId: number;
        trail: any;
        matchScore: number;
        fatigueResult: any;
        suitable: boolean;
        recommendation: string;
    }>;
    summary: {
        totalDistanceKm: number;
        totalElevationGainM: number;
        totalDurationHours: number;
        totalHpCost: number;
        exceedsLimit: boolean;
        recommendedRestCount: number;
        suitabilityScore: number;
    };
    suggestedSchedule: Array<{
        day: number;
        trailIds: number[];
        distanceKm: number;
        durationHours: number;
        restCount: number;
    }>;
}
export declare class SmartTrailPlannerService {
    private prisma;
    private trailsService;
    constructor(prisma: PrismaService, trailsService: TrailsService);
    planSmartRoute(request: SmartTrailPlanRequest): Promise<SmartTrailPlanResult>;
    private calculateSummary;
    private calculateSuitabilityScore;
    private optimizeForDistanceLimit;
    private generateSchedule;
}
