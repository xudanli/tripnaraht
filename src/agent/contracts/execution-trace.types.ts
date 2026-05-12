/**
 * Execution Trace Kernel (ETK) — deterministic reconstruction substrate (not generic logs).
 *
 * ECPS answers “why”; ETK answers “how” and enables replay correctness / policy audit.
 */

import type { ArtifactReplayConfidence } from './artifact-replay-confidence.types';
import type { ExecutionDecision, ExecutionEngineType } from './execution-control-policy.types';
import type { ReplayProvenance } from './replay-provenance.types';
import type { RuntimeExecutionAnomaly } from './runtime-execution-profile.validation.types';

export type ExecutionTraceStepType =
  | 'ECPS_EVAL'
  | 'ENGINE_SELECT'
  | 'TOOL_CALL'
  | 'STATE_TRANSITION'
  | 'REACT_THOUGHT'
  | 'ARTIFACT_READ'
  | 'ARTIFACT_WRITE';

export interface ExecutionTraceStep {
  stepId: string;
  type: ExecutionTraceStepType;
  input: unknown;
  output: unknown;
  metadata?: {
    toolName?: string;
    latencyMs?: number;
    confidence?: number;
  };
}

/** Closed execution record suitable for reconstruction / audit (append-only emission during run). */
export interface ExecutionTrace {
  traceId: string;
  artifactId: string;
  decision: ExecutionDecision;
  /** Legacy runner tier — projection from `decision.kernel` for dashboards / adapters (not an ECPS axis). */
  engine: ExecutionEngineType;
  steps: ExecutionTraceStep[];
  provenance: ReplayProvenance;
  confidence: ArtifactReplayConfidence;
  anomalies: RuntimeExecutionAnomaly[];
  timestamp: number;
}
