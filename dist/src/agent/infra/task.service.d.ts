import { CacheService } from '../../common/cache/cache.service';
export declare enum TaskStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED"
}
export interface TaskInfo {
    taskId: string;
    type: string;
    status: TaskStatus;
    progress: number;
    currentStage?: string;
    estimatedTimeRemaining?: number;
    error?: string;
    result?: any;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    params?: Record<string, any>;
}
export declare class TaskService {
    private readonly cacheService?;
    private readonly logger;
    private tasks;
    private readonly TASK_RESULT_CACHE_PREFIX;
    private readonly TASK_INFO_CACHE_PREFIX;
    private readonly TASK_RESULT_TTL;
    constructor(cacheService?: CacheService);
    createTask(type: string, params?: Record<string, any>): string;
    getTaskStatus(taskId: string): Promise<TaskInfo | null>;
    updateTaskStatus(taskId: string, updates: Partial<TaskInfo>): Promise<void>;
    markProcessing(taskId: string, currentStage?: string): Promise<void>;
    updateProgress(taskId: string, percent: number, stage?: string): Promise<void>;
    markCompleted(taskId: string, result: any): Promise<void>;
    markFailed(taskId: string, error: string | Error): Promise<void>;
    cancelTask(taskId: string): Promise<boolean>;
    getTaskResult(taskId: string): Promise<any | null>;
    cleanupOldTasks(): void;
}
