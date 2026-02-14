import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import { DecisionDraftGenerationConfig } from '../interfaces/decision-draft.interface';
import { PartialRegenerationConfig } from '../services/decision-draft-editor.service';
declare class DecisionStepModificationsDto {
    title?: string;
    description?: string;
    outputs?: Array<{
        name: string;
        value: any;
        confidence?: number;
    }>;
    evidence_weights?: Record<string, number>;
}
export declare class DecisionStepEditOperationDto {
    decision_step_id: string;
    action: 'approve' | 'reject' | 'modify';
    modifications?: DecisionStepModificationsDto;
    reasoning?: string;
}
export declare class GenerateDecisionDraftDto {
    user_input: string;
    trip_plan_request: TripPlanRequest;
    config?: DecisionDraftGenerationConfig;
}
export declare class EditDecisionStepDto {
    operation: DecisionStepEditOperationDto;
}
export declare class BatchEditDecisionStepsDto {
    operations: DecisionStepEditOperationDto[];
}
export declare class PartialRegenerateDto {
    config?: PartialRegenerationConfig;
}
export declare class ReorderDecisionStepsDto {
    new_order: string[];
}
export declare class SaveVersionDto {
    creator: string;
    description?: string;
    tags?: string[];
}
export declare class ForkVersionDto {
    new_workflow_id: string;
    creator: string;
    description?: string;
}
export declare class GetExplanationQueryDto {
    mode?: 'toc' | 'expert' | 'studio';
}
export {};
