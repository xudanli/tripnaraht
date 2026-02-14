import { PrismaService } from '../../prisma/prisma.service';
export type StateType = 'PlanState' | 'TripState' | 'TripPlannerSession';
export interface JsonPatch {
    op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
    path: string;
    value?: unknown;
    from?: string;
}
export interface StateChange {
    changeId: string;
    stateId: string;
    stateType: StateType;
    version: number;
    previousVersion: number;
    patches: JsonPatch[];
    meta: {
        traceId: string;
        actor: string;
        action: string;
        reason: string;
        timestamp: string;
    };
    checkpointId?: string;
    compensations?: Compensation[];
}
export interface Compensation {
    type: 'api_call' | 'database' | 'notification' | 'external';
    target: string;
    action: string;
    params: Record<string, unknown>;
    executed: boolean;
    executedAt?: string;
}
export interface Checkpoint {
    checkpointId: string;
    stateId: string;
    stateType: StateType;
    version: number;
    snapshot: unknown;
    createdAt: string;
    createdBy: string;
    reason: string;
}
export interface StateMeta {
    stateId: string;
    stateType: StateType;
    version: number;
    createdAt: string;
    updatedAt: string;
    lockedBy?: string;
    lockExpiresAt?: string;
}
export interface WriteResult {
    success: boolean;
    version: number;
    changeId?: string;
    error?: {
        code: 'VERSION_CONFLICT' | 'LOCKED' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'UNKNOWN';
        message: string;
        currentVersion?: number;
    };
}
export interface RollbackResult {
    success: boolean;
    rolledBackTo: number;
    compensationsExecuted: number;
    error?: string;
}
export declare class StateStoreService {
    private readonly prisma?;
    private readonly logger;
    private states;
    private changeHistory;
    private checkpoints;
    private readonly LOCK_TIMEOUT_MS;
    constructor(prisma?: PrismaService);
    get<T>(stateId: string, stateType: StateType): Promise<{
        data: T;
        meta: StateMeta;
    } | null>;
    getVersion(stateId: string, stateType: StateType): Promise<number | null>;
    getHistory(stateId: string, stateType: StateType, limit?: number): Promise<StateChange[]>;
    getCheckpoints(stateId: string, stateType: StateType): Promise<Checkpoint[]>;
    create<T>(stateId: string, stateType: StateType, initialData: T, actor: string, traceId: string): Promise<WriteResult>;
    update<T>(stateId: string, stateType: StateType, patches: JsonPatch[], expectedVersion: number, actor: string, traceId: string, options?: {
        action?: string;
        reason?: string;
        compensations?: Compensation[];
    }): Promise<WriteResult>;
    createCheckpoint(stateId: string, stateType: StateType, actor: string, reason: string): Promise<Checkpoint | null>;
    rollbackToCheckpoint(stateId: string, stateType: StateType, checkpointId: string, actor: string, traceId: string): Promise<RollbackResult>;
    acquireLock(stateId: string, stateType: StateType, actor: string): Promise<boolean>;
    releaseLock(stateId: string, stateType: StateType, actor: string): Promise<boolean>;
    rebaseAndRetry<T>(stateId: string, stateType: StateType, patchGenerator: (currentData: T) => JsonPatch[], actor: string, traceId: string, maxRetries?: number): Promise<WriteResult>;
    private getKey;
    private generateId;
    private addToHistory;
    private applyPatches;
    private executeCompensation;
}
