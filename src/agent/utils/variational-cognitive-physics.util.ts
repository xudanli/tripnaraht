import type { ExecutionTrace, ExecutionTraceStep } from '../contracts/execution-trace.types';
import type { VariationalCognitivePhysicsSnapshot } from '../contracts/variational-cognitive-physics.types';
import { VCPO_SCHEMA_VERSION } from '../contracts/variational-cognitive-physics.types';
import {
  listSegmentMetricEnergies,
  traceToTrajectory,
} from './information-geometry.util';

export const DEFAULT_VCPO_LAMBDA_ENTROPY = 0.62;

/** Entropy density proxy S at a trace step (high ⇒ exploratory / branching cost). */
export function stepEntropyDensity(step: ExecutionTraceStep): number {
  switch (step.type) {
    case 'ECPS_EVAL':
      return 0.08;
    case 'ENGINE_SELECT':
      return 0.12;
    case 'TOOL_CALL':
      return 0.48;
    case 'STATE_TRANSITION':
      return 0.36;
    case 'REACT_THOUGHT':
      return 0.52;
    case 'ARTIFACT_READ':
      return 0.05;
    case 'ARTIFACT_WRITE':
      return 0.28;
    default: {
      const _e: never = step.type;
      return _e;
    }
  }
}

/** Work / utility density W — productive reuse vs costly cognition. */
export function stepWorkDensity(step: ExecutionTraceStep): number {
  switch (step.type) {
    case 'ARTIFACT_READ':
      return 0.92;
    case 'ECPS_EVAL':
      return 0.35;
    case 'ENGINE_SELECT':
      return 0.22;
    case 'TOOL_CALL':
      return 0.18;
    case 'STATE_TRANSITION':
      return 0.25;
    case 'REACT_THOUGHT':
      return 0.15;
    case 'ARTIFACT_WRITE':
      return 0.4;
    default: {
      const _e: never = step.type;
      return _e;
    }
  }
}

/**
 * Lagrangian density L = E + λ S − W (user VCPO ansatz), all local proxies ∈ ℝ⁺ where applicable.
 * E is metric segment energy from IGL (kinetic / execution cost geometry).
 */
export function lagrangianDensity(params: {
  metricEnergy: number;
  entropyDensity: number;
  workDensity: number;
  lambdaEntropy: number;
}): number {
  const { metricEnergy, entropyDensity, workDensity, lambdaEntropy } = params;
  return metricEnergy + lambdaEntropy * entropyDensity - workDensity;
}

function discreteElResidual(Ls: number[]): number {
  if (Ls.length < 3) return 0;
  let acc = 0;
  for (let k = 1; k < Ls.length - 1; k++) {
    acc += Math.abs(Ls[k + 1] - 2 * Ls[k] + Ls[k - 1]);
  }
  return acc / (Ls.length - 2);
}

/**
 * Discrete 𝒮[τ] along sealed ETK — couples IGL metric edges with CTL-style S,W proxies per step.
 */
export function computeVariationalCognitivePhysicsSnapshot(params: {
  trace: ExecutionTrace;
  lambdaEntropy?: number;
}): VariationalCognitivePhysicsSnapshot {
  const λ = params.lambdaEntropy ?? DEFAULT_VCPO_LAMBDA_ENTROPY;
  const traj = traceToTrajectory(params.trace);
  const E_edges = listSegmentMetricEnergies(traj);
  const steps = params.trace.steps;

  if (E_edges.length === 0 || steps.length === 0) {
    return {
      schema_version: VCPO_SCHEMA_VERSION,
      lambda_entropy: λ,
      discrete_action: 0,
      mean_lagrangian_density: 0,
      euler_lagrange_residual_proxy: 0,
      segment_count: E_edges.length,
    };
  }

  const Ls: number[] = [];
  const n = Math.min(E_edges.length, steps.length);
  for (let k = 0; k < n; k++) {
    const step = steps[k];
    if (!step) break;
    Ls.push(
      lagrangianDensity({
        metricEnergy: E_edges[k],
        entropyDensity: stepEntropyDensity(step),
        workDensity: stepWorkDensity(step),
        lambdaEntropy: λ,
      }),
    );
  }

  let discrete_action = 0;
  for (const L of Ls) discrete_action += L;

  const mean_lagrangian_density = Ls.length > 0 ? discrete_action / Ls.length : 0;

  return {
    schema_version: VCPO_SCHEMA_VERSION,
    lambda_entropy: λ,
    discrete_action,
    mean_lagrangian_density,
    euler_lagrange_residual_proxy: discreteElResidual(Ls),
    segment_count: Ls.length,
  };
}
