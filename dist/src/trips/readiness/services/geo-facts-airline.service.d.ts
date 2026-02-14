import { PrismaService } from '../../../prisma/prisma.service';
export interface AirlineFeatures {
    nearestAirportDistanceM: number | null;
    nearAirport: boolean;
    airlineDensityScore: number;
    nearestAirportName: string | null;
    nearestAirportProperties: Record<string, any> | null;
}
export interface Point {
    lat: number;
    lng: number;
}
export interface Route {
    points: Point[];
}
export declare class GeoFactsAirlineService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getAirlineFeaturesForPoint(lat: number, lng: number, nearAirportThresholdKm?: number, densityBufferKm?: number): Promise<AirlineFeatures>;
    getAirlineFeaturesForRoute(route: Route, nearAirportThresholdKm?: number, densityBufferKm?: number): Promise<AirlineFeatures>;
    private getNearestAirport;
    private extractAirportNameFromProperties;
    private getAirlineDensityScore;
}
