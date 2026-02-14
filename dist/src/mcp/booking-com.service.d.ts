import { SearchCarRentalsParams, SearchCarRentalsResponse } from './booking-com-client';
import { RedisService } from '../redis/redis.service';
export declare class BookingComService {
    private readonly redisService?;
    private readonly logger;
    private client;
    constructor(redisService?: RedisService);
    searchCarRentals(params: SearchCarRentalsParams): Promise<SearchCarRentalsResponse>;
    isAvailable(): boolean;
}
