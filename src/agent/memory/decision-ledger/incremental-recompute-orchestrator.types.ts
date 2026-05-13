import type { DecisionLedgerSnapshot } from './decision-ledger.types';
import type { RecomputeDriftContextV1 } from './recompute-payload.types';

export type ReconcileStatusV1 =
  | 'CONVERGED'
  | 'ESCALATED'
  | 'ESCALATED_HARD_CONSTRAINT'
  | 'IDLE'
  | 'NO_LEDGER'
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_ERROR'
  | 'SCHEMA_VIOLATION'
  | 'PARSE_ERROR'
  | 'PERSIST_SKIPPED';

export interface IncrementalReconcileOptionsV1 {
  maxRetries?: number;
  driftContext?: RecomputeDriftContextV1[];
}

export interface ReconcileResultV1 {
  status: ReconcileStatusV1;
  trace: string[];
  reason?: string;
  errors?: string[];
  parseError?: string;
  finalLedger?: DecisionLedgerSnapshot | null;
  snapshotVersion?: number;
}
