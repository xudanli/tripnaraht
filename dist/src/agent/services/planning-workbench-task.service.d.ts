import { PlanningWorkbenchResponse } from './planning-workbench-agent.service';
export declare enum PlanningWorkbenchTaskStatus {
    PENDING = "PENDING",
    RUNNING = "RUNNING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED"
}
export interface PlanningWorkbenchTaskProgress {
    taskId: string;
    status: PlanningWorkbenchTaskStatus;
    progress: number;
    currentStage?: string;
    estimatedTimeRemaining?: number;
    error?: string;
    result?: PlanningWorkbenchResponse;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
}
export declare class PlanningWorkbenchTaskService {
    private readonly logger;
    private tasks;
    createTask(): string;
    getTaskProgress(taskId: string): PlanningWorkbenchTaskProgress | null;
    updateProgress(taskId: string, updates: Partial<PlanningWorkbenchTaskProgress>): void;
    markRunning(taskId: string, currentStage?: string): void;
    updateProgressPercent(taskId: string, percent: number, stage?: string): void;
    markCompleted(taskId: string, result: PlanningWorkbenchResponse): void;
    markFailed(taskId: string, error: string): void;
    cancelTask(taskId: string): boolean;
    cleanupOldTasks(): void;
}
