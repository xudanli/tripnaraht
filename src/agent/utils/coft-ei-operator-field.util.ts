/**
 * COFT-EI — apply the causal operator field 𝒪_{Kθ} at state Φ with projection mode.
 *
 * Delegates to UKHF (`ukhfKernelForward`): same implementation path, explicit operator-field vocabulary.
 */

import type { CausalFieldSnapshot, CausalInteractionKernel, FieldDynamicsConfig } from '../contracts/multi-agent-causal-field.types';
import type { CausalOperatorFieldSpec } from '../contracts/coft-ei.types';
import type { UkhfProjectionMode } from '../contracts/ukhf-field.types';
import { ukhfKernelForward, type UkhfKernelForwardOptions } from './ukhf-unified-kernel.util';

/** Φ' = 𝒪_{Kθ}[Φ](mode) — one discrete step under current matrix-backed field. */
export function applyCausalOperatorField(
  field: CausalOperatorFieldSpec,
  phi: CausalFieldSnapshot,
  mode: UkhfProjectionMode,
  config: FieldDynamicsConfig,
  options?: UkhfKernelForwardOptions,
): CausalFieldSnapshot {
  return ukhfKernelForward(phi, field.causalKernel, mode, config, options);
}

export function causalOperatorFieldFromKernel(kernel: CausalInteractionKernel): CausalOperatorFieldSpec {
  return { causalKernel: kernel };
}
