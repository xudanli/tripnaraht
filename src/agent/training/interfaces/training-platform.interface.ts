// src/agent/training/interfaces/training-platform.interface.ts

/**
 * 训练平台相关接口定义
 */

/**
 * 模型类型枚举
 */
export type ModelType = 'SFT' | 'RLHF' | 'RL' | 'DPO' | 'PPO';

/**
 * 基础模型枚举
 */
export type BaseModel = 
  | 'claude-3-opus'
  | 'claude-3-sonnet'
  | 'claude-3-haiku'
  | 'gpt-4-turbo'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'llama-3-70b'
  | 'llama-3-8b'
  | 'mistral-large'
  | 'mistral-medium'
  | 'qwen-72b'
  | 'deepseek-v2'
  | 'custom'; // 自定义模型

/**
 * 模型类型选项（用于前端下拉框）
 */
export const MODEL_TYPE_OPTIONS: { value: ModelType; label: string; description: string }[] = [
  { value: 'SFT', label: 'SFT (Supervised Fine-Tuning)', description: '监督微调，适用于基础任务学习' },
  { value: 'RLHF', label: 'RLHF (RL from Human Feedback)', description: '人类反馈强化学习，提升对齐能力' },
  { value: 'RL', label: 'RL (Reinforcement Learning)', description: '纯强化学习，基于奖励信号优化' },
  { value: 'DPO', label: 'DPO (Direct Preference Optimization)', description: '直接偏好优化，简化RLHF流程' },
  { value: 'PPO', label: 'PPO (Proximal Policy Optimization)', description: '近端策略优化，稳定训练' },
];

/**
 * 基础模型选项（用于前端下拉框）
 */
export const BASE_MODEL_OPTIONS: { value: BaseModel; label: string; provider: string }[] = [
  { value: 'claude-3-opus', label: 'Claude 3 Opus', provider: 'Anthropic' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', provider: 'Anthropic' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku', provider: 'Anthropic' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'OpenAI' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI' },
  { value: 'llama-3-70b', label: 'Llama 3 70B', provider: 'Meta' },
  { value: 'llama-3-8b', label: 'Llama 3 8B', provider: 'Meta' },
  { value: 'mistral-large', label: 'Mistral Large', provider: 'Mistral' },
  { value: 'mistral-medium', label: 'Mistral Medium', provider: 'Mistral' },
  { value: 'qwen-72b', label: 'Qwen 72B', provider: 'Alibaba' },
  { value: 'deepseek-v2', label: 'DeepSeek V2', provider: 'DeepSeek' },
  { value: 'custom', label: '自定义模型', provider: 'Custom' },
];

/**
 * 模型配置
 */
export interface ModelConfig {
  model_type: ModelType;
  base_model?: BaseModel;
  custom_model_path?: string; // 当 base_model 为 'custom' 时使用
  architecture?: Record<string, any>; // 模型架构配置
  tokenizer?: string; // Tokenizer配置
}

/**
 * 训练配置
 */
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

/**
 * 超参数搜索空间
 */
export interface HyperparameterSearchSpace {
  learning_rate: { type: 'loguniform'; low: number; high: number };
  batch_size: { type: 'choice'; values: number[] };
  num_epochs: { type: 'int'; low: number; high: number };
  weight_decay?: { type: 'uniform'; low: number; high: number };
}

/**
 * 训练指标
 */
export interface TrainingMetrics {
  loss: number;
  reward?: number;
  accuracy?: number;
  perplexity?: number;
  learning_rate: number;
  epoch: number;
  step: number;
  timestamp: string;
  [key: string]: any; // 其他自定义指标
}

/**
 * 模型版本
 */
export interface ModelVersion {
  version: string; // 语义化版本号（如"v1.0.0"）
  model_path: string; // 模型文件路径
  mlflow_run_id?: string; // MLflow run ID
  mlflow_model_uri?: string; // MLflow model URI
  training_metrics: TrainingMetrics;
  eval_metrics?: Record<string, number>; // 评测指标
  training_config: TrainingConfig;
  model_config: ModelConfig;
  dataset_version?: string; // 数据集版本
  created_at: string; // ISO 8601
  status: 'TRAINING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
}

/**
 * 训练任务
 */
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
  ray_job_id?: string; // Ray job ID
  mlflow_run_id?: string; // MLflow run ID
}

/**
 * 超参数调优结果
 */
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

/**
 * 模型注册信息
 */
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
  is_production: boolean; // 是否生产版本
  is_staging: boolean; // 是否预发布版本
}

/**
 * PolicyService推理请求
 */
export interface PolicyInferenceRequest {
  request_id: string;
  state: {
    user_request: string;
    origin?: string | { lat: number; lng: number };
    destination?: string | { lat: number; lng: number };
    constraints?: Record<string, any>;
    preferences?: Record<string, any>;
    research_data?: Record<string, any>;
  };
  model_version?: string; // 指定模型版本（用于A/B测试）
  experiment_id?: string; // 实验ID（用于A/B测试）
}

/**
 * PolicyService 推理响应。
 * `action` 与编排 Gate（`GateResultStatus`）、对外 Verdict 的映射见 `docs/decision/VERDICT_GATE_POLICY_MAPPING.md`。
 */
export interface PolicyInferenceResponse {
  action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'CLARIFY';
  confidence: number; // 0..1
  reasoning?: string;
  model_version: string;
  latency_ms: number;
  metadata?: Record<string, any>;
}

/**
 * PolicyService健康状态
 */
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

/**
 * PolicyService指标
 */
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
