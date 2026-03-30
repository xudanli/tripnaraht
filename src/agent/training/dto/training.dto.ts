// src/agent/training/dto/training.dto.ts

import {
  ModelType,
  BaseModel,
  TrainingType,
  SEVLevel,
  RiskCategory,
  RiskHandleAction,
  UserActionType,
  DecisionType,
  EvidenceType,
  Language,
} from '../interfaces/enums.interface';

/**
 * 创建训练任务请求 DTO
 */
export class CreateTrainingJobDto {
  dataset_version!: string;
  model_config!: {
    model_type: ModelType;
    base_model: BaseModel;
    custom_model_path?: string;
    architecture?: Record<string, any>;
    tokenizer?: string;
  };
  training_config!: {
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

/**
 * 分级风险事件请求 DTO
 */
export class ClassifyRiskEventDto {
  request_id!: string;
  violations!: any[];
  category!: RiskCategory;
  description!: string;
}

/**
 * 处置风险事件请求 DTO
 */
export class HandleRiskEventDto {
  action!: RiskHandleAction;
  resolved_by!: string;
  mitigation_details?: string;
}

/**
 * 记录审计请求 DTO
 */
export class RecordAuditDto {
  request_id!: string;
  decision_type!: DecisionType;
  decision_result!: string;
  constraint_check_result!: any;
  context!: {
    user_input: string;
    planning_request: Record<string, any>;
    model_version: string;
    experiment_id?: string;
  };
  evidence_chain?: EvidenceType[];
}

/**
 * 追踪用户行为请求 DTO
 */
export class TrackUserActionDto {
  user_id?: string;
  action_type!: UserActionType;
  context!: {
    request_id: string;
    plan_id?: string;
    decision_id?: string;
    metadata?: Record<string, any>;
  };
  metadata?: Record<string, any>;
}

/**
 * 创建 A/B 测试请求 DTO
 */
export class CreateABTestDto {
  name!: string;
  description!: string;
  variants!: Array<{
    name: string;
    model_version: string;
    traffic_percentage: number;
  }>;
  metrics!: string[];
  start_date?: string;
  end_date?: string;
}

/**
 * 训练 Reward Model 请求 DTO
 */
export class TrainRewardModelDto {
  training_type!: TrainingType;
  data!: any[];
  config?: any;
}

/**
 * 获取澄清问题模板请求 DTO (Query)
 */
export class GetClarificationPromptDto {
  scenario?: string;
  missing_field?: string;
  language?: Language;
}

/**
 * 获取风险提示模板请求 DTO (Query)
 */
export class GetRiskPromptDto {
  sev_level?: SEVLevel;
  category?: RiskCategory;
  reason?: string;
  language?: Language;
}

/**
 * 获取季节性风险请求 DTO
 */
export class GetSeasonalRisksDto {
  destination?: string;
  month?: number;
}

/**
 * 获取红线规则请求 DTO
 */
export class GetRedLineRulesDto {
  destination?: string;
}

/**
 * 列出红队测试用例请求 DTO
 */
export class ListRedTeamTestCasesDto {
  category?: RiskCategory;
}

/**
 * 导出轨迹格式枚举
 */
export type ExportFormat = 'jsonl' | 'json' | 'parquet';

/**
 * 导出轨迹请求 DTO
 */
export class ExportTrajectoriesDto {
  trajectory_ids?: string[];
  request_ids?: string[];
  min_validation_score?: number;
  min_total_reward?: number;
  model_version?: string;
  country_code?: string;
  date_range?: { start: string; end: string };
  format?: ExportFormat;
}

/**
 * 批量处理任务导出格式枚举
 */
export type BatchExportFormat = 'jsonl' | 'json' | 'both' | 'none';

/**
 * 创建批量处理任务请求 DTO
 */
export class CreateBatchTaskDto {
  minScore?: number;
  minReward?: number;
  maxUsageCount?: number;
  batchSize?: number;
  modelVersion?: string;
  countryCode?: string;
  exportFormat?: BatchExportFormat;
  outputPath?: string;
}
