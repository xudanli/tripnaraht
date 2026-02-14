import { PrismaService } from '../../../prisma/prisma.service';
export interface RoadFeatures {
    nearestRoadDistanceM: number | null;
    nearRoad: boolean;
    roadDensityScore: number;
    roadAccessibility: number;
    primaryRoadType: string | null;
}
export interface Point {
    lat: number;
    lng: number;
}
export interface Route {
    points: Point[];
}
export declare class GeoFactsRoadService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getRoadFeaturesForPoint(lat: number, lng: number, nearRoadThresholdM?: number, densityBufferKm?: number): Promise<RoadFeatures>;
    getRoadFeaturesForRoute(route: Route, nearRoadThresholdM?: number, densityBufferKm?: number): Promise<RoadFeatures>;
    private getNearestRoadDistance;
    private getRoadDensityScore;
    private getRoadAccessibility;
    private getPrimaryRoadType;
    private getRouteCenter;
    private getEmptyFeatures;
}
