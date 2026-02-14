import { PrismaService } from '../../../prisma/prisma.service';
export interface MountainFeatures {
    inMountain: boolean;
    mountainElevationAvg: number | null;
    mountainElevationMax: number | null;
    mountainElevationMin: number | null;
    mountainDensityScore: number;
    terrainComplexity: number;
    nearestMountainDistanceM: number | null;
}
export interface Point {
    lat: number;
    lng: number;
}
export interface Route {
    points: Point[];
}
export declare class GeoFactsMountainService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getMountainFeaturesForPoint(lat: number, lng: number, densityBufferKm?: number): Promise<MountainFeatures>;
    getMountainFeaturesForRoute(route: Route, densityBufferKm?: number): Promise<MountainFeatures>;
    private checkInMountain;
    private getMountainElevation;
    private getMountainDensityScore;
    private getTerrainComplexity;
    private getNearestMountainDistance;
    private checkRouteIntersectsMountain;
    private buildRouteLine;
    private getRouteCenter;
    private getEmptyFeatures;
}
