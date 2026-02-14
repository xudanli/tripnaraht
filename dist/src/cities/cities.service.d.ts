import { PrismaService } from '../prisma/prisma.service';
import { CityDto, GetCitiesQueryDto } from './dto/city.dto';
export declare class CitiesService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    findAll(query: GetCitiesQueryDto): Promise<{
        cities: CityDto[];
        total: number;
        hasMore: boolean;
        limit: number;
        offset: number;
    }>;
    findOne(id: number): Promise<CityDto>;
    private mapToDto;
    countByCountry(countryCode: string): Promise<number>;
}
