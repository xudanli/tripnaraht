import { PlanCandidateDto } from './shared/plan-candidate.dto';
export declare class AsyncTaskResponseDto {
    taskId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    progress?: number;
    currentStage?: string;
    estimatedTimeRemaining?: number;
    updatedAt?: string;
    result?: {
        plans: PlanCandidateDto[];
    };
    error?: {
        code: string;
        message: string;
        messageCN?: string;
        details?: any;
    };
    createdAt: string;
    completedAt?: string;
    estimatedDuration?: number;
}
