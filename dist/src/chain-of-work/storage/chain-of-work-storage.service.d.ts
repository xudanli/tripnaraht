import { PrismaService } from '../../prisma/prisma.service';
import { TripNARAWorkflowDraft, ExecutionResult } from '../interfaces/chain-of-work.interface';
export interface DraftListQuery {
    page?: number;
    pageSize?: number;
    status?: string;
    userId?: string;
    workflowId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
}
export interface ExecutionListQuery {
    page?: number;
    pageSize?: number;
    status?: string;
    draftId?: string;
    startDate?: string;
    endDate?: string;
}
export interface StatsQuery {
    startDate?: string;
    endDate?: string;
}
export interface DraftListItem {
    draft_id: string;
    workflow_id: string;
    user_id?: string;
    version: string;
    step_count: number;
    status: string;
    created_at: string;
    updated_at: string;
}
export interface ExecutionListItem {
    execution_id: string;
    draft_id: string;
    user_id?: string;
    status: string;
    duration_ms: number;
    executed_at: string;
}
export interface ChainOfWorkStats {
    total_drafts: number;
    total_executions: number;
    success_rate: number;
    avg_generation_time_ms: number;
    avg_execution_time_ms: number;
    drafts_by_status: Record<string, number>;
    drafts_by_step_type: Record<string, number>;
    top_skills: Array<{
        skill_name: string;
        usage_count: number;
        avg_confidence: number;
    }>;
    top_sub_agents: Array<{
        sub_agent: string;
        usage_count: number;
    }>;
}
export declare class ChainOfWorkStorageService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getStats(query: StatsQuery): Promise<ChainOfWorkStats>;
    getDraftList(query: DraftListQuery): Promise<{
        drafts: DraftListItem[];
        pagination: {
            page: number;
            page_size: number;
            total: number;
            total_pages: number;
        };
    }>;
    getDraftDetail(draftId: string): Promise<{
        draft: TripNARAWorkflowDraft | null;
        user?: {
            id: string;
            email: string;
        };
        execution_history?: Array<{
            execution_id: string;
            status: string;
            executed_at: string;
        }>;
    }>;
    batchOperation(action: string, draftIds: string[], params?: any): Promise<{
        success_count: number;
        failed_count: number;
        results: Array<{
            draft_id: string;
            success: boolean;
            error?: string;
        }>;
    }>;
    getExecutionHistory(query: ExecutionListQuery): Promise<{
        executions: ExecutionListItem[];
        pagination: {
            page: number;
            page_size: number;
            total: number;
            total_pages: number;
        };
    }>;
    getExecutionDetail(executionId: string): Promise<{
        execution: {
            execution_id: string;
            draft_id: string;
            user_id?: string;
            status: string;
            result?: ExecutionResult;
            trace?: {
                total_duration_ms: number;
                steps_executed: number;
                llm_calls: number;
                skills_called: number;
                errors: any[];
            };
            executed_at: string;
        } | null;
    }>;
    saveExecutionResult(draftId: string, executionResult: any): Promise<void>;
    private inferSkillName;
    private inferSubAgent;
    private mapDecisionTypeToStepType;
}
