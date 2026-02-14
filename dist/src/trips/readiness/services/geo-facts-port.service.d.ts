import { PrismaService } from '../../../prisma/prisma.service';
export interface PortFeatures {
    nearestPortDistanceM: number | null;
    nearPort: boolean;
    portDensityScore: number;
    nearestPortName: string | null;
    nearestPortProperties: Record<string, any> | null;
}
export interface Point {
    lat: number;
    lng: number;
}
export interface Route {
    points: Point[];
}
export declare class GeoFactsPortService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getPortFeaturesForPoint(lat: number, lng: number, nearPortThresholdKm?: number, densityBufferKm?: number): Promise<PortFeatures>;
    getPortFeaturesForRoute(route: Route, nearPortThresholdKm?: number, densityBufferKm?: number): Promise<PortFeatures>;
    private getNearestPort;
    private extractPortNameFromProperties;
    private getPortDensityScore;
}
