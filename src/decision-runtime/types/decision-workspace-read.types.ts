export type DecisionWorkspaceReadSource =
  | 'gate1'
  | 'projection_hybrid'
  | 'projection_fallback';

export interface DecisionWorkspaceReadMeta {
  readModelSource: DecisionWorkspaceReadSource;
  projectionEnabled: boolean;
  replayValidation: boolean;
  tripId: string | null;
  projectionEventCount: number;
  reconciliationMatched: boolean | null;
  generatedAt: string;
  validationWarnings: string[];
}

export interface DecisionWorkspaceBundle {
  meta: DecisionWorkspaceReadMeta;
  conflicts: unknown[];
  candidates: unknown[];
  decisions: unknown[];
  readiness: unknown[];
  planBs: unknown[];
  outcome: unknown | null;
}
