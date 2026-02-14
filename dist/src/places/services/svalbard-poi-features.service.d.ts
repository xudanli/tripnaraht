import { PrismaService } from '../../prisma/prisma.service';
export interface PickupPoint {
    placeId: number;
    name: string;
    nameEN?: string;
    lat: number;
    lng: number;
    pickupScore: number;
    reasons: string[];
    distanceToCoastline?: number;
    tags: Record<string, any>;
}
export interface TrailAccessPoint {
    placeId: number;
    name: string;
    nameEN?: string;
    lat: number;
    lng: number;
    confidence: 'high' | 'medium' | 'low';
    parkingPlaceId?: number;
    distanceToParking?: number;
    tags: Record<string, any>;
}
export interface SvalbardGeoFeatures {
    ports: {
        topPickupPoints: PickupPoint[];
        hasHarbour: boolean;
        totalPorts: number;
    };
    trail: {
        trailheads: TrailAccessPoint[];
        trailAccessPoints: TrailAccessPoint[];
        totalTrailheads: number;
    };
    safety: {
        hospital: boolean;
        clinic: boolean;
        pharmacy: boolean;
        police: boolean;
        fireStation: boolean;
        totalSafetyPoints: number;
    };
    supply: {
        fuel: boolean;
        supermarket: boolean;
        convenience: boolean;
        totalSupplyPoints: number;
    };
    transport: {
        airport: boolean;
        parking: boolean;
        totalTransportPoints: number;
    };
}
export declare class SvalbardPoiFeaturesService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getSvalbardFeatures(region?: string): Promise<SvalbardGeoFeatures>;
    private getPickupPoints;
    private getTrailAccessPoints;
    private getSafetyPoints;
    private getSupplyPoints;
    private getTransportPoints;
}
