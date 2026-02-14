import { ConfigService } from '@nestjs/config';
import { SafetravelQueryDto, SafetravelResponseDto } from '../dto/safetravel.dto';
export declare class SafetravelService {
    private configService;
    private readonly logger;
    private readonly httpClient;
    private readonly baseURL;
    constructor(configService: ConfigService);
    getSafetyInfo(query: SafetravelQueryDto): Promise<SafetravelResponseDto>;
    private parseSafetravelResponse;
    private getMockSafetyData;
}
