import { PrismaService } from '../../prisma/prisma.service';
import { PlaceMetadata } from '../interfaces/place-metadata.interface';
import { PhysicalMetadata } from '../interfaces/physical-metadata.interface';
export declare class PlaceTrailEnrichmentService {
    private prisma;
    constructor(prisma: PrismaService);
    enrichFromTrail(metadata: PlaceMetadata): Promise<Partial<PhysicalMetadata> | null>;
    private buildPhysicalMetadataFromTrail;
    enrichMultipleFromTrails(places: Array<{
        id: number;
        metadata: PlaceMetadata;
    }>): Promise<Map<number, Partial<PhysicalMetadata>>>;
}
