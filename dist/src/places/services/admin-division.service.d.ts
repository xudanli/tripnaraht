import { PrismaService } from '../../prisma/prisma.service';
export declare class AdminDivisionService {
    private prisma;
    private readonly logger;
    private readonly countyToCityMap;
    private readonly poiAliasToCityMap;
    constructor(prisma: PrismaService);
    mapToCity(divisionName: string): Promise<string | null>;
    mapPoiAliasToCity(poiName: string): string | null;
    normalizeCityName(cityName: string): Promise<string>;
    normalizeCityNames(cityNames: string[]): Promise<string[]>;
}
