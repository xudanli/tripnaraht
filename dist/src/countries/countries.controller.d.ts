import { CountriesService } from './countries.service';
import { CreateOrUpdateCountryPackDto } from './dto/country-pack.dto';
import { GetCountriesQueryDto } from './dto/get-countries-query.dto';
export declare class CountriesController {
    private readonly countriesService;
    private readonly logger;
    constructor(countriesService: CountriesService);
    getAllCountryPacks(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    findAll(query: GetCountriesQueryDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getCountryProfile(countryCode: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getCurrencyStrategy(countryCode: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getCountryPack(countryCode: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    createOrUpdateCountryPack(countryCode: string, dto: CreateOrUpdateCountryPackDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPaymentInfo(countryCode: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getTerrainAdvice(countryCode: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
