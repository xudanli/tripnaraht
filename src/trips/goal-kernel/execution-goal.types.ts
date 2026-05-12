/**
 * P16-A — Execution Goal Kernel: autonomous goal injection (no new VM bytecode — orchestration only).
 */

export type ExecutionGoalType =
  | 'OPTIMIZE_EXPERIENCE'
  | 'REDUCE_RISK'
  | 'EXPLORE_AURORA'
  | 'MINIMIZE_COST'
  | 'IMPROVE_STABILITY';

export type ExecutionGoalSource = 'MEMORY' | 'CONSTRAINT_PRESSURE' | 'ENVIRONMENT_SIGNAL';

export interface ExecutionGoal {
  id: string;
  type: ExecutionGoalType;
  /** Higher = more urgent [0,1]. */
  priority: number;
  source: ExecutionGoalSource;
  /** Audit-only payload — producers set shape; consumers narrow. */
  triggerContext: unknown;
}
