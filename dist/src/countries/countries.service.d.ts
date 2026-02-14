import { PrismaService } from '../prisma/prisma.service';
import { CurrencyStrategyDto } from './dto/currency-strategy.dto';
import { CountryPackDto, CreateOrUpdateCountryPackDto } from './dto/country-pack.dto';
import { GetCountriesQueryDto } from './dto/get-countries-query.dto';
import { CountryProfileDto } from './dto/country-profile.dto';
export declare class CountriesService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getCurrencyStrategy(countryCode: string): Promise<CurrencyStrategyDto>;
    findAll(query: GetCountriesQueryDto): Promise<{
        countries: any[];
        total: number;
        hasMore: boolean;
        limit: number;
        offset: number;
    }>;
    getCountryPack(countryCode: string): Promise<CountryPackDto>;
    getAllCountryPacks(): Promise<CountryPackDto[]>;
    createOrUpdateCountryPack(countryCode: string, dto: CreateOrUpdateCountryPackDto): Promise<CountryPackDto>;
    getCountryProfile(countryCode: string): Promise<CountryProfileDto>;
}
