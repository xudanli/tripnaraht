export declare class Deadline {
    private readonly totalMs;
    private readonly startedAt;
    constructor(totalMs: number);
    elapsedMs(): number;
    remainingMs(): number;
    clampTimeoutMs(desiredMs: number, minMs?: number): number;
    isExpired(): boolean;
}
export declare function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T>;
export declare function runBounded<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]>;
type CacheKey = string;
export declare class SimpleLruCache<V> {
    private readonly maxSize;
    private readonly ttlMs;
    private map;
    constructor(maxSize: number, ttlMs: number);
    get(key: CacheKey): V | undefined;
    set(key: CacheKey, value: V): void;
}
export {};
