export type ModelType = 'SFT' | 'RLHF' | 'RL' | 'DPO' | 'PPO';
export type BaseModel = 'claude-3-opus' | 'claude-3-sonnet' | 'claude-3-haiku' | 'gpt-4-turbo' | 'gpt-4o' | 'gpt-4o-mini' | 'llama-3-70b' | 'llama-3-8b' | 'mistral-large' | 'mistral-medium' | 'qwen-72b' | 'deepseek-v2' | 'custom';
export declare const MODEL_TYPE_OPTIONS: {
    value: ModelType;
    label: string;
    description: string;
}[];
export declare const BASE_MODEL_OPTIONS: {
    value: BaseModel;
    label: string;
    provider: string;
}[];
export interface ModelConfig {
    model_type: ModelType;
    base_model?: BaseModel;
    custom_model_path?: string;
    architecture?: Record<string, any>;
    tokenizer?: string;
}
export interface TrainingConfig {
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
}
export interface HyperparameterSearchSpace {
    learning_rate: {
        type: 'loguniform';
        low: number;
        high: number;
    };
    batch_size: {
        type: 'choice';
        values: number[];
    };
    num_epochs: {
        type: 'int';
        low: number;
        high: number;
    };
    weight_decay?: {
        type: 'uniform';
        low: number;
        high: number;
    };
}
export interface TrainingMetrics {
    loss: number;
    reward?: number;
    accuracy?: number;
    perplexity?: number;
    learning_rate: number;
    epoch: number;
    step: number;
    timestamp: string;
    [key: string]: any;
}
export interface ModelVersion {
    version: string;
    model_path: string;
    mlflow_run_id?: string;
    mlflow_model_uri?: string;
    training_metrics: TrainingMetrics;
    eval_metrics?: Record<string, number>;
    training_config: TrainingConfig;
    model_config: ModelConfig;
    dataset_version?: string;
    created_at: string;
    status: 'TRAINING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
}
export interface TrainingJob {
    job_id: string;
    dataset_version: string;
    model_config: ModelConfig;
    training_config: TrainingConfig;
    hyperparameter_search?: {
        enabled: boolean;
        search_space: HyperparameterSearchSpace;
        num_trials?: number;
    };
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    created_at: string;
    started_at?: string;
    completed_at?: string;
    model_version?: ModelVersion;
    error?: string;
    ray_job_id?: string;
    mlflow_run_id?: string;
}
export interface HyperparameterTuningResult {
    best_trial: {
        config: TrainingConfig;
        metrics: TrainingMetrics;
        trial_id: string;
    };
    all_trials: Array<{
        trial_id: string;
        config: TrainingConfig;
        metrics: TrainingMetrics;
    }>;
    search_space: HyperparameterSearchSpace;
}
export interface ModelRegistryEntry {
    version: string;
    model_path: string;
    mlflow_model_uri: string;
    training_metrics: TrainingMetrics;
    eval_metrics?: Record<string, number>;
    training_config: TrainingConfig;
    model_config: ModelConfig;
    dataset_version?: string;
    created_at: string;
    is_production: boolean;
    is_staging: boolean;
}
export interface PolicyInferenceRequest {
    request_id: string;
    state: {
        user_request: string;
        origin?: string | {
            lat: number;
            lng: number;
        };
        destination?: string | {
            lat: number;
            lng: number;
        };
        constraints?: Record<string, any>;
        preferences?: Record<string, any>;
        research_data?: Record<string, any>;
    };
    model_version?: string;
    experiment_id?: string;
}
export interface PolicyInferenceResponse {
    action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'CLARIFY';
    confidence: number;
    reasoning?: string;
    model_version: string;
    latency_ms: number;
    metadata?: Record<string, any>;
}
export interface PolicyServiceHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    model_loaded: boolean;
    current_model_version?: string;
    fallback_model_version?: string;
    qps: number;
    p95_latency_ms: number;
    error_rate: number;
    uptime_seconds: number;
}
export interface PolicyServiceMetrics {
    qps: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
    error_rate: number;
    total_requests: number;
    total_errors: number;
    model_versions: Record<string, {
        requests: number;
        errors: number;
        avg_latency_ms: number;
    }>;
}
