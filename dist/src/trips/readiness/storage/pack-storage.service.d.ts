import { PrismaService } from '../../../prisma/prisma.service';
import { ReadinessPack } from '../types/readiness-pack.types';
export declare class PackStorageService {
    private readonly prisma;
    private readonly logger;
    private readonly packsDirectory;
    constructor(prisma: PrismaService);
    private loadGlobalPackingTemplate;
    private loadGlobalPackingGuide;
    loadPack(packId: string, includePackingData?: boolean): Promise<ReadinessPack | null>;
    loadAllPacks(): Promise<ReadinessPack[]>;
    findPackByDestination(destinationId: string): Promise<ReadinessPack | null>;
    findPacksByCountry(countryCode: string): Promise<ReadinessPack[]>;
    findPackByCity(cityName: string, countryCode?: string): Promise<ReadinessPack | null>;
    findPacksByRegion(regionName: string): Promise<ReadinessPack[]>;
    findNearestPack(lat: number, lng: number, maxDistanceKm?: number): Promise<ReadinessPack | null>;
    private calculateHaversineDistance;
    private toRadians;
    private extractLocalizedFields;
    savePack(pack: ReadinessPack): Promise<boolean>;
    importPackFromFile(filePath: string): Promise<boolean>;
    importPacksFromDirectory(directory?: string): Promise<{
        success: number;
        failed: number;
    }>;
    deactivatePack(packId: string): Promise<boolean>;
    validatePack(pack: ReadinessPack): {
        valid: boolean;
        errors: string[];
    };
}
