/**
 * Execution Control Policy Surface (ECPS) — single policy plane over routing, replay, tools, cache.
 *
 * Inputs: runtime signals; single output: ExecutionDecision (future: policy DSL / compiler).
 */

import type { ArtifactReplayConfidence } from './artifact-replay-confidence.types';
import type { ReplayEligibilityClass } from './replay-artifact-kinds.types';
import type { ReplayProvenance } from './replay-provenance.types';
import type { RuntimeExecutionAnomaly } from './runtime-execution-profile.validation.types';
import type { WorldFreshnessVector } from './world-freshness.types';
import type { RouteType } from '../interfaces/router.interface';
import type {
  ExecutionKernel,
  ExecutionStateFeatures,
  ExecutionToolDepth,
} from './execution-semantic-field.types';

/** All runtime signals fed into the unified decision (best-effort; partial OK). */
export interface ExecutionControlContext {
  artifactId: string;
  replayConfidence: ArtifactReplayConfidence;
  replayEligibility: ReplayEligibilityClass;
  anomalies: RuntimeExecutionAnomaly[];
  freshness: WorldFreshnessVector;
  provenance: ReplayProvenance;
  routeHint?: RouteType | string;
  modeHint?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
  /**
   * Bridges pre-policy env flags into pure `decideExecution` without turning core logic into config soup.
   * @deprecated Prefer policy DSL once ExecutionPolicyCompiler lands.
   */
  policyOverrides?: ExecutionControlPolicyOverrides;
}

export interface ExecutionControlPolicyOverrides {
  /** When true, MEDIUM band may short-circuit to reuse (legacy dedup compatibility). */
  allowMediumDedupReplay?: boolean;
}

/**
 * @deprecated Legacy runner tier — **observability / adapter labels only**.
 * ECPS commits to `ExecutionKernel`; map with `projectKernelToLegacyTier`.
 */
export type ExecutionEngineType =
  | 'SYSTEM1'
  | 'SYSTEM2_REACT'
  | 'SYSTEM2_STATE_MACHINE'
  | 'LIGHTWEIGHT_QA';

/** Single execution plan emitted by ECPS — continuous field + discrete kernel (no SYSTEM1/2 as axes). */
export interface ExecutionDecision {
  mode: 'REUSE' | 'VALIDATE' | 'RECOMPUTE';
  kernel: ExecutionKernel;
  features: ExecutionStateFeatures;
  toolDepth: ExecutionToolDepth;
  reuseArtifact?: boolean;
  invalidationScope: 'NONE' | 'PARTIAL' | 'FULL';
  confidenceGate: ArtifactReplayConfidence['band'];
}
