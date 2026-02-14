import { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
export declare class RequestDeduplicationService {
    private readonly logger;
    private readonly dedupCache;
    private readonly defaultTTL;
    private readonly maxCacheSize;
    generateRequestHash(request: RouteAndRunRequestDto): string;
    checkDuplicate(requestHash: string): RouteAndRunResponseDto | null;
    cacheResponse(requestHash: string, response: RouteAndRunResponseDto): void;
    getStats(): {
        cacheSize: number;
        totalRequests: number;
        dedupedRequests: number;
    };
    clear(): void;
    cleanupExpired(): number;
    private evictOldest;
    private sortKeys;
}
