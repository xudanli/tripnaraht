/**
 * sft_then_dpo 两阶段串联 Pipeline 类型（Decision OS 自演进飞轮）。
 */

import type { DecisionTrajectoryTrainingPackStats } from './decision-trajectory-etl.types';

/** 与 FineTuneConfig 对齐的 pipeline 配置快照 */
export interface PipelineFineTuneConfig {
  model_name: string;
  lora_rank: number;
  lora_alpha: number;
  learning_rate: number;
  num_epochs: number;
  batch_size: number;
  dataset_name: string;
  training_stage?: 'sft' | 'dpo' | 'sft_then_dpo';
  dpo_dataset_path?: string;
  sft_dataset_path?: string;
  dpo_pair_types?: string[];
  dpo_rejected_sources?: string[];
  sft_num_epochs?: number;
  dpo_num_epochs?: number;
  sft_learning_rate?: number;
  dpo_learning_rate?: number;
}

export type SftThenDpoPipelineStage =
  | 'pending'
  | 'sft_running'
  | 'sft_completed'
  | 'dpo_running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SftThenDpoPipelineRun {
  task_id: string;
  stage: SftThenDpoPipelineStage;
  config: PipelineFineTuneConfig;
  created_at: string;
  updated_at: string;
  checkpoint_sft_final?: string;
  checkpoint_dpo_final?: string;
  production_adapter_path?: string;
  pack_stats?: DecisionTrajectoryTrainingPackStats;
  error?: string;
}

export interface SftThenDpoPipelineStatus extends SftThenDpoPipelineRun {
  python_status?: string;
  python_progress?: number;
  python_metrics?: Record<string, unknown>;
}
