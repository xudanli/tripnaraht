import { PrismaService } from '../../prisma/prisma.service';
import { PlaceNode, Zone } from '../interfaces/route-optimization.interface';
export declare class SpatialClusteringService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    clusterPlaces(places: PlaceNode[], epsilon?: number, minPoints?: number): Promise<Zone[]>;
    private simpleKMeansClustering;
    private calculateCentroid;
    private calculateZoneRadius;
    private findNearestZone;
    private calculateDistance;
    private toRadians;
}
