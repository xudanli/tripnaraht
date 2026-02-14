import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
export declare class RouteCacheService {
    private prisma;
    private redisService?;
    private readonly logger;
    private readonly cacheExpiryHours;
    private readonly cachePrefix;
    private readonly memoryCache;
    constructor(prisma: PrismaService, redisService?: RedisService);
    isShortDistance(distanceMeters: number): boolean;
    calculateShortDistanceWalkTime(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<number>;
    private fallbackCalculateWalkTime;
    private toRadians;
    private generateCacheKey;
    getCachedRoute(fromLat: number, fromLng: number, toLat: number, toLng: number, travelMode: string): Promise<any | null>;
    saveCachedRoute(fromLat: number, fromLng: number, toLat: number, toLng: number, travelMode: string, routeData: any): Promise<void>;
}
