import { PrismaService } from '../../../prisma/prisma.service';
export interface RiverFeatures {
    nearestRiverDistanceM: number | null;
    nearRiver: boolean;
    riverCrossingCount: number;
    riverDensityScore: number;
    nearWaterPolygon: boolean;
    nearestWaterPolygonDistanceM: number | null;
}
export interface Point {
    lat: number;
    lng: number;
}
export interface Route {
    points: Point[];
}
export declare class GeoFactsRiverService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getRiverFeaturesForPoint(lat: number, lng: number, nearRiverThresholdM?: number, densityBufferKm?: number, nearWaterThresholdM?: number): Promise<RiverFeatures>;
    getRiverFeaturesForRoute(route: Route, nearRiverThresholdM?: number, densityBufferKm?: number): Promise<RiverFeatures>;
    private getNearestRiverDistance;
    private getRiverCrossingCount;
    private getRiverDensityScore;
    private getNearestWaterPolygonDistance;
    private buildRouteLine;
    private getRouteCenter;
    private getEmptyFeatures;
}
