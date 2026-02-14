import { ConfigService } from '@nestjs/config';
import { RoadConditionsQueryDto, RoadConditionsResponseDto } from '../dto/road-conditions.dto';
export declare class RoadService {
    private configService;
    private readonly logger;
    private readonly httpClient;
    private readonly baseURL;
    constructor(configService: ConfigService);
    getRoadConditions(query: RoadConditionsQueryDto): Promise<RoadConditionsResponseDto>;
    private parseRoadResponse;
    private getMockRoadData;
}
