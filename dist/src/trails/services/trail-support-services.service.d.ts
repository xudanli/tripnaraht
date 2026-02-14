import { PrismaService } from '../../prisma/prisma.service';
export interface TrailSupportService {
    type: 'EQUIPMENT' | 'INSURANCE' | 'SUPPLY' | 'ACCOMMODATION' | 'EMERGENCY';
    name: string;
    description: string;
    location?: {
        lat: number;
        lng: number;
    };
    distanceKm?: number;
    recommendation?: string;
    metadata?: any;
}
export declare class TrailSupportServicesService {
    private prisma;
    constructor(prisma: PrismaService);
    recommendSupportServices(trailId: number): Promise<TrailSupportService[]>;
    private recommendEquipment;
    private recommendInsurance;
    private recommendSupplyPoints;
    private recommendEmergencyServices;
    private extractCoordinates;
    private extractTrailPoints;
    private findNearbyPlaces;
    private haversineDistance;
    private toRadians;
}
