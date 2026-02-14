import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import { TripNARAWorkflowDraft, DraftGenerationConfig } from '../interfaces/chain-of-work.interface';
export declare class GenerateDraftDto {
    trip_plan_request: TripPlanRequest;
    config?: DraftGenerationConfig;
}
export declare class SaveDraftDto {
    draft: TripNARAWorkflowDraft;
    is_auto_save?: boolean;
}
export declare class ExecuteDraftDto {
    options?: {
        timeout_ms?: number;
        cost_budget_usd?: number;
    };
}
export declare class RollbackVersionDto {
    version_id: string;
    confirm?: boolean;
}
