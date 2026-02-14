export type OrchestrationMode = "CLAUDE_SM" | "CLAUDE_DYNAMIC" | "LEGACY";
export type ResultStatus = "OK" | "NEED_MORE_INFO" | "NEED_CONSENT" | "NEED_CONFIRMATION" | "FAILED" | "TIMEOUT";
export interface Deadline {
    startTs: number;
    totalMs: number;
    remainingMs(): number;
    elapsedMs(): number;
    isExpired(): boolean;
    clamp(ms: number, minMs?: number): number;
}
export declare function createDeadline(totalMs: number): Deadline;
export declare function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T>;
export interface StabilityContext {
    requestId: string;
    userId?: string;
    tripId?: string | null;
    requestHash: string;
    deadline: Deadline;
    traceInfo?: any;
    startTs: number;
}
export interface CircuitBreakerState {
    state: "CLOSED" | "OPEN" | "HALF_OPEN";
    openedAt?: number;
    failures: number;
    lastError?: string;
}
export declare class CircuitBreaker {
    private readonly failThreshold;
    private readonly openMs;
    private state;
    constructor(failThreshold: number, openMs: number);
    snapshot(): CircuitBreakerState;
    canPass(): boolean;
    onSuccess(): void;
    onFailure(err: any): void;
}
export declare class ModeLock {
    private cache;
    keyFor(ctx: StabilityContext): string;
    get(ctx: StabilityContext): OrchestrationMode | undefined;
    set(ctx: StabilityContext, mode: OrchestrationMode): void;
}
export interface NormalizedFailure {
    status: ResultStatus;
    errorType: string;
    message: string;
    isTimeout: boolean;
}
export declare function normalizeError(e: any): NormalizedFailure;
export declare class FallbackGuard {
    private used;
    tryUse(): boolean;
    usedAlready(): boolean;
}
