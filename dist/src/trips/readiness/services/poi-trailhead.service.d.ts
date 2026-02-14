import { PrismaService } from '../../../prisma/prisma.service';
export interface TrailAccessPoint {
    trailheadId: string;
    trailheadName: string;
    trailheadLat: number;
    trailheadLng: number;
    parkingId: string | null;
    parkingName: string | null;
    parkingLat: number | null;
    parkingLng: number | null;
    parkingDistanceM: number | null;
    informationPointId: string | null;
    informationPointName: string | null;
    pathConnections: number;
}
export declare class POITrailheadService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    findTrailAccessPoints(lat: number, lng: number, radiusKm?: number): Promise<TrailAccessPoint[]>;
    private findPrimaryTrailheads;
    private findSecondaryTrailheads;
    private deduplicateTrailheads;
    private enrichTrailhead;
    private findNearestParking;
    private findNearestInformation;
    private countPathConnections;
}
