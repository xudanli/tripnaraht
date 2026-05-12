/**
 * Decision Trace：规划执行图谱（非原始 log），用于可解释性与后续学习闭环。
 */

export type DecisionNodeType =
  | 'INTENT'
  | 'CANDIDATE_FILTER'
  | 'LLM_SCORE'
  | 'ALGO_SCORE'
  | 'CONVERGENCE'
  | 'GATE'
  | 'SIMULATION'
  | 'REPAIR'
  | 'FINAL_SLOT';

export type DecisionTraceEngine = 'LLM' | 'ALGO' | 'SOLVER' | 'SYSTEM' | 'HYBRID';

export interface DecisionNode {
  nodeId: string;
  type: DecisionNodeType;
  day?: number;
  slot?: string;
  input: unknown;
  output: unknown;
  engine?: DecisionTraceEngine;
  metrics?: {
    score?: number;
    confidence?: number;
  };
}

export type DecisionEdgeCause =
  | 'constraint_filter'
  | 'score_compare'
  | 'simulation_fail'
  | 'user_patch'
  | 'engine_override'
  | 'pipeline_next';

export interface DecisionEdge {
  from: string;
  to: string;
  cause: DecisionEdgeCause;
}

export interface DecisionTraceSummary {
  /** 0–1，按槽位裁决来源统计的相对影响 */
  llmInfluence: number;
  algoInfluence: number;
  /** Solver / 约束骨架注入时的占位权重（可后续细化为真实分数） */
  solverInfluence: number;
  totalConflicts: number;
  repairedCount: number;
}

export interface DecisionTrace {
  traceId: string;
  tripId: string;
  version: number;
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  summary: DecisionTraceSummary;
}
