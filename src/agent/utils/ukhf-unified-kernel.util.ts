/**
 * UKHFS forward operator — 𝓕_{Kθ}(Φ, mode); discrete realization of one COFT-EI 𝒪-step with matrix Kθ.
 *
 * Prefer `applyCausalOperatorField` at call sites when framing COFT-EI (operator field vocabulary).
 */

import type {
  CausalFieldSnapshot,
  CausalInteractionKernel,
  FieldDynamicsConfig,
} from '../contracts/multi-agent-causal-field.types';
import type { NeuralCausalGraphBundle } from '../contracts/neural-causal-graph-execution.types';
import type { UkhfExecDynamicsMode, UkhfProjectionMode } from '../contracts/ukhf-field.types';
import { gnnDynamicsStep } from './neural-causal-graph-execution.util';

export interface UkhfKernelForwardOptions {
  /** EXEC only; ignored for SHADOW (always LINEAR_LAPLACIAN). Default MESSAGE_PASSING_STUB. */
  execDynamics?: UkhfExecDynamicsMode;
  mpStub?: { gamma?: number; residualMix?: number };
}

/**
 * 𝓕_{Kθ}(Φ_t, mode) → Φ_{t+1}.
 * SHADOW ≡ linear Laplacian; EXEC ≡ execDynamics (linear or message-passing stub).
 */
export function ukhfKernelForward(
  snapshot: CausalFieldSnapshot,
  kernel: CausalInteractionKernel,
  mode: UkhfProjectionMode,
  config: FieldDynamicsConfig,
  options?: UkhfKernelForwardOptions,
): CausalFieldSnapshot {
  if (mode === 'SHADOW') {
    const bundle: NeuralCausalGraphBundle = {
      kernel,
      dynamicsMode: 'LINEAR_LAPLACIAN',
      parameterVersion: 'ukhf/shadow/v1',
    };
    return gnnDynamicsStep(snapshot, bundle, config);
  }

  const execDynamics = options?.execDynamics ?? 'MESSAGE_PASSING_STUB';
  const bundle: NeuralCausalGraphBundle = {
    kernel,
    dynamicsMode: execDynamics,
    parameterVersion: 'ukhf/exec/v1',
  };
  const mp =
    execDynamics === 'MESSAGE_PASSING_STUB' ? options?.mpStub : undefined;
  return gnnDynamicsStep(snapshot, bundle, config, mp);
}
