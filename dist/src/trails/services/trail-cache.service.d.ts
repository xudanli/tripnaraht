export declare class TrailCacheService {
    private trailCache;
    private placesAlongCache;
    private recommendationCache;
    private readonly DEFAULT_TTL;
    getTrail(trailId: number): any | null;
    setTrail(trailId: number, data: any, ttl?: number): void;
    getPlacesAlong(trailId: number, radiusKm: number): any | null;
    setPlacesAlong(trailId: number, radiusKm: number, data: any, ttl?: number): void;
    getRecommendation(placeIds: number[], options: any): any | null;
    setRecommendation(placeIds: number[], options: any, data: any, ttl?: number): void;
    clearAll(): void;
    clearTrail(trailId: number): void;
    private getRecommendationKey;
    cleanup(): void;
}
