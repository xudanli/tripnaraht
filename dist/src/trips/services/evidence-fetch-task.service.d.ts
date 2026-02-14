export declare enum EvidenceFetchTaskStatus {
    PENDING = "PENDING",
    RUNNING = "RUNNING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED"
}
export interface EvidenceFetchTaskProgress {
    taskId: string;
    tripId: string;
    status: EvidenceFetchTaskStatus;
    totalPlaces: number;
    processedPlaces: number;
    currentPlace?: {
        id: number;
        name: string;
        evidenceTypes: string[];
    };
    estimatedTimeRemaining?: number;
    canCancel: boolean;
    successCount: number;
    failedCount: number;
    partialCount: number;
    error?: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
}
export declare class EvidenceFetchTaskService {
    private readonly logger;
    private tasks;
    createTask(tripId: string, totalPlaces: number): string;
    getTaskProgress(taskId: string): EvidenceFetchTaskProgress | null;
    updateProgress(taskId: string, updates: Partial<EvidenceFetchTaskProgress>): void;
    updateCurrentPlace(taskId: string, placeId: number, placeName: string, evidenceTypes: string[]): void;
    incrementProcessed(taskId: string, status?: 'success' | 'failed' | 'partial'): void;
    markRunning(taskId: string): void;
    markCompleted(taskId: string, successCount: number, failedCount: number, partialCount: number): void;
    markFailed(taskId: string, error: string): void;
    cancelTask(taskId: string): boolean;
    cleanupOldTasks(): void;
}
