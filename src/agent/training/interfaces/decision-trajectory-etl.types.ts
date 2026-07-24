/**
 * PR-C：decision_trajectories 离线 ETL 类型（与 validated_trajectories 正交）。
 */

import type { OrchestrationOutcomeKind } from './decision-trajectory.types';
import type { DecisionTrajectoryV1 } from './decision-trajectory.types';

export interface DecisionTrajectoryETLOptions {
  /** 主键 UUID */
  ids?: string[];
  request_ids?: string[];
  /** 默认 ['FINALIZED'] */
  statuses?: Array<'PENDING' | 'FINALIZED' | 'FAILED'>;
  orchestration_outcomes?: OrchestrationOutcomeKind[];
  min_total_reward?: number;
  /** 增量扫描：仅 updatedAt >= 此时间（ISO 8601） */
  updated_after?: string;
  date_range?: { start: string; end: string };
  limit?: number;
  offset?: number;
  /** 排除 CRITICAL_FAIL（不可训练） */
  exclude_critical_fail?: boolean;
}

export type DecisionTrajectoryETLRow = {
  id: string;
  requestId: string;
  tripId: string | null;
  status: string;
  totalReward: number | null;
  orchestrationOutcome: OrchestrationOutcomeKind | null;
  rewardSignals: unknown[];
  payload: DecisionTrajectoryV1;
  createdAt: Date;
  updatedAt: Date;
};

export type DpoPairKind = 'planner_obedience' | 'debate_narrator' | 'experience_flow_routing';

export type PlannerRejectedSource = 'true_topology' | 'violation_surrogate';

export interface DpoPreferenceJsonlRecord {
  prompt: string;
  chosen: string;
  rejected: string;
  trajectory_id: string;
  request_id: string;
  pair_type: DpoPairKind;
  /** PR-D：Planner 负样本来源 */
  rejected_source?: PlannerRejectedSource;
  /** Golden Path / 体验流路由离线样本元数据 */
  metadata?: {
    case_id?: string;
    source?: 'golden_path_harness' | 'decision_trajectory';
    experience_flow?: Record<string, unknown>;
    cgus_weights?: { w1: number; w2: number; beta: number };
    partial_replan?: { frozen_days: number[]; replan_from: number; replan_to: number };
  };
}

export type SftSampleFormat = 'alpaca' | 'sharegpt';

/** Alpaca 三字段 + ShareGPT conversations */
export interface SftRepairChainRecord {
  request_id: string;
  trajectory_id: string;
  format: SftSampleFormat;
  instruction: string;
  input: string;
  output: string;
  conversations?: Array<{ from: 'human' | 'gpt'; value: string }>;
  metadata: {
    orchestration_outcome: OrchestrationOutcomeKind | null;
    repair_steps: string[];
    triggered_axiom_ids?: string[];
  };
}

export interface DecisionTrajectoryTrainingPackStats {
  decision_trajectory_count: number;
  dpo_planner_obedience: number;
  dpo_planner_true_topology: number;
  dpo_planner_violation_surrogate: number;
  dpo_debate_narrator: number;
  sft_repair_chains: number;
}

export interface DecisionTrajectoryTrainingPackResult {
  dpo_jsonl_path: string;
  sft_alpaca_jsonl_path: string;
  sft_sharegpt_jsonl_path: string;
  stats: DecisionTrajectoryTrainingPackStats;
  exported_at: string;
}
