import { PrismaService } from '../../../prisma/prisma.service';
import { DEMElevationService } from './dem-elevation.service';
export interface EffortMetadata {
    totalAscent: number;
    totalDescent: number;
    netElevationGain: number;
    maxElevation: number;
    minElevation: number;
    avgElevation: number;
    maxSlope: number;
    avgSlope: number;
    totalDistance: number;
    effortScore: number;
    difficulty: 'easy' | 'moderate' | 'hard' | 'extreme';
    estimatedDuration: number;
    suggestedRestPoints: number;
    terrainComplexity: number;
    elevationProfile?: Array<{
        distance: number;
        elevation: number;
        slope: number;
    }>;
}
export interface RoutePoint {
    lat: number;
    lng: number;
    distance?: number;
}
export declare class DEMEffortMetadataService {
    private readonly prisma;
    private readonly demService;
    private readonly logger;
    constructor(prisma: PrismaService, demService: DEMElevationService);
    private calculateDistance;
    private toRadians;
    private calculateSlope;
    calculateEffortMetadata(points: RoutePoint[], options?: {
        activityType?: 'walking' | 'cycling' | 'driving';
        samplingInterval?: number;
        includeElevationProfile?: boolean;
    }): Promise<EffortMetadata>;
    compareRoutes(route1: RoutePoint[], route2: RoutePoint[], options?: {
        activityType?: 'walking' | 'cycling' | 'driving';
    }): Promise<{
        route1: EffortMetadata;
        route2: EffortMetadata;
        comparison: {
            effortDifference: number;
            keyDifferences: string[];
            recommendation: string;
        };
    }>;
    detectKeyPoints(points: RoutePoint[]): Promise<{
        highestPoint: {
            index: number;
            lat: number;
            lng: number;
            elevation: number;
        };
        steepestSegment: {
            startIndex: number;
            endIndex: number;
            slope: number;
        };
        mountainPasses: Array<{
            index: number;
            lat: number;
            lng: number;
            elevation: number;
        }>;
    }>;
}
