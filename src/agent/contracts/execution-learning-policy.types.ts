/**
 * Learning ECPS — stochastic execution policy πθ(state) → action distributions.
 *
 * Rule-based ECPS remains the default baseline; learned heads attach via the same factorized
 * distribution surface (kernel, tool depth, continuous semantic scalars).
 */

import type { ArtifactReplayConfidence } from './artifact-replay-confidence.types';
import type { ExecutionDecision } from './execution-control-policy.types';
import type { ExecutionKernel, ExecutionToolDepth } from './execution-semantic-field.types';

/** Fixed discrete support for kernel categorical π(kernel | state). */
export type KernelPMF = Record<ExecutionKernel, number>;

/** Fixed discrete support for tool-depth categorical π(toolDepth | state). */
export type ToolDepthPMF = Record<ExecutionToolDepth, number>;

/** Truncated Gaussian on [0,1] for intensity / entropy / determinism marginals. */
export interface TruncatedGaussianMarginal {
  kind: 'truncated_gaussian';
  mean: number;
  std: number;
}

export interface FactorizedExecutionPolicyDistribution {
  kernel: KernelPMF;
  toolDepth: ToolDepthPMF;
  intensity: TruncatedGaussianMarginal;
  entropy: TruncatedGaussianMarginal;
  determinism: TruncatedGaussianMarginal;
}

/**
 * Policy network input — embeddings may be learned later; structured scalars always available.
 */
export interface ECPSPolicyState {
  replayConfidence: ArtifactReplayConfidence;
  /** Low-dimensional anomaly encoding (hash features / counts); expandable to encoder output. */
  anomalyVector: number[];
  /** Serialized freshness / drift coordinates. */
  freshnessVector: number[];
  /** Optional provenance embedding (zeros until encoder exists). */
  provenanceEmbedding: number[];
  /** Optional route / intent embedding (zeros until encoder exists). */
  routeEmbedding: number[];
}

/** One draw from πθ — continuous coords + discrete heads (after sampling). */
export interface SampledExecutionSemantic {
  kernel: ExecutionKernel;
  toolDepth: ExecutionToolDepth;
  intensity: number;
  entropy: number;
  determinism: number;
}

/** RNG contract — inject for tests / deterministic replay of samples. */
export type PolicyRNG = () => number;

export interface StochasticPolicyRolloutMeta {
  /** Degenerate rule baseline vs learned checkpoint id. */
  policyVersion?: string;
  /** Optional seed string for audit. */
  sampleSeed?: string;
  /** Whether sampling was clamped (e.g. REUSE → reflex). */
  clampsApplied?: string[];
}

export interface FactorizedSampleResult {
  /** Decision after merge / clamps — feed to `ExecutionEngineRouterService`. */
  decision: ExecutionDecision;
  sample: SampledExecutionSemantic;
  meta: StochasticPolicyRolloutMeta;
}
