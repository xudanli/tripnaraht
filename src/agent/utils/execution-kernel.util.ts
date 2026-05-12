import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type {
  ExecutionKernel,
  ExecutionStateFeatures,
  ExecutionToolDepth,
} from '../contracts/execution-semantic-field.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * ECPS kernel rule: ℝ⁴ feature chart → discrete kernel (single semantic authority).
 *
 * WORKFLOW_KERNEL is gated by determinism so “full tool depth” (HIGH) still routes to
 * react-style reasoning unless the run is structurally convergent (cf. state-machine paths).
 */
export function kernelFromSemanticField(f: ExecutionStateFeatures): ExecutionKernel {
  const td = f.toolDepth;
  if (f.intensity < 0.3) return 'REFLEX_KERNEL';
  if (f.entropy < 0.4) return 'LIGHTWEIGHT_KERNEL';
  if (td === 'HIGH' && f.determinism >= 0.58) return 'WORKFLOW_KERNEL';
  return 'REASONING_KERNEL';
}

/**
 * Derive continuous features from control context + resolved ECPS branches.
 */
export function deriveExecutionStateFeatures(params: {
  ctx: ExecutionControlContext;
  mode: ExecutionDecision['mode'];
  confidenceBand: ExecutionControlContext['replayConfidence']['band'];
  toolDepth: ExecutionToolDepth;
}): ExecutionStateFeatures {
  const { ctx, mode, confidenceBand, toolDepth } = params;

  let intensity = 0.55;
  if (mode === 'REUSE') intensity = 0.12;
  else if (mode === 'VALIDATE') intensity = 0.42;
  else if (mode === 'RECOMPUTE') intensity = 0.84;
  if (confidenceBand === 'INVALID') intensity = 0.97;
  else if (confidenceBand === 'LOW') intensity = clamp01(intensity + 0.12);

  if (toolDepth === 'HIGH') intensity = clamp01(intensity + 0.15);
  else if (toolDepth === 'MEDIUM') intensity = clamp01(intensity + 0.08);

  let entropy = clamp01(ctx.anomalies.length * 0.14 + (confidenceBand === 'LOW' ? 0.22 : 0));
  if (confidenceBand === 'INVALID') entropy = clamp01(entropy + 0.38);
  if (toolDepth === 'HIGH') entropy = clamp01(entropy + 0.18);
  else if (toolDepth === 'LOW' || toolDepth === 'MEDIUM') entropy = clamp01(entropy + 0.08);

  let determinism = mode === 'REUSE' ? 0.93 : mode === 'VALIDATE' ? 0.66 : 0.38;
  if (ctx.replayEligibility === 'FULL') determinism = clamp01(determinism + 0.06);
  if (confidenceBand === 'HIGH') determinism = clamp01(determinism + 0.05);
  if (ctx.modeHint === 'CLAUDE_SM' && toolDepth === 'HIGH') {
    determinism = clamp01(determinism + 0.22);
  }

  return {
    intensity: clamp01(intensity),
    entropy: clamp01(entropy),
    determinism: clamp01(determinism),
    toolDepth,
  };
}

export function buildExecutionDecision(params: {
  ctx: ExecutionControlContext;
  mode: ExecutionDecision['mode'];
  confidenceGate: ExecutionDecision['confidenceGate'];
  toolDepth: ExecutionToolDepth;
  reuseArtifact?: boolean;
  invalidationScope: ExecutionDecision['invalidationScope'];
}): ExecutionDecision {
  const features = deriveExecutionStateFeatures({
    ctx: params.ctx,
    mode: params.mode,
    confidenceBand: params.confidenceGate,
    toolDepth: params.toolDepth,
  });
  const kernel = kernelFromSemanticField(features);
  return {
    mode: params.mode,
    kernel,
    features,
    toolDepth: params.toolDepth,
    reuseArtifact: params.reuseArtifact,
    invalidationScope: params.invalidationScope,
    confidenceGate: params.confidenceGate,
  };
}
