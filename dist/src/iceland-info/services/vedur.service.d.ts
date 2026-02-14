import { ConfigService } from '@nestjs/config';
import { VedurWeatherQueryDto, VedurWeatherResponseDto } from '../dto/vedur-weather.dto';
export declare class VedurService {
    private configService;
    private readonly logger;
    private readonly httpClient;
    private readonly baseURL;
    constructor(configService: ConfigService);
    getHighlandWeather(query: VedurWeatherQueryDto): Promise<VedurWeatherResponseDto>;
    private parseVedurResponse;
    private getMockWeatherData;
}
