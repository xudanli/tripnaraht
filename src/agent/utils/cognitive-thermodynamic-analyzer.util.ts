import type { CognitiveThermodynamicSnapshot } from '../contracts/cognitive-thermodynamics.types';
import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { ExecutionTrace, ExecutionTraceStepType } from '../contracts/execution-trace.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function kernelEnergyShare(kernel: ExecutionDecision['kernel']): number {
  switch (kernel) {
    case 'REFLEX_KERNEL':
      return 0.12;
    case 'LIGHTWEIGHT_KERNEL':
      return 0.28;
    case 'WORKFLOW_KERNEL':
      return 0.42;
    case 'REASONING_KERNEL':
      return 0.48;
    default: {
      const _e: never = kernel;
      return _e;
    }
  }
}

function depthEnergyShare(depth: ExecutionDecision['toolDepth']): number {
  switch (depth) {
    case 'NONE':
      return 0;
    case 'LOW':
      return 0.12;
    case 'MEDIUM':
      return 0.22;
    case 'HIGH':
      return 0.38;
    default: {
      const _d: never = depth;
      return _d;
    }
  }
}

/**
 * Cognitive energy proxy E — latency wall-clock + ECPS kernel path + tool depth.
 */
export function estimateDeltaE(params: {
  latencyMs: number;
  decision: ExecutionDecision;
  latencyCapMs?: number;
}): number {
  const cap = params.latencyCapMs ?? 45_000;
  const normLat = clamp01(params.latencyMs / cap);
  const eng = kernelEnergyShare(params.decision.kernel);
  const dep = depthEnergyShare(params.decision.toolDepth);
  return clamp01(0.42 * normLat + 0.38 * eng + 0.2 * dep);
}

function uniqueStepTypes(trace: ExecutionTrace): number {
  const set = new Set<ExecutionTraceStepType>();
  for (const s of trace.steps) set.add(s.type);
  return set.size;
}

/**
 * Entropy proxy S_trace — branching/diversity + anomalies (ETK-measured disorder).
 */
export function estimateEntropyShare(params: {
  trace: ExecutionTrace;
  deviationCount: number;
}): number {
  const { trace, deviationCount } = params;
  const diversity = clamp01(uniqueStepTypes(trace) / 8);
  const anom = clamp01((trace.anomalies?.length ?? 0) * 0.18);
  const dev = clamp01(deviationCount * 0.22);
  return clamp01(0.38 * diversity + 0.35 * anom + 0.27 * dev);
}

/**
 * Work proxy W — reuse / stability wins entropy collapse; discounted by deviations.
 */
export function estimateWorkShare(params: {
  decision: ExecutionDecision;
  confidenceScore: number;
  deviationCount: number;
}): number {
  const modeBoost =
    params.decision.mode === 'REUSE' ? 0.72 : params.decision.mode === 'VALIDATE' ? 0.48 : 0.28;
  const conf = clamp01(params.confidenceScore);
  const devPenalty = clamp01(params.deviationCount * 0.12);
  return clamp01(modeBoost * (0.55 + 0.45 * conf) - devPenalty);
}

/**
 * ΔE = W + S + loss — partition normalized budget into work, entropy, dissipation.
 */
export function analyzeCognitiveThermodynamics(params: {
  trace: ExecutionTrace;
  latencyMs: number;
  decision: ExecutionDecision;
  deviationCount: number;
}): CognitiveThermodynamicSnapshot {
  const delta_e = estimateDeltaE({
    latencyMs: params.latencyMs,
    decision: params.decision,
  });

  let w_frac = estimateWorkShare({
    decision: params.decision,
    confidenceScore: params.trace.confidence.score,
    deviationCount: params.deviationCount,
  });
  let s_frac = estimateEntropyShare({
    trace: params.trace,
    deviationCount: params.deviationCount,
  });

  const sum = w_frac + s_frac;
  if (sum > 1) {
    const scale = 1 / sum;
    w_frac *= scale;
    s_frac *= scale;
  }
  const l_frac = 1 - w_frac - s_frac;

  const work = delta_e * w_frac;
  const entropy = delta_e * s_frac;
  const loss = delta_e * l_frac;

  const conservation_residual = Math.abs(delta_e - (work + entropy + loss));

  return {
    delta_e,
    work,
    entropy,
    loss,
    conservation_residual,
  };
}
