/**
 * P8-2-A/B Execution IR — frozen compile target from ExecutionTruthDAG.
 * **唯一合法构造路径**：`compileDAGToIR`（`meta.source === DAG_COMPILER`）。
 */

/** Canonical stamp values — use with {@link ExecutionIRSource} string union. */
export const ExecutionIRSources = {
  DAG_COMPILER: 'DAG_COMPILER',
} as const;

export type ExecutionIRSource =
  (typeof ExecutionIRSources)[keyof typeof ExecutionIRSources];

export interface ExecutionIRMeta {
  source: ExecutionIRSource;
  dagId: string;
  /** Epoch ms at compile time — audit / replay; steps + dagId remain structurally deterministic. */
  compiledAt: number;
  deterministic: true;
}

export type ExecutionIRMetric = 'delay' | 'risk' | 'reliability';

export type ExecutionIRPatchOp = 'WEIGHT_ADJUST' | 'RE_ROUTE';

export type ExecutionIRStep =
  | { type: 'CHECK'; nodeId: string }
  | { type: 'PROJECT'; nodeId: string; metric: ExecutionIRMetric }
  | { type: 'TRAVERSE'; edgeId: string; cost: number }
  | { type: 'PATCH'; edgeId: string; op: ExecutionIRPatchOp };

export interface ExecutionIR {
  version: '1';
  meta: ExecutionIRMeta;
  steps: ExecutionIRStep[];
}
