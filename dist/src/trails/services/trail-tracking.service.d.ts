import { PrismaService } from '../../prisma/prisma.service';
export interface TrailTrackingPoint {
    timestamp: string;
    latitude: number;
    longitude: number;
    elevation?: number;
    accuracy?: number;
    speed?: number;
}
export interface TrailTrackingSession {
    sessionId: string;
    trailId: number;
    itineraryItemId?: string;
    startTime: string;
    endTime?: string;
    points: TrailTrackingPoint[];
    statistics: {
        totalDistanceKm: number;
        totalElevationGainM: number;
        averageSpeedKmh: number;
        maxSpeedKmh: number;
        durationMinutes: number;
    };
}
export declare class TrailTrackingService {
    private prisma;
    private activeSessions;
    constructor(prisma: PrismaService);
    startTracking(trailId: number, itineraryItemId?: string): Promise<{
        sessionId: string;
    }>;
    addTrackingPoint(sessionId: string, point: TrailTrackingPoint): Promise<{
        success: boolean;
        deviation?: number;
    }>;
    stopTracking(sessionId: string): Promise<TrailTrackingSession>;
    getTrackingSession(sessionId: string): TrailTrackingSession | null;
    private calculateDeviation;
    private updateStatistics;
    private haversineDistance;
    private toRadians;
}
