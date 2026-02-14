import { ChainOfWorkService } from '../services/chain-of-work.service';
import { VersionService } from '../version/version.service';
import { ChainOfWorkStorageService } from '../storage/chain-of-work-storage.service';
import { TripNARAWorkflowDraft, ExecutionResult } from '../interfaces/chain-of-work.interface';
export declare class ChainOfWorkAdminController {
    private readonly chainOfWorkService;
    private readonly versionService;
    private readonly storageService;
    private readonly logger;
    constructor(chainOfWorkService: ChainOfWorkService, versionService: VersionService, storageService: ChainOfWorkStorageService);
    getStats(startDate?: string, endDate?: string): Promise<{
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
    }>;
    getAllDrafts(page?: number, pageSize?: number, status?: string, userId?: string, workflowId?: string, startDate?: string, endDate?: string, search?: string): Promise<{
        drafts: Array<{
            draft_id: string;
            workflow_id: string;
            user_id?: string;
            version: string;
            step_count: number;
            status: string;
            created_at: string;
            updated_at: string;
        }>;
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
        message?: string;
    }>;
    executeDraft(draftId: string, body: {
        options?: {
            timeout_ms?: number;
            cost_budget_usd?: number;
        };
    }): Promise<{
        execution_id: string;
        draft_id: string;
        status: string;
        message: string;
        started_at: string;
        result?: any;
    }>;
    private inferSkillFromStepType;
    private inferSubAgentFromStepType;
    batchOperation(body: {
        action: string;
        draft_ids: string[];
        params?: any;
    }): Promise<{
        success_count: number;
        failed_count: number;
        results: Array<{
            draft_id: string;
            success: boolean;
            error?: string;
        }>;
    }>;
    getExecutionHistory(page?: number, pageSize?: number, status?: string, draftId?: string, startDate?: string, endDate?: string): Promise<{
        executions: Array<{
            execution_id: string;
            draft_id: string;
            user_id?: string;
            status: string;
            duration_ms: number;
            executed_at: string;
        }>;
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
        message?: string;
    }>;
    getConfig(): Promise<{
        default_model: string;
        default_temperature: number;
        skill_mapping_threshold: number;
        auto_save_enabled: boolean;
        version_history_limit: number;
        orchestration_modes: string[];
        supported_step_types: string[];
    }>;
    updateConfig(body: {
        default_model?: string;
        default_temperature?: number;
        skill_mapping_threshold?: number;
        auto_save_enabled?: boolean;
        version_history_limit?: number;
    }): Promise<{
        config: {
            default_model: string;
            default_temperature: number;
            skill_mapping_threshold: number;
            auto_save_enabled: boolean;
            version_history_limit: number;
        };
        updated_at: string;
    }>;
}
