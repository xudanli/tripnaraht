import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
export declare class DecisionCacheService {
    private readonly logger;
    private readonly cache;
    cachePlan(stateKey: string, plan: TripPlan, ttl?: number): void;
    getCachedPlan(stateKey: string): TripPlan | null;
    generateStateKey(state: TripWorldState): string;
    cacheIntermediateResult(key: string, result: any, ttl?: number): void;
    getCachedIntermediateResult(key: string): any | null;
    cleanupExpired(): void;
    clear(): void;
    private hashString;
}
