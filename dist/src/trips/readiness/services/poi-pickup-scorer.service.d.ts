import { PrismaService } from '../../../prisma/prisma.service';
export interface PickupPoint {
    poiId: string;
    name: string;
    lat: number;
    lng: number;
    score: number;
    reasons: string[];
    category: string;
    distanceToCoastlineM: number | null;
    hasContactInfo: boolean;
    tags: Record<string, any>;
}
export declare class POIPickupScorerService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    findTopPickupPoints(lat: number, lng: number, radiusKm?: number, limit?: number): Promise<PickupPoint[]>;
    private recallCandidates;
    private getDistanceToCoastline;
    private scoreCandidate;
}
