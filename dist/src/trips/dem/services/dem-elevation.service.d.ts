import { PrismaService } from '../../../prisma/prisma.service';
export declare class DEMElevationService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    private findCityDEMTables;
    private isInIcelandBounds;
    getElevation(lat: number, lng: number, fallbackTable?: string): Promise<number | null>;
    private queryElevationFromTable;
    getElevations(points: Array<{
        lat: number;
        lng: number;
    }>, fallbackTable?: string): Promise<Array<number | null>>;
    private batchQueryElevations;
    private batchQueryFromTable;
    checkDEMTableExists(demTable?: string): Promise<boolean>;
    getDEMBounds(demTable?: string): Promise<{
        minLat: number;
        maxLat: number;
        minLng: number;
        maxLng: number;
    } | null>;
}
