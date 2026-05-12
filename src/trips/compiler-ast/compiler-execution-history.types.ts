/**
 * Minimal history slice for compiler synthesis — map from P13 memory / VM batches.
 */

export interface CompilerExecutionHistoryEntry {
  label?: string;
  vmOk: boolean;
  /** Average or aggregate CHECK failures for this run — optional. */
  checkFailureCount?: number;
  /** Heuristic: DAG subgraph often folded to same IR shape. */
  recurringSubgraphCollapses?: boolean;
}
