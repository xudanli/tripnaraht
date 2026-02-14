import { PrismaService } from '../../../prisma/prisma.service';
export interface CoastlineFeatures {
    nearestCoastlineDistanceM: number | null;
    nearCoastline: boolean;
    isCoastalArea: boolean;
    coastlineDensityScore: number;
}
export interface Point {
    lat: number;
    lng: number;
}
export interface Route {
    points: Point[];
}
export declare class GeoFactsCoastlineService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getCoastlineFeaturesForPoint(lat: number, lng: number, nearCoastlineThresholdKm?: number, coastalAreaThresholdKm?: number, densityBufferKm?: number): Promise<CoastlineFeatures>;
    getCoastlineFeaturesForRoute(route: Route, nearCoastlineThresholdKm?: number, coastalAreaThresholdKm?: number, densityBufferKm?: number): Promise<CoastlineFeatures>;
    private getNearestCoastlineDistance;
    private getCoastlineDensityScore;
    private getRouteCenter;
    private getEmptyFeatures;
}
