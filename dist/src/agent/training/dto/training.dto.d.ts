import { ModelType, BaseModel, TrainingType, SEVLevel, RiskCategory, RiskHandleAction, UserActionType, DecisionType, EvidenceType, Language } from '../interfaces/enums.interface';
export declare class CreateTrainingJobDto {
    dataset_version: string;
    model_config: {
        model_type: ModelType;
        base_model: BaseModel;
        custom_model_path?: string;
        architecture?: Record<string, any>;
        tokenizer?: string;
    };
    training_config: {
        batch_size: number;
        learning_rate: number;
        num_epochs: number;
        warmup_steps?: number;
        weight_decay?: number;
        gradient_accumulation_steps?: number;
        max_grad_norm?: number;
        save_steps?: number;
        eval_steps?: number;
        logging_steps?: number;
        seed?: number;
    };
    hyperparameter_search?: {
        enabled: boolean;
        search_space: any;
        num_trials?: number;
    };
}
export declare class ClassifyRiskEventDto {
    request_id: string;
    violations: any[];
    category: RiskCategory;
    description: string;
}
export declare class HandleRiskEventDto {
    action: RiskHandleAction;
    resolved_by: string;
    mitigation_details?: string;
}
export declare class RecordAuditDto {
    request_id: string;
    decision_type: DecisionType;
    decision_result: string;
    constraint_check_result: any;
    context: {
        user_input: string;
        planning_request: Record<string, any>;
        model_version: string;
        experiment_id?: string;
    };
    evidence_chain?: EvidenceType[];
}
export declare class TrackUserActionDto {
    user_id?: string;
    action_type: UserActionType;
    context: {
        request_id: string;
        plan_id?: string;
        decision_id?: string;
        metadata?: Record<string, any>;
    };
    metadata?: Record<string, any>;
}
export declare class CreateABTestDto {
    name: string;
    description: string;
    variants: Array<{
        name: string;
        model_version: string;
        traffic_percentage: number;
    }>;
    metrics: string[];
    start_date?: string;
    end_date?: string;
}
export declare class TrainRewardModelDto {
    training_type: TrainingType;
    data: any[];
    config?: any;
}
export declare class GetClarificationPromptDto {
    scenario?: string;
    missing_field?: string;
    language?: Language;
}
export declare class GetRiskPromptDto {
    sev_level?: SEVLevel;
    category?: RiskCategory;
    reason?: string;
    language?: Language;
}
export declare class GetSeasonalRisksDto {
    destination?: string;
    month?: number;
}
export declare class GetRedLineRulesDto {
    destination?: string;
}
export declare class ListRedTeamTestCasesDto {
    category?: RiskCategory;
}
export type ExportFormat = 'jsonl' | 'json' | 'parquet';
export declare class ExportTrajectoriesDto {
    trajectory_ids?: string[];
    request_ids?: string[];
    min_validation_score?: number;
    min_total_reward?: number;
    model_version?: string;
    country_code?: string;
    date_range?: {
        start: string;
        end: string;
    };
    format?: ExportFormat;
}
export type BatchExportFormat = 'jsonl' | 'json' | 'both' | 'none';
export declare class CreateBatchTaskDto {
    minScore?: number;
    minReward?: number;
    maxUsageCount?: number;
    batchSize?: number;
    modelVersion?: string;
    countryCode?: string;
    exportFormat?: BatchExportFormat;
    outputPath?: string;
}
