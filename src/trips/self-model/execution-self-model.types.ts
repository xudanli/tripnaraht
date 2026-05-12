/**
 * P18 — Execution Self-Model: bounded introspection state for reflection (no runtime ML).
 *
 * Guardrails (caller-enforced): proposals should be queued → shadow replay (e.g. P17) → promote;
 * merge via `applySelfUpdates` with drift budget + shadow-approved ids.
 */

export interface ExecutionFailure {
  id: string;
  phase: 'VM' | 'PROOF' | 'NEPTUNE' | 'POLICY';
  code: string;
  detail?: string;
}

export interface DivergencePattern {
  id: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Observable metric snapshot — opaque to storage. */
  metrics: Record<string, number>;
}

export interface CompilerDriftSignal {
  id: string;
  kind: 'STEP_ORDER' | 'CHECK_DENSITY' | 'PATCH_FREQUENCY';
  magnitude: number;
}

export interface ExecutionSelfModel {
  version: string;
  observedFailures: ExecutionFailure[];
  divergencePatterns: DivergencePattern[];
  strategyWeights: Record<string, number>;
  compilerDriftSignals: CompilerDriftSignal[];
}

export type SelfUpdateProposal =
  | {
      id: string;
      type: 'DAG_WEIGHT_DRIFT';
      target: string;
      proposedDelta: number;
      confidence: number;
      rationale: string;
    }
  | {
      id: string;
      type: 'IR_STEP_REDUCTION';
      target: string;
      action: 'REMOVE_OR_DELAY';
      confidence: number;
      rationale: string;
    }
  | {
      id: string;
      type: 'REPAIR_THRESHOLD_SHIFT';
      target: string;
      delta: number;
      confidence: number;
      rationale: string;
    };
